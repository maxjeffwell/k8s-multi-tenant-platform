import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

class MetricsService {
  /**
   * Get platform-wide metrics
   */
  async getPlatformMetrics() {
    try {
      const response = await axios.get(`${API_URL}/metrics/platform`);
      return response.data;
    } catch (error) {
      console.error('Error fetching platform metrics:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive metrics for a specific tenant
   */
  async getTenantMetrics(tenantName) {
    try {
      const response = await axios.get(`${API_URL}/metrics/tenant/${tenantName}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching metrics for ${tenantName}:`, error);
      throw error;
    }
  }

  /**
   * Get time-series data for charts
   */
  async getTenantTimeSeries(tenantName, timeRange = 3600) {
    try {
      const response = await axios.get(
        `${API_URL}/metrics/tenant/${tenantName}/timeseries`,
        { params: { range: timeRange } }
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching time series for ${tenantName}:`, error);
      throw error;
    }
  }

  /**
   * Get CPU usage for a tenant
   */
  async getTenantCPU(tenantName, timeRange = '5m') {
    try {
      const response = await axios.get(
        `${API_URL}/metrics/tenant/${tenantName}/cpu`,
        { params: { range: timeRange } }
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching CPU for ${tenantName}:`, error);
      throw error;
    }
  }

  /**
   * Get memory usage for a tenant
   */
  async getTenantMemory(tenantName) {
    try {
      const response = await axios.get(`${API_URL}/metrics/tenant/${tenantName}/memory`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching memory for ${tenantName}:`, error);
      throw error;
    }
  }

  /**
   * Get pod status for a tenant
   */
  async getTenantPods(tenantName) {
    try {
      const response = await axios.get(`${API_URL}/metrics/tenant/${tenantName}/pods`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching pods for ${tenantName}:`, error);
      throw error;
    }
  }

  /**
   * Get network I/O for a tenant
   */
  async getTenantNetwork(tenantName, timeRange = '5m') {
    try {
      const response = await axios.get(
        `${API_URL}/metrics/tenant/${tenantName}/network`,
        { params: { range: timeRange } }
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching network for ${tenantName}:`, error);
      throw error;
    }
  }

  /**
   * Get quota usage for a tenant
   */
  async getTenantQuota(tenantName) {
    try {
      const response = await axios.get(`${API_URL}/metrics/tenant/${tenantName}/quota`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching quota for ${tenantName}:`, error);
      throw error;
    }
  }

  /**
   * Format bytes to human-readable format
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0 || bytes === '0') return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(parseFloat(bytes)) / Math.log(k));

    return parseFloat((parseFloat(bytes) / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Format CPU cores to human-readable format
   */
  formatCPU(cores, decimals = 3) {
    const value = parseFloat(cores);
    if (isNaN(value)) return '0 cores';
    if (value < 0.001) return `${(value * 1000).toFixed(decimals)} millicores`;
    return `${value.toFixed(decimals)} cores`;
  }
}

export default new MetricsService();
