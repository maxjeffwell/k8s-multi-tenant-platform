import crypto from 'crypto';
import k8sService from '../services/k8sService.js';
import ingressService from '../services/ingressService.js';
// Note: Atlas service removed - using local MongoDB pods instead
import { createLogger } from '../utils/logger.js';
import {
  validateBody,
  validateParams,
  createTenantSchema,
  updateTenantSchema,
  tenantNameParamSchema
} from '../utils/validation.js';

const log = createLogger('tenant-controller');

const DEFAULT_APP_CONFIGS = {
  'educationelly-graphql': {
    serverImage: 'maxjeffwell/educationelly-graphql-server:latest',
    clientImage: 'maxjeffwell/educationelly-graphql-client:latest',
    serverPort: 8000,
    clientPort: 80,
    dbKey: 'mongodb-educationelly-graphql'
  },
  'educationelly': {
    serverImage: 'maxjeffwell/educationelly-server:latest',
    clientImage: 'maxjeffwell/educationelly-client:latest',
    serverPort: 8080,
    clientPort: 3000,
    dbKey: 'mongodb-educationelly'
  },
  'code-talk': {
    serverImage: 'maxjeffwell/code-talk-graphql-server:latest',
    clientImage: 'maxjeffwell/code-talk-graphql-client:latest',
    serverPort: 8000,
    clientPort: 5000,
    dbKey: 'postgres-codetalk'
  },
  'bookmarked': {
    serverImage: 'maxjeffwell/bookmarks-react-hooks-server:latest',
    clientImage: 'maxjeffwell/bookmarks-react-hooks-client:latest',
    serverPort: 3001,
    clientPort: 80,
    dbKey: 'postgres-neon'
  },
  'firebook': {
    serverImage: null, // Firebase app, no backend server
    clientImage: 'maxjeffwell/firebook:latest',
    serverPort: null,
    clientPort: 80, // Nginx default
    dbKey: 'firebook-db'
  },
  'intervalai': {
    serverImage: 'maxjeffwell/spaced-repetition-capstone-server:latest',
    clientImage: 'maxjeffwell/spaced-repetition-capstone-client:latest',
    serverPort: 8080,
    clientPort: 80,
    dbKey: 'mongodb-intervalai'
  }
};

class TenantController {
  // Create a new tenant with full automation, pre-flight checks, and rollback
  async createTenant(req, res) {
    let namespaceCreated = false;
    let tenantName = null;

    try {
      // Validate request body using Zod schema
      const validatedData = validateBody(createTenantSchema, req.body);
      const { tenantName: inputTenantName, resourceQuota, database, appType } = validatedData;
      tenantName = inputTenantName;
      let response = { tenant: tenantName };

      log.info({ tenantName, hasQuota: !!resourceQuota, hasDatabase: !!database, appType }, 'Creating tenant');

      // ========== STEP 0: Pre-flight checks ==========
      // Determine database key for pre-flight validation
      let databaseKey = null;
      if (appType && DEFAULT_APP_CONFIGS[appType]?.dbKey) {
        databaseKey = DEFAULT_APP_CONFIGS[appType].dbKey;
      } else if (database && database.databaseKey) {
        databaseKey = database.databaseKey;
      }

      const preFlightResults = await k8sService.runPreFlightChecks({
        databaseKey,
        ingressClass: process.env.INGRESS_CLASS || 'traefik'
      });

      if (!preFlightResults.passed) {
        log.error({ tenantName, errors: preFlightResults.errors }, 'Pre-flight checks failed');
        return res.status(400).json({
          error: 'Pre-flight checks failed',
          details: preFlightResults.errors,
          checks: preFlightResults.checks
        });
      }

      log.info({ tenantName, checks: preFlightResults.checks }, 'Pre-flight checks passed');
      response.preFlightChecks = preFlightResults.checks;

      // ========== STEP 1: Ensure TLS certificate exists ==========
      try {
        await k8sService.ensureWildcardCertificate();
        // Wait briefly for cert-manager if certificate was just created
        await k8sService.waitForTLSSecret('default', 'tenants-wildcard-tls', 60000);
        log.debug({ tenantName }, 'TLS certificate verified');
      } catch (tlsError) {
        log.warn({ err: tlsError, tenantName }, 'TLS certificate provisioning warning - continuing without TLS');
        // Non-fatal - continue with creation
      }

      // ========== STEP 2: Create namespace ==========
      const namespace = await k8sService.createNamespace(tenantName, resourceQuota, appType);
      namespaceCreated = true;

      response.tenant = {
        name: namespace.metadata.name,
        createdAt: namespace.metadata.creationTimestamp
      };
      response.message = 'Tenant created successfully';

      // ========== STEP 3: Create network policy ==========
      try {
        await k8sService.createNetworkPolicy(tenantName);
        log.debug({ tenantName }, 'Network policy created');
        response.networkPolicy = { created: true };
      } catch (networkPolicyError) {
        log.error({ err: networkPolicyError, tenantName }, 'Failed to create network policy');
        throw networkPolicyError; // Fatal - trigger rollback
      }

      // ========== STEP 4: Configure database ==========
      if (databaseKey) {
        response.database = {
          configured: true,
          type: 'shared',
          key: databaseKey
        };
      } else if (database && database.mongoUri) {
        try {
          const secretName = `${tenantName}-mongodb-secret`;

          let username = database.username || '';
          let password = database.password || '';
          let databaseName = database.databaseName || '';

          if (!username && database.mongoUri.includes('@')) {
            const match = database.mongoUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
            if (match) {
              username = match[1];
              password = match[2];
            }
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
          log.info({ tenantName, databaseName, secretName }, 'Database configured for tenant');
        } catch (dbError) {
          log.error({ err: dbError, tenantName }, 'Database configuration failed');
          throw dbError; // Fatal - trigger rollback
        }
      }

      // ========== STEP 5: Deploy Application ==========
      if (appType && DEFAULT_APP_CONFIGS[appType]) {
        const appConfig = DEFAULT_APP_CONFIGS[appType];
        log.info({ tenantName, appType }, 'Deploying default application');

        const ingressHost = ingressService.generateIngressHost();
        let serverIngressUrl = null;
        let graphqlEndpoint = null;

        if (appConfig.serverImage) {
          serverIngressUrl = `http://${tenantName}-api.${ingressHost}`;
          graphqlEndpoint = `${serverIngressUrl}/graphql`;
        }

        const deployConfig = {
          replicas: 1,
          appType: appType,
          serverImage: appConfig.serverImage,
          clientImage: appConfig.clientImage,
          serverPort: appConfig.serverPort,
          clientPort: appConfig.clientPort,
          env: [
            { name: 'secret', value: crypto.randomBytes(32).toString('hex') },
            { name: 'SECRET', value: crypto.randomBytes(32).toString('hex') },
            { name: 'JWT_SECRET', value: crypto.randomBytes(32).toString('hex') }
          ],
          graphqlEndpoint,
          databaseKey
        };

        // SPECIAL CONFIG FOR CODE-TALK
        if (appType === 'code-talk') {
          const jwtSecret = crypto.randomBytes(32).toString('hex');
          deployConfig.env.push(
            { name: 'DATABASE_URL', value: 'postgres://codetalk_user:codetalk_postgres123@postgresql-codetalk.default.svc.cluster.local:5432/codetalk' },
            { name: 'JWT_SECRET', value: jwtSecret },
            { name: 'REDIS_URL', value: 'redis://:redis123@redis.default.svc.cluster.local:6379' },
            { name: 'REDIS_HOST', value: 'redis.default.svc.cluster.local' },
            { name: 'REDIS_PORT', value: '6379' },
            { name: 'REDIS_PASSWORD', value: 'redis123' }
          );
        }

        const deployResult = await k8sService.deployEducationelly(tenantName, deployConfig);

        // ========== STEP 6: Wait for deployments to be ready ==========
        try {
          log.info({ tenantName }, 'Waiting for deployments to be ready...');
          const deploymentReadiness = await k8sService.waitForAllDeploymentsReady(tenantName, 300000);
          if (!deploymentReadiness.ready) {
            log.warn({ tenantName, deployments: deploymentReadiness.deployments }, 'Some deployments not fully ready');
          } else {
            log.info({ tenantName }, 'All deployments ready');
          }
          response.deploymentReadiness = deploymentReadiness;
        } catch (readinessError) {
          log.error({ err: readinessError, tenantName }, 'Deployment readiness check failed');
          throw readinessError; // Trigger rollback
        }

        // ========== STEP 7: Create unified ingress ==========
        let ingress = null;

        // Copy TLS secret from default namespace to tenant namespace
        try {
          await k8sService.copySecret('default', 'tenants-wildcard-tls', tenantName);
          log.debug({ tenantName }, 'TLS secret copied to tenant namespace');
        } catch (tlsError) {
          log.warn({ err: tlsError, tenantName }, 'Failed to copy TLS secret, ingress will not have TLS');
        }

        const appPrefix = appType;
        const clientConfig = appConfig.clientImage ? {
          name: `${appPrefix}-client`,
          port: appConfig.clientPort
        } : null;

        const serverConfig = appConfig.serverImage ? {
          name: `${appPrefix}-server`,
          port: appConfig.serverPort
        } : null;

        if (clientConfig) {
          ingress = await ingressService.createUnifiedIngress(
            tenantName,
            clientConfig,
            serverConfig,
            { tlsSecretName: 'tenants-wildcard-tls' }
          );

          // ========== STEP 8: Wait for ingress to be ready ==========
          const ingressStatus = await ingressService.waitForIngressReady(
            tenantName,
            ingress.name,
            120000
          );

          if (!ingressStatus.ready) {
            log.warn({ tenantName, ingressStatus }, 'Ingress not fully ready but may still work');
          }
          response.ingressReadiness = ingressStatus;
        }

        log.debug({ tenantName, ingressUrl: ingress?.url }, 'Unified ingress created');

        response.deployment = {
          deployed: true,
          appType: appType,
          server: deployResult.server?.metadata?.name,
          client: deployResult.client?.metadata?.name,
          ingress: ingress
        };
        response.message = 'Tenant created and application deployed successfully';
      }

      log.info({ tenantName }, 'Tenant created successfully');
      res.status(201).json(response);

    } catch (error) {
      // ========== ROLLBACK LOGIC ==========
      if (namespaceCreated && tenantName) {
        log.warn({ tenantName }, 'Initiating rollback - deleting namespace');
        try {
          await k8sService.deleteTenant(tenantName);
          log.info({ tenantName }, 'Rollback complete - namespace deleted');
        } catch (rollbackError) {
          log.error({ err: rollbackError, tenantName }, 'Rollback failed - manual cleanup may be required');
        }
      }

      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }

      log.error({ err: error, tenantName: req.body?.tenantName }, 'Failed to create tenant');
      res.status(500).json({
        error: error.message,
        rollback: namespaceCreated ? 'Namespace rolled back' : 'No rollback needed'
      });
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
          appType: ns.metadata.labels?.['tenant-app-type'],
          cpu: cpu,
          memory: memory
        };
      }));

      log.debug({ count: tenants.length }, 'Listed tenants');
      res.json({ tenants });
    } catch (error) {
      log.error({ err: error }, 'Failed to list tenants');
      res.status(500).json({ error: error.message });
    }
  }

  // Get tenant details
  async getTenant(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
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
          createdAt: details.namespace.metadata.creationTimestamp,
          appType: details.namespace.metadata.labels?.['tenant-app-type']
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
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to get tenant details');
      res.status(500).json({ error: error.message });
    }
  }

  // Get tenant metrics
  async getTenantMetrics(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
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
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to get tenant metrics');
      res.status(500).json({ error: error.message });
    }
  }

  // Update a tenant (resource quotas)
  async updateTenant(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
      // Validate request body - ensures resourceQuota has valid cpu/memory format and limits
      const { resourceQuota } = validateBody(updateTenantSchema, req.body);

      log.info({ tenantName, resourceQuota }, 'Updating tenant resource quota');

      // Update the resource quota
      const result = await k8sService.updateResourceQuota(tenantName, resourceQuota);

      log.info({ tenantName }, 'Tenant updated successfully');
      res.json({
        message: 'Tenant updated successfully',
        tenant: {
          name: tenantName,
          resourceQuota: result
        }
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to update tenant');
      res.status(500).json({ error: error.message });
    }
  }

  // Delete a tenant
  async deleteTenant(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);

      log.info({ tenantName }, 'Deleting tenant');

      // Note: Using local MongoDB pods - no external database user cleanup needed

      // Delete ingresses for the tenant
      try {
        await ingressService.deleteTenantIngresses(tenantName);
        log.debug({ tenantName }, 'Deleted tenant ingresses');
      } catch (ingressError) {
        log.warn({ err: ingressError, tenantName }, 'Failed to delete ingresses');
        // Continue with namespace deletion even if ingress deletion fails
      }

      // Delete the namespace (this will also delete the secret and remaining resources)
      const result = await k8sService.deleteTenant(tenantName);

      log.info({ tenantName }, 'Tenant deleted successfully');
      res.json({
        message: 'Tenant and associated resources deleted successfully',
        details: result
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to delete tenant');
      res.status(500).json({ error: error.message });
    }
  }
}

export default new TenantController();
