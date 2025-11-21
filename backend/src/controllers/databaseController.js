import atlasService from '../services/atlasService.js';
import k8sService from '../services/k8sService.js';

class DatabaseController {
  /**
   * Create a MongoDB Atlas database for a tenant
   * POST /api/tenants/:tenantName/database
   */
  async createDatabase(req, res) {
    const { tenantName } = req.params;

    try {
      // Check if Atlas is configured
      if (!atlasService.isConfigured()) {
        return res.status(500).json({
          error: 'MongoDB Atlas is not configured. Please set Atlas environment variables.'
        });
      }

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

      // Create database user in Atlas
      const dbUser = await atlasService.createDatabaseUser(tenantName);

      // Generate connection string
      const connectionString = atlasService.getConnectionString(
        dbUser.username,
        dbUser.password,
        dbUser.databaseName
      );

      // Store credentials in Kubernetes Secret
      await k8sService.createDatabaseSecret(
        tenantName,
        secretName,
        connectionString,
        dbUser.username,
        dbUser.password,
        dbUser.databaseName
      );

      res.status(201).json({
        message: 'Database created successfully',
        database: {
          name: dbUser.databaseName,
          username: dbUser.username,
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
}

export default new DatabaseController();
