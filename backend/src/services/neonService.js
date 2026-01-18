import { createLogger } from '../utils/logger.js';

const log = createLogger('neon-service');

/**
 * NeonService - Manages Neon PostgreSQL branches for multi-tenant isolation
 *
 * Each tenant gets their own Neon branch, providing:
 * - Instant database provisioning (copy-on-write)
 * - Full data isolation
 * - Branch-specific connection strings
 * - Easy cleanup on tenant deletion
 */
class NeonService {
  constructor() {
    this.apiKey = process.env.NEON_API_KEY;
    this.projectId = process.env.NEON_PROJECT_ID;
    this.baseUrl = 'https://console.neon.tech/api/v2';
  }

  /**
   * Check if Neon branching is configured
   */
  isConfigured() {
    return !!(this.apiKey && this.projectId);
  }

  /**
   * Make authenticated request to Neon API
   */
  async apiRequest(method, endpoint, body = null) {
    if (!this.isConfigured()) {
      throw new Error('Neon API not configured. Set NEON_API_KEY and NEON_PROJECT_ID environment variables.');
    }

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText, endpoint }, 'Neon API request failed');
      throw new Error(`Neon API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Create a new branch for a tenant
   * @param {string} tenantName - Name of the tenant (used as branch name)
   * @param {string} parentBranchId - Optional parent branch ID (defaults to main branch)
   * @returns {Promise<Object>} Branch details including connection info
   */
  async createBranch(tenantName, parentBranchId = null) {
    log.info({ tenantName, projectId: this.projectId }, 'Creating Neon branch for tenant');

    const branchName = `tenant-${tenantName}`;

    const body = {
      branch: {
        name: branchName
      },
      endpoints: [
        {
          type: 'read_write'
        }
      ]
    };

    if (parentBranchId) {
      body.branch.parent_id = parentBranchId;
    }

    const result = await this.apiRequest('POST', `/projects/${this.projectId}/branches`, body);

    log.info({
      branchId: result.branch?.id,
      branchName: result.branch?.name,
      tenantName
    }, 'Neon branch created successfully');

    return {
      branchId: result.branch?.id,
      branchName: result.branch?.name,
      endpoints: result.endpoints || [],
      createdAt: result.branch?.created_at
    };
  }

  /**
   * Get connection string for a specific branch
   * @param {string} branchId - The branch ID
   * @param {string} databaseName - Database name (default: neondb)
   * @param {string} roleName - Role name (default: neondb_owner)
   * @returns {Promise<string>} PostgreSQL connection string
   */
  async getConnectionString(branchId, databaseName = 'neondb', roleName = null) {
    log.info({ branchId, databaseName }, 'Getting connection string for branch');

    // Get branch details to find the endpoint
    const branchResult = await this.apiRequest('GET', `/projects/${this.projectId}/branches/${branchId}`);

    // Get endpoints for this branch
    const endpointsResult = await this.apiRequest('GET', `/projects/${this.projectId}/branches/${branchId}/endpoints`);

    if (!endpointsResult.endpoints || endpointsResult.endpoints.length === 0) {
      throw new Error(`No endpoints found for branch ${branchId}`);
    }

    const endpoint = endpointsResult.endpoints.find(ep => ep.type === 'read_write') || endpointsResult.endpoints[0];

    // Get the password for the role
    const role = roleName || 'neondb_owner';
    const passwordResult = await this.apiRequest('GET', `/projects/${this.projectId}/branches/${branchId}/roles/${role}/reveal_password`);

    const host = endpoint.host;
    const password = passwordResult.password;

    const connectionString = `postgres://${role}:${password}@${host}/${databaseName}?sslmode=require`;

    return connectionString;
  }

  /**
   * Create branch and get connection string in one operation
   * @param {string} tenantName - Name of the tenant
   * @returns {Promise<Object>} Branch info with connection string
   */
  async createTenantBranch(tenantName) {
    // Create the branch
    const branch = await this.createBranch(tenantName);

    // Wait a moment for the endpoint to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the connection string
    const connectionString = await this.getConnectionString(branch.branchId);

    return {
      ...branch,
      connectionString,
      databaseName: 'neondb'
    };
  }

  /**
   * Delete a tenant's branch
   * @param {string} branchId - The branch ID to delete
   */
  async deleteBranch(branchId) {
    log.info({ branchId, projectId: this.projectId }, 'Deleting Neon branch');

    await this.apiRequest('DELETE', `/projects/${this.projectId}/branches/${branchId}`);

    log.info({ branchId }, 'Neon branch deleted successfully');
  }

  /**
   * Find a branch by name
   * @param {string} branchName - Name of the branch to find
   * @returns {Promise<Object|null>} Branch details or null if not found
   */
  async findBranchByName(branchName) {
    const result = await this.apiRequest('GET', `/projects/${this.projectId}/branches`);

    const branch = result.branches?.find(b => b.name === branchName);
    return branch || null;
  }

  /**
   * Find and delete a tenant's branch by tenant name
   * @param {string} tenantName - Name of the tenant
   */
  async deleteTenantBranch(tenantName) {
    const branchName = `tenant-${tenantName}`;
    const branch = await this.findBranchByName(branchName);

    if (branch) {
      await this.deleteBranch(branch.id);
      return true;
    }

    log.warn({ tenantName, branchName }, 'Branch not found for deletion');
    return false;
  }

  /**
   * List all tenant branches
   * @returns {Promise<Array>} List of branches
   */
  async listBranches() {
    const result = await this.apiRequest('GET', `/projects/${this.projectId}/branches`);

    // Filter to only tenant branches
    return (result.branches || []).filter(b => b.name.startsWith('tenant-'));
  }
}

// Export singleton instance
const neonService = new NeonService();
export default neonService;
export { NeonService };
