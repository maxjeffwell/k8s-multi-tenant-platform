import k8sService from '../services/k8sService.js';
import atlasService from '../services/atlasService.js';
import ingressService from '../services/ingressService.js';

class TenantController {
  // Create a new tenant
  async createTenant(req, res) {
    try {
      const { tenantName, resourceQuota, database } = req.body;

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

      // Configure database if provided
      if (database && database.mongoUri) {
        try {
          const secretName = `${tenantName}-mongodb-secret`;

          // Extract credentials from URI if not provided
          let username = database.username || '';
          let password = database.password || '';
          let databaseName = database.databaseName || '';

          // Try to parse from URI if not provided
          if (!username && database.mongoUri.includes('@')) {
            const match = database.mongoUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
            if (match) {
              username = match[1];
              password = match[2];
            }
            // Extract database name from URI
            const dbMatch = database.mongoUri.match(/\.net\/([^?]+)/);
            if (dbMatch) {
              databaseName = dbMatch[1];
            }
          }

          await k8sService.createDatabaseSecret(
            tenantName,
            secretName,
            database.mongoUri,
            username,
            password,
            databaseName
          );

          response.database = {
            configured: true,
            name: databaseName,
            username: username,
            secretName: secretName
          };
          response.message = 'Tenant and database configured successfully';
        } catch (dbError) {
          console.error('Database configuration failed:', dbError);
          response.database = {
            configured: false,
            error: 'Database configuration failed.',
            details: dbError.message
          };
        }
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

      const tenants = await Promise.all(namespaces.map(async ns => {
        const tenantName = ns.metadata.name;

        // Get resource quota to extract cpu/memory
        let cpu = '0';
        let memory = '0Gi';
        try {
          const quota = await k8sService.getResourceQuota(tenantName);
          if (quota && quota.spec && quota.spec.hard) {
            cpu = quota.spec.hard['requests.cpu'] || quota.spec.hard['limits.cpu'] || '0';
            memory = quota.spec.hard['requests.memory'] || quota.spec.hard['limits.memory'] || '0Gi';
          }
        } catch (err) {
          // Quota might not exist, use defaults
        }

        return {
          name: tenantName,
          status: ns.status.phase,
          createdAt: ns.metadata.creationTimestamp,
          labels: ns.metadata.labels,
          cpu: cpu,
          memory: memory
        };
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

        // Check if pods are actually connected to the database
        const connectionStatus = await k8sService.checkDatabaseConnection(tenantName);

        databaseInfo = {
          configured: true,
          name: databaseName,
          username: username,
          secretName: secretName,
          createdAt: secret.metadata?.creationTimestamp,
          connection: connectionStatus
        };
      }

      // Get ingress information
      const ingresses = await ingressService.getTenantIngresses(tenantName);

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
          selector: s.spec.selector,
          ports: s.spec.ports
        })),
        pods: details.pods.map(p => ({
          name: p.metadata.name,
          status: p.status.phase,
          labels: p.metadata.labels,
          restarts: p.status.containerStatuses?.[0]?.restartCount || 0
        })),
        ingresses: ingresses
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
      const details = await k8sService.getTenantDetails(tenantName);

      // Add deployments and detailed pods list to metrics
      metrics.deployments = details.deployments.map(d => ({
        name: d.metadata.name,
        replicas: d.spec.replicas,
        availableReplicas: d.status.availableReplicas || 0,
        image: d.spec.template.spec.containers[0].image
      }));

      metrics.podsList = details.pods.map(p => ({
        name: p.metadata.name,
        status: p.status.phase,
        labels: p.metadata.labels,
        restarts: p.status.containerStatuses?.[0]?.restartCount || 0
      }));

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Update a tenant (resource quotas)
  async updateTenant(req, res) {
    try {
      const { tenantName } = req.params;
      const { resourceQuota } = req.body;

      if (!resourceQuota) {
        return res.status(400).json({ error: 'Resource quota is required' });
      }

      // Update the resource quota
      const result = await k8sService.updateResourceQuota(tenantName, resourceQuota);

      res.json({
        message: 'Tenant updated successfully',
        tenant: {
          name: tenantName,
          resourceQuota: result
        }
      });
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

      // Delete ingresses for the tenant
      try {
        await ingressService.deleteTenantIngresses(tenantName);
      } catch (ingressError) {
        console.error('Failed to delete ingresses:', ingressError);
        // Continue with namespace deletion even if ingress deletion fails
      }

      // Delete the namespace (this will also delete the secret and remaining resources)
      const result = await k8sService.deleteTenant(tenantName);

      res.json({
        message: 'Tenant and associated resources deleted successfully',
        details: result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new TenantController();
