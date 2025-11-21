import k8sService from '../services/k8sService.js';
import atlasService from '../services/atlasService.js';

class TenantController {
  // Create a new tenant
  async createTenant(req, res) {
    try {
      const { tenantName, resourceQuota, createDatabase = true } = req.body;

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      // Validate tenant name (must be valid k8s namespace name)
      const nameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
      if (!nameRegex.test(tenantName)) {
        return res.status(400).json({
          error: 'Invalid tenant name. Must be lowercase alphanumeric with hyphens only'
        });
      }

      // Create namespace
      const namespace = await k8sService.createNamespace(tenantName, resourceQuota);

      const response = {
        message: 'Tenant created successfully',
        tenant: {
          name: namespace.metadata.name,
          createdAt: namespace.metadata.creationTimestamp
        }
      };

      // Automatically provision database if Atlas is configured and createDatabase is true
      if (createDatabase && atlasService.isConfigured()) {
        try {
          // Create database user in Atlas
          const dbUser = await atlasService.createDatabaseUser(tenantName);

          // Generate connection string
          const connectionString = atlasService.getConnectionString(
            dbUser.username,
            dbUser.password,
            dbUser.databaseName
          );

          // Store credentials in Kubernetes Secret
          const secretName = `${tenantName}-mongodb-secret`;
          await k8sService.createDatabaseSecret(
            tenantName,
            secretName,
            connectionString,
            dbUser.username,
            dbUser.password,
            dbUser.databaseName
          );

          response.database = {
            created: true,
            name: dbUser.databaseName,
            username: dbUser.username,
            secretName: secretName
          };
          response.message = 'Tenant and database created successfully';
        } catch (dbError) {
          console.error('Database creation failed:', dbError);
          response.database = {
            created: false,
            error: 'Database creation failed. You can create it manually later.',
            details: dbError.message
          };
        }
      } else if (createDatabase && !atlasService.isConfigured()) {
        response.database = {
          created: false,
          message: 'MongoDB Atlas not configured. Configure Atlas to enable automatic database provisioning.'
        };
      }

      res.status(201).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // List all tenants
  async listTenants(req, res) {
    try {
      const namespaces = await k8sService.listTenants();

      const tenants = namespaces.map(ns => ({
        name: ns.metadata.name,
        status: ns.status.phase,
        createdAt: ns.metadata.creationTimestamp,
        labels: ns.metadata.labels
      }));

      res.json({ tenants });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get tenant details
  async getTenant(req, res) {
    try {
      const { tenantName } = req.params;
      const details = await k8sService.getTenantDetails(tenantName);

      // Check database status
      const secretName = `${tenantName}-mongodb-secret`;
      const secret = await k8sService.getSecret(tenantName, secretName);

      let databaseInfo = { configured: false };
      if (secret) {
        const secretData = secret.data || {};
        const databaseName = secretData.MONGO_DATABASE
          ? Buffer.from(secretData.MONGO_DATABASE, 'base64').toString('utf-8')
          : null;
        const username = secretData.MONGO_USERNAME
          ? Buffer.from(secretData.MONGO_USERNAME, 'base64').toString('utf-8')
          : null;

        databaseInfo = {
          configured: true,
          name: databaseName,
          username: username,
          secretName: secretName,
          createdAt: secret.metadata?.creationTimestamp
        };
      }

      res.json({
        tenant: {
          name: details.namespace.metadata.name,
          status: details.namespace.status.phase,
          createdAt: details.namespace.metadata.creationTimestamp
        },
        database: databaseInfo,
        deployments: details.deployments.map(d => ({
          name: d.metadata.name,
          replicas: d.spec.replicas,
          availableReplicas: d.status.availableReplicas || 0,
          image: d.spec.template.spec.containers[0].image
        })),
        services: details.services.map(s => ({
          name: s.metadata.name,
          type: s.spec.type,
          ports: s.spec.ports
        })),
        pods: details.pods.map(p => ({
          name: p.metadata.name,
          status: p.status.phase,
          restarts: p.status.containerStatuses?.[0]?.restartCount || 0
        }))
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get tenant metrics
  async getTenantMetrics(req, res) {
    try {
      const { tenantName } = req.params;
      const metrics = await k8sService.getNamespaceMetrics(tenantName);

      res.json({ metrics });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Delete a tenant
  async deleteTenant(req, res) {
    try {
      const { tenantName } = req.params;

      // Delete database user from Atlas if configured
      if (atlasService.isConfigured()) {
        try {
          await atlasService.deleteDatabaseUser(tenantName);
        } catch (dbError) {
          console.error('Failed to delete database user:', dbError);
          // Continue with namespace deletion even if database deletion fails
        }
      }

      // Delete the namespace (this will also delete the secret)
      const result = await k8sService.deleteTenant(tenantName);

      res.json({
        message: 'Tenant and associated database deleted successfully',
        details: result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new TenantController();
