import crypto from 'crypto';
import DigestClient from 'digest-fetch';

class AtlasService {
  constructor() {
    this.baseUrl = 'https://cloud.mongodb.com/api/atlas/v2';
    this.publicKey = process.env.ATLAS_PUBLIC_KEY;
    this.privateKey = process.env.ATLAS_PRIVATE_KEY;
    this.projectId = process.env.ATLAS_PROJECT_ID;
    this.clusterName = process.env.ATLAS_CLUSTER_NAME;
    this.client = new DigestClient(this.publicKey, this.privateKey);
  }

  /**
   * Make authenticated request to Atlas API
   */
  async makeRequest(url, options = {}) {
    const fullUrl = `${this.baseUrl}${url}`;
    const requestOptions = {
      ...options,
      headers: {
        'Accept': 'application/vnd.atlas.2025-01-01+json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const response = await this.client.fetch(fullUrl, requestOptions);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`${response.status} - ${errorBody}`);
    }

    // Check if response has content before parsing JSON
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      return {}; // Return empty object for successful requests with no body
    }

    return JSON.parse(text);
  }

  /**
   * Generate secure random password
   */
  generateSecurePassword(length = 32) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Create a database user for a tenant in MongoDB Atlas
   * @param {string} tenantName - Name of the tenant (used as database name)
   * @returns {Promise<{username: string, password: string, databaseName: string}>}
   */
  async createDatabaseUser(tenantName) {
    try {
      const username = `user-${tenantName}`;
      const password = this.generateSecurePassword();
      const databaseName = `db-${tenantName}`;

      const userData = {
        databaseName: 'admin', // Authentication database
        username: username,
        password: password,
        roles: [
          {
            roleName: 'readWrite',
            databaseName: databaseName // Scope access to tenant's database only
          }
        ],
        scopes: [
          {
            name: this.clusterName,
            type: 'CLUSTER'
          }
        ]
      };

      const response = await this.makeRequest(
        `/groups/${this.projectId}/databaseUsers`,
        {
          method: 'POST',
          body: JSON.stringify(userData)
        }
      );

      return {
        username,
        password,
        databaseName,
        userId: response.username
      };
    } catch (error) {
      throw new Error(`Failed to create database user: ${error.message}`);
    }
  }

  /**
   * Delete a database user from MongoDB Atlas
   * @param {string} tenantName - Name of the tenant
   */
  async deleteDatabaseUser(tenantName) {
    try {
      const username = `user-${tenantName}`;

      await this.makeRequest(
        `/groups/${this.projectId}/databaseUsers/admin/${username}`,
        {
          method: 'DELETE'
        }
      );

      return { message: `Database user ${username} deleted successfully` };
    } catch (error) {
      if (error.message.includes('404')) {
        // User doesn't exist, consider it successful
        return { message: `Database user already deleted or doesn't exist` };
      }
      throw new Error(`Failed to delete database user: ${error.message}`);
    }
  }

  /**
   * Get MongoDB connection string for a tenant
   * @param {string} username - Database username
   * @param {string} password - Database password
   * @param {string} databaseName - Database name
   * @returns {string} - MongoDB connection URI
   */
  getConnectionString(username, password, databaseName) {
    const clusterUrl = process.env.ATLAS_CLUSTER_URL;

    if (!clusterUrl) {
      throw new Error('ATLAS_CLUSTER_URL not configured in environment');
    }

    // URL encode the username and password to handle special characters
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);

    // Build connection string with proper format
    // Format: mongodb+srv://username:password@cluster-url/database?retryWrites=true&w=majority
    return `mongodb+srv://${encodedUsername}:${encodedPassword}@${clusterUrl}/${databaseName}?retryWrites=true&w=majority`;
  }

  /**
   * Check if Atlas configuration is valid
   * @returns {boolean}
   */
  isConfigured() {
    return !!(
      this.publicKey &&
      this.privateKey &&
      this.projectId &&
      this.clusterName &&
      process.env.ATLAS_CLUSTER_URL
    );
  }

  /**
   * Test Atlas API connection
   */
  async testConnection() {
    try {
      const response = await this.makeRequest(`/groups/${this.projectId}`, {
        method: 'GET'
      });
      return {
        success: true,
        projectName: response.name
      };
    } catch (error) {
      throw new Error(`Atlas connection failed: ${error.message}`);
    }
  }
}

export default new AtlasService();
