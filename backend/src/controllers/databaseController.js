import atlasService from '../services/atlasService.js';
import k8sService from '../services/k8sService.js';
import { getDatabaseOptions, getDatabaseConfig } from '../config/databases.js';

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
      console.error('Error getting database options:', error);
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
    const { tenantName } = req.params;
    const { databaseKey, connectionString, username, password, databaseName } = req.body || {};

    try {
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

      // Restart pods to pick up the new secret (best effort - continue if fails)
      try {
        await k8sService.restartDeployment(tenantName, 'educationelly-graphql-server');
      } catch (restartError) {
        console.warn('Failed to restart server deployment:', restartError.message);
      }

      try {
        await k8sService.restartDeployment(tenantName, 'educationelly-graphql-client');
      } catch (restartError) {
        console.warn('Failed to restart client deployment:', restartError.message);
      }

      res.status(201).json({
        message: 'Database connected successfully',
        database: {
          name: dbName,
          username: dbUsername,
          secretName: secretName
        }
      });
    } catch (error) {
      console.error('Database creation error:', error);
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
    const { tenantName } = req.params;

    try {
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

      res.json({
        message: 'Database deleted successfully'
      });
    } catch (error) {
      console.error('Database deletion error:', error);
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
    const { tenantName } = req.params;

    try {
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
      console.error('Database status error:', error);
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
      res.json({
        success: true,
        message: 'Successfully connected to MongoDB Atlas',
        project: result.projectName
      });
    } catch (error) {
      console.error('Atlas connection test error:', error);
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
    const { tenantName } = req.params;
    const { connectionString, username, password, databaseName } = req.body || {};

    try {
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

      // Restart pods to pick up the new secret (best effort - continue if fails)
      try {
        await k8sService.restartDeployment(tenantName, 'educationelly-graphql-server');
      } catch (restartError) {
        console.warn('Failed to restart server deployment:', restartError.message);
      }

      try {
        await k8sService.restartDeployment(tenantName, 'educationelly-graphql-client');
      } catch (restartError) {
        console.warn('Failed to restart client deployment:', restartError.message);
      }

      res.status(201).json({
        message: 'Database connected successfully',
        database: {
          name: dbName,
          username: dbUsername,
          secretName: secretName
        }
      });
    } catch (error) {
      console.error('Database connection error:', error);
      res.status(500).json({
        error: 'Failed to connect database',
        details: error.message
      });
    }
  }
}

export default new DatabaseController();
