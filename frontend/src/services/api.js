import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tenant API
export const tenantApi = {
  // Create a new tenant
  createTenant: async (tenantData) => {
    const response = await api.post('/tenants', tenantData);
    return response.data;
  },

  // List all tenants
  listTenants: async () => {
    const response = await api.get('/tenants');
    return response.data;
  },

  // Get tenant details
  getTenant: async (tenantName) => {
    const response = await api.get(`/tenants/${tenantName}`);
    return response.data;
  },

  // Get tenant metrics
  getTenantMetrics: async (tenantName) => {
    const response = await api.get(`/tenants/${tenantName}/metrics`);
    return response.data;
  },

  // Update a tenant
  updateTenant: async (tenantName, resourceQuota) => {
    const response = await api.patch(`/tenants/${tenantName}`, { resourceQuota });
    return response.data;
  },

  // Delete a tenant
  deleteTenant: async (tenantName) => {
    const response = await api.delete(`/tenants/${tenantName}`);
    return response.data;
  },
};

// Deployment API
export const deploymentApi = {
  // Deploy app to tenant
  deployApp: async (tenantName, config) => {
    const response = await api.post(`/deployments/${tenantName}/deploy`, config);
    return response.data;
  },

  // Scale deployment
  scaleDeployment: async (tenantName, deploymentName, replicas) => {
    const response = await api.patch(`/deployments/${tenantName}/${deploymentName}/scale`, {
      replicas,
    });
    return response.data;
  },
};

// Database API
export const databaseApi = {
  // Get available database options
  getAvailableDatabases: async () => {
    const response = await api.get('/database/options');
    return response.data;
  },

  // Enable database for tenant (auto-provision)
  enableDatabase: async (tenantName) => {
    const response = await api.post(`/database/${tenantName}/database`);
    return response.data;
  },

  // Enable database with database key
  enableDatabaseWithKey: async (tenantName, databaseKey) => {
    const response = await api.post(`/database/${tenantName}/database`, { databaseKey });
    return response.data;
  },

  // Enable database with specific credentials
  enableDatabaseWithCredentials: async (tenantName, credentials) => {
    const response = await api.post(`/database/${tenantName}/database`, credentials);
    return response.data;
  },

  // Disable database for tenant
  disableDatabase: async (tenantName) => {
    const response = await api.delete(`/database/${tenantName}/database`);
    return response.data;
  },

  // Get database status
  getDatabaseStatus: async (tenantName) => {
    const response = await api.get(`/database/${tenantName}/database/status`);
    return response.data;
  },
};

// Prometheus API
export const prometheusApi = {
  // Query instant values
  query: async (query, time = null) => {
    const params = { query };
    if (time) params.time = time;
    const response = await api.get('/prometheus/query', { params });
    return response.data;
  },

  // Query range of values over time
  queryRange: async (query, start, end, step = '15s') => {
    const params = { query, start, end, step };
    const response = await api.get('/prometheus/query_range', { params });
    return response.data;
  },

  // Get all available labels
  getLabels: async () => {
    const response = await api.get('/prometheus/labels');
    return response.data;
  },

  // Get values for a specific label
  getLabelValues: async (labelName) => {
    const response = await api.get(`/prometheus/label/${labelName}/values`);
    return response.data;
  },

  // Get series metadata
  getSeries: async (match) => {
    const response = await api.get('/prometheus/series', { params: { match } });
    return response.data;
  },

  // Check Prometheus health
  checkHealth: async () => {
    const response = await api.get('/prometheus/health');
    return response.data;
  },
};

export default api;
