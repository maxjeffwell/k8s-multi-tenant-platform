import crypto from 'crypto';
import DigestClient from 'digest-fetch';
import { createLogger } from '../utils/logger.js';

// Default logger - can be overridden via dependency injection for testing
const defaultLog = createLogger('atlas-service');

class AtlasService {
  /**
   * Create an AtlasService instance
   * @param {Object} deps - Optional dependencies for testing
   * @param {Object} deps.httpClient - HTTP client for making requests (defaults to DigestClient)
   * @param {Object} deps.config - Configuration overrides
   * @param {string} deps.config.baseUrl - Atlas API base URL
   * @param {string} deps.config.publicKey - Atlas public API key
   * @param {string} deps.config.privateKey - Atlas private API key
   * @param {string} deps.config.projectId - Atlas project ID
   * @param {string} deps.config.clusterName - Atlas cluster name
   * @param {string} deps.config.clusterUrl - Atlas cluster URL
   * @param {Object} deps.logger - Logger instance
   */
  constructor(deps = {}) {
    const config = deps.config || {};
    this.baseUrl = config.baseUrl || 'https://cloud.mongodb.com/api/atlas/v2';
    this.publicKey = config.publicKey || process.env.ATLAS_PUBLIC_KEY;
    this.privateKey = config.privateKey || process.env.ATLAS_PRIVATE_KEY;
    this.projectId = config.projectId || process.env.ATLAS_PROJECT_ID;
    this.clusterName = config.clusterName || process.env.ATLAS_CLUSTER_NAME;
    this.clusterUrl = config.clusterUrl || process.env.ATLAS_CLUSTER_URL;
    this.log = deps.logger || defaultLog;

    // Allow injecting a mock HTTP client for testing
    if (deps.httpClient) {
      this.client = deps.httpClient;
    } else if (this.publicKey && this.privateKey) {
      this.client = new DigestClient(this.publicKey, this.privateKey);
    } else {
      this.client = null;
    }
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
    if (!this.clusterUrl) {
      throw new Error('ATLAS_CLUSTER_URL not configured in environment');
    }

    // URL encode the username and password to handle special characters
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);

    // Build connection string with proper format
    // Format: mongodb+srv://username:password@cluster-url/database?retryWrites=true&w=majority
    return `mongodb+srv://${encodedUsername}:${encodedPassword}@${this.clusterUrl}/${databaseName}?retryWrites=true&w=majority`;
  }

  /**
   * Add an IP address to Atlas access list
   * @param {string} ipAddress - IP address to whitelist (or '0.0.0.0/0' for all)
   * @param {string} comment - Comment for the IP entry
   */
  async addIPToAccessList(ipAddress, comment = 'Auto-added by platform') {
    try {
      const accessListEntry = {
        ipAddress: ipAddress,
        comment: comment
      };

      const response = await this.makeRequest(
        `/groups/${this.projectId}/accessList`,
        {
          method: 'POST',
          body: JSON.stringify([accessListEntry])
        }
      );

      return response;
    } catch (error) {
      // If already exists, that's okay
      if (error.message.includes('DUPLICATE_ENTRY') || error.message.includes('409')) {
        return { message: 'IP already in access list' };
      }
      throw new Error(`Failed to add IP to access list: ${error.message}`);
    }
  }

  /**
   * Ensure all-access is enabled (0.0.0.0/0)
   * Useful for development environments
   */
  async ensureAllAccessEnabled() {
    try {
      await this.addIPToAccessList('0.0.0.0/0', 'Allow access from anywhere');
      return { message: 'All-access enabled successfully' };
    } catch (error) {
      throw new Error(`Failed to enable all-access: ${error.message}`);
    }
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
      this.clusterUrl
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

// Export the class for testing with dependency injection
export { AtlasService };

// Factory function for creating instances with custom dependencies
export function createAtlasService(deps = {}) {
  return new AtlasService(deps);
}

// Default singleton instance for production use
const atlasService = new AtlasService();
export default atlasService;
