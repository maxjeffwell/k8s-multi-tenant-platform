import k8sService from '../services/k8sService.js';
import atlasService from '../services/atlasService.js';
import ingressService from '../services/ingressService.js';
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
    dbKey: 'educationelly-db'
  },
  'educationelly': {
    serverImage: 'maxjeffwell/educationelly-server:latest',
    clientImage: 'maxjeffwell/educationelly-client:latest',
    serverPort: 8080,
    clientPort: 3000,
    dbKey: 'educationelly-db'
  },
  'code-talk': {
    serverImage: 'maxjeffwell/code-talk-graphql-server:latest',
    clientImage: 'maxjeffwell/code-talk-graphql-client:latest',
    serverPort: 8000,
    clientPort: 3000,
    dbKey: 'postgres-aws'
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
    clientImage: 'maxjeffwell/firebook-client:latest',
    serverPort: null,
    clientPort: 80, // Nginx default
    dbKey: 'firebook-db'
  },
  'intervalai': {
    serverImage: 'maxjeffwell/spaced-repetition-capstone-server:latest',
    clientImage: 'maxjeffwell/spaced-repetition-capstone-client:latest',
    serverPort: 8080,
    clientPort: 80,
    dbKey: 'spaced-repetition-db'
  }
};

class TenantController {
  // Create a new tenant
  async createTenant(req, res) {
    try {
      // Validate request body using Zod schema
      const validatedData = validateBody(createTenantSchema, req.body);
      const { tenantName, resourceQuota, database, appType } = validatedData;
      let response = { tenant: tenantName };

      log.info({ tenantName, hasQuota: !!resourceQuota, hasDatabase: !!database, appType }, 'Creating tenant');

      // Create namespace
      const namespace = await k8sService.createNamespace(tenantName, resourceQuota, appType);

      // Upgrade tenant string to full object
      response.tenant = {
        name: namespace.metadata.name,
        createdAt: namespace.metadata.creationTimestamp
      };
      response.message = 'Tenant created successfully';

      // Determine the correct database key
      let databaseKey = null;

      // If appType dictates a specific DB, force it
      if (appType && DEFAULT_APP_CONFIGS[appType]?.dbKey) {
        databaseKey = DEFAULT_APP_CONFIGS[appType].dbKey;
      }
      // Otherwise fallback to request body
      else if (database && database.databaseKey) {
        databaseKey = database.databaseKey;
      }

      // Configure database if we have a key or custom URI
      if (databaseKey) {
        response.database = {
          configured: true,
          type: 'shared',
          key: databaseKey
        };
      } else if (database && database.mongoUri) {
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

          log.info({ tenantName, databaseName, secretName }, 'Database configured for tenant');
        } catch (dbError) {
          log.error({ err: dbError, tenantName }, 'Database configuration failed');
          response.database = {
            configured: false,
            error: 'Database configuration failed.',
            details: dbError.message
          };
        }
      }

      // Deploy Application if appType is provided and we have default config
      if (appType && DEFAULT_APP_CONFIGS[appType]) {
        try {
          const appConfig = DEFAULT_APP_CONFIGS[appType];
          log.info({ tenantName, appType }, 'Deploying default application');

          // Generate ingress URLs that will be created
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
              {
                name: 'secret', // Re-adding lowercase 'secret' just in case
                value: Math.random().toString(36).substring(2, 15)
              },
              {
                name: 'SECRET', // Standard naming for Educationelly backend
                value: Math.random().toString(36).substring(2, 15)
              },
              {
                name: 'JWT_SECRET', // Alternative standard naming
                value: Math.random().toString(36).substring(2, 15) // Use a new random value or same, doesn't matter as long as it's passed
              }
            ],
            graphqlEndpoint, // might be null
            databaseKey
          };

          // SPECIAL CONFIG FOR CODE-TALK (Needs Postgres + Redis)
          if (appType === 'code-talk') {
            deployConfig.env.push(
              {
                name: 'DATABASE_URL',
                value: 'postgres://ue2p717tmbg7uj:p5181fcc48b09e9c27b27fe64c388e33f675c42effa900b05979b61857159925d@c5cnr847jq0fj3.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/de3iq68tg4peu'
              },
              {
                name: 'REDIS_URL',
                value: 'rediss://:p40e3d46b6655a2eada48df7a524df3ed36f490323a854685737416bbed6a99d6@ec2-35-175-134-146.compute-1.amazonaws.com:6380'
              },
              {
                name: 'REDIS_HOST',
                value: 'ec2-35-175-134-146.compute-1.amazonaws.com'
              },
              {
                name: 'REDIS_PORT',
                value: '6380'
              },
              {
                name: 'REDIS_PASSWORD',
                value: 'p40e3d46b6655a2eada48df7a524df3ed36f490323a854685737416bbed6a99d6'
              }
            );
          }

          const deployResult = await k8sService.deployEducationelly(tenantName, deployConfig);

          // Create ingress resources
          let clientIngress = null;
          let serverIngress = null;

          try {
            // App prefix is the appType
            const appPrefix = appType;

            // Create ingress for client (frontend) if client exists
            if (appConfig.clientImage) {
              clientIngress = await ingressService.createClientIngress(
                tenantName,
                `${appPrefix}-client`,
                appConfig.clientPort
              );
            }

            // Create ingress for server (API) if server exists
            if (appConfig.serverImage) {
              serverIngress = await ingressService.createServerIngress(
                tenantName,
                `${appPrefix}-server`,
                appConfig.serverPort
              );
            }

            log.debug({ tenantName, clientIngress: clientIngress?.url }, 'Ingresses created during tenant creation');
          } catch (ingressError) {
            log.error({ err: ingressError, tenantName }, 'Failed to create ingress during tenant creation');
          }

          response.deployment = {
            deployed: true,
            appType: appType,
            server: deployResult.server?.metadata?.name,
            client: deployResult.client?.metadata?.name,
            ingress: {
              client: clientIngress,
              server: serverIngress
            }
          };
          response.message = 'Tenant created and application deployed successfully';

        } catch (deployError) {
          log.error({ err: deployError, tenantName }, 'Failed to deploy application during tenant creation');
          response.deployment = {
            deployed: false,
            error: 'Application deployment failed',
            details: deployError.message
          };
        }
      }

      log.info({ tenantName }, 'Tenant created successfully');
      res.status(201).json(response);
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.body?.tenantName }, 'Failed to create tenant');
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

      // Delete database user from Atlas if configured
      if (atlasService.isConfigured()) {
        try {
          await atlasService.deleteDatabaseUser(tenantName);
          log.debug({ tenantName }, 'Deleted database user from Atlas');
        } catch (dbError) {
          log.warn({ err: dbError, tenantName }, 'Failed to delete database user');
          // Continue with namespace deletion even if database deletion fails
        }
      }

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
