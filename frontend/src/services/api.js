import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tenant API
export const tenantApi = {
  // Create a new tenant
  createTenant: async (tenantName, resourceQuota) => {
    const response = await api.post('/tenants', { tenantName, resourceQuota });
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

export default api;
