import atlasService from '../services/atlasService.js';
import k8sService from '../services/k8sService.js';
import { getDatabaseOptions, getDatabaseConfig } from '../config/databases.js';
import { createLogger } from '../utils/logger.js';
import {
  validateBody,
  validateParams,
  createDatabaseSchema,
  connectDatabaseSchema,
  tenantNameParamSchema
} from '../utils/validation.js';

const log = createLogger('database-controller');

class DatabaseController {
  /**
   * Get available database options
   * GET /api/database/options
   */
  async getAvailableDatabases(req, res) {
    try {
      const databases = getDatabaseOptions();
      res.json({ databases });
    } catch (error) {
      log.error({ err: error }, 'Failed to get database options');
      res.status(500).json({
        error: 'Failed to get database options',
        details: error.message
      });
    }
  }

  /**
   * Create a MongoDB Atlas database for a tenant
   * POST /api/tenants/:tenantName/database
   * Body: { databaseKey } - the key of the pre-configured database to use
   *   OR  { connectionString, username, password, databaseName } - custom credentials
   */
  async createDatabase(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
      // Validate request body - validates connection string format, credentials
      const { databaseKey, connectionString, username, password, databaseName } = validateBody(createDatabaseSchema, req.body || {});

      log.info({ tenantName, databaseKey, hasDatabaseName: !!databaseName }, 'Creating database for tenant');

      // Check if namespace exists
      const tenantDetails = await k8sService.getTenantDetails(tenantName);
      if (!tenantDetails) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Check if database already exists
      const secretName = `${tenantName}-mongodb-secret`;
      const existingSecret = await k8sService.getSecret(tenantName, secretName);
      if (existingSecret) {
        return res.status(409).json({
          error: 'Database already exists for this tenant',
          message: 'Use DELETE first to recreate'
        });
      }

      let dbConnectionString, dbUsername, dbPassword, dbName;

      // If databaseKey is provided, look up the credentials from config
      if (databaseKey) {
        const dbConfig = getDatabaseConfig(databaseKey);
        if (!dbConfig) {
          return res.status(400).json({
            error: 'Invalid database key',
            message: `Database '${databaseKey}' not found in configuration`
          });
        }
        dbConnectionString = dbConfig.connectionString;
        dbUsername = dbConfig.username;
        dbPassword = dbConfig.password;
        dbName = dbConfig.databaseName;
      } else {
        // Use provided credentials or generate defaults for a shared database
        dbConnectionString = connectionString || atlasService.getConnectionString(
          username || 'shared-user',
          password || 'shared-password',
          databaseName || `db-${tenantName}`
        );

        dbUsername = username || 'shared-user';
        dbPassword = password || 'shared-password';
        dbName = databaseName || `db-${tenantName}`;
      }

      // Store credentials in Kubernetes Secret
      await k8sService.createDatabaseSecret(
        tenantName,
        secretName,
        dbConnectionString,
        dbUsername,
        dbPassword,
        dbName
      );

      // Restart all deployments in the namespace to pick up the new secret
      if (tenantDetails.deployments && tenantDetails.deployments.length > 0) {
        log.info({ tenantName, count: tenantDetails.deployments.length }, 'Restarting tenant deployments');

        // Execute restarts in parallel for speed
        await Promise.allSettled(tenantDetails.deployments.map(deployment => {
          const deployName = deployment.metadata.name;
          return k8sService.restartDeployment(tenantName, deployName)
            .catch(err => log.warn({ err, tenantName, deployment: deployName }, 'Failed to restart deployment'));
        }));
      } else {
        log.warn({ tenantName }, 'No deployments found to restart');
      }

      log.info({ tenantName, databaseName: dbName, secretName }, 'Database created successfully');
      res.status(201).json({
        message: 'Database connected successfully',
        database: {
          name: dbName,
          username: dbUsername,
          secretName: secretName
        }
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Database creation failed');
      res.status(500).json({
        error: 'Failed to create database',
        details: error.message
      });
    }
  }

  /**
   * Delete a tenant's database
   * DELETE /api/tenants/:tenantName/database
   */
  async deleteDatabase(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);

      log.info({ tenantName }, 'Deleting database for tenant');

      if (!atlasService.isConfigured()) {
        return res.status(500).json({
          error: 'MongoDB Atlas is not configured'
        });
      }

      // Delete database user from Atlas
      await atlasService.deleteDatabaseUser(tenantName);

      // Delete Kubernetes secret
      const secretName = `${tenantName}-mongodb-secret`;
      await k8sService.deleteSecret(tenantName, secretName);

      log.info({ tenantName }, 'Database deleted successfully');
      res.json({
        message: 'Database deleted successfully'
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Database deletion failed');
      res.status(500).json({
        error: 'Failed to delete database',
        details: error.message
      });
    }
  }

  /**
   * Get database status for a tenant
   * GET /api/tenants/:tenantName/database/status
   */
  async getDatabaseStatus(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);

      const secretName = `${tenantName}-mongodb-secret`;
      const secret = await k8sService.getSecret(tenantName, secretName);

      if (!secret) {
        return res.json({
          configured: false,
          message: 'No database configured for this tenant'
        });
      }

      // Decode secret data
      const secretData = secret.data || {};
      const databaseName = secretData.MONGO_DATABASE
        ? Buffer.from(secretData.MONGO_DATABASE, 'base64').toString('utf-8')
        : null;
      const username = secretData.MONGO_USERNAME
        ? Buffer.from(secretData.MONGO_USERNAME, 'base64').toString('utf-8')
        : null;

      res.json({
        configured: true,
        database: {
          name: databaseName,
          username: username,
          secretName: secretName,
          createdAt: secret.metadata?.creationTimestamp
        }
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to get database status');
      res.status(500).json({
        error: 'Failed to get database status',
        details: error.message
      });
    }
  }

  /**
   * Test Atlas connection
   * GET /api/database/test
   */
  async testAtlasConnection(req, res) {
    try {
      if (!atlasService.isConfigured()) {
        return res.status(500).json({
          success: false,
          error: 'MongoDB Atlas is not configured'
        });
      }

      const result = await atlasService.testConnection();
      log.info({ project: result.projectName }, 'Atlas connection test successful');
      res.json({
        success: true,
        message: 'Successfully connected to MongoDB Atlas',
        project: result.projectName
      });
    } catch (error) {
      log.error({ err: error }, 'Atlas connection test failed');
      res.status(500).json({
        success: false,
        error: 'Failed to connect to Atlas',
        details: error.message
      });
    }
  }

  /**
   * Connect tenant to existing database (without creating new database user)
   * POST /api/tenants/:tenantName/database/connect
   * Body: { connectionString, username, password, databaseName } (all optional, uses defaults if not provided)
   */
  async connectExistingDatabase(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
      // Validate request body - validates connection string format, credentials
      const { connectionString, username, password, databaseName } = validateBody(connectDatabaseSchema, req.body || {});

      log.info({ tenantName, hasDatabaseName: !!databaseName }, 'Connecting tenant to existing database');

      // Check if namespace exists
      const tenantDetails = await k8sService.getTenantDetails(tenantName);
      if (!tenantDetails) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Check if database already exists
      const secretName = `${tenantName}-mongodb-secret`;
      const existingSecret = await k8sService.getSecret(tenantName, secretName);
      if (existingSecret) {
        return res.status(409).json({
          error: 'Database already exists for this tenant',
          message: 'Use DELETE first to recreate'
        });
      }

      // Use provided credentials or generate defaults for a shared database
      const dbConnectionString = connectionString || atlasService.getConnectionString(
        username || 'shared-user',
        password || 'shared-password',
        databaseName || `db-${tenantName}`
      );

      const dbUsername = username || 'shared-user';
      const dbPassword = password || 'shared-password';
      const dbName = databaseName || `db-${tenantName}`;

      // Store credentials in Kubernetes Secret (without calling Atlas API)
      await k8sService.createDatabaseSecret(
        tenantName,
        secretName,
        dbConnectionString,
        dbUsername,
        dbPassword,
        dbName
      );

      // Restart all deployments in the namespace to pick up the new secret
      if (tenantDetails.deployments && tenantDetails.deployments.length > 0) {
        log.info({ tenantName, count: tenantDetails.deployments.length }, 'Restarting tenant deployments');

        // Execute restarts in parallel for speed
        await Promise.allSettled(tenantDetails.deployments.map(deployment => {
          const deployName = deployment.metadata.name;
          return k8sService.restartDeployment(tenantName, deployName)
            .catch(err => log.warn({ err, tenantName, deployment: deployName }, 'Failed to restart deployment'));
        }));
      } else {
        log.warn({ tenantName }, 'No deployments found to restart');
      }

      log.info({ tenantName, databaseName: dbName, secretName }, 'Database connected successfully');
      res.status(201).json({
        message: 'Database connected successfully',
        database: {
          name: dbName,
          username: dbUsername,
          secretName: secretName
        }
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to connect database');
      res.status(500).json({
        error: 'Failed to connect database',
        details: error.message
      });
    }
  }
}

export default new DatabaseController();
