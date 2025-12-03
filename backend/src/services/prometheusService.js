import axios from 'axios';

class PrometheusService {
  constructor() {
    // Prometheus service URL - can be configured via environment variable
    // Default to NodePort for external access (outside cluster)
    this.prometheusUrl = process.env.PROMETHEUS_URL || 'http://192.168.50.119:30090';
    this.baseUrl = `${this.prometheusUrl}/api/v1`;
  }

  /**
   * Execute a PromQL query
   * @param {string} query - PromQL query string
   * @param {number} time - Unix timestamp (optional)
   * @returns {Promise<Object>} Query result
   */
  async query(query, time = null) {
    try {
      const params = { query };
      if (time) {
        params.time = time;
      }

      const response = await axios.get(`${this.baseUrl}/query`, { params });

      if (response.data.status === 'success') {
        return response.data.data;
      } else {
        throw new Error(`Prometheus query failed: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Prometheus query error:', error.message);
      throw new Error(`Failed to query Prometheus: ${error.message}`);
    }
  }

  /**
   * Execute a PromQL range query
   * @param {string} query - PromQL query string
   * @param {number} start - Start timestamp
   * @param {number} end - End timestamp
   * @param {string} step - Query resolution step (e.g., '15s', '1m')
   * @returns {Promise<Object>} Range query result
   */
  async queryRange(query, start, end, step = '15s') {
    try {
      const params = { query, start, end, step };
      const response = await axios.get(`${this.baseUrl}/query_range`, { params });

      if (response.data.status === 'success') {
        return response.data.data;
      } else {
        throw new Error(`Prometheus range query failed: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Prometheus range query error:', error.message);
      throw new Error(`Failed to query Prometheus range: ${error.message}`);
    }
  }

  /**
   * Get CPU usage for a specific tenant namespace
   * @param {string} namespace - Tenant namespace
   * @param {string} timeRange - Time range (e.g., '5m', '1h')
   * @returns {Promise<Object>} CPU usage data
   */
  async getTenantCPUUsage(namespace, timeRange = '5m') {
    const query = `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",container!="",container!="POD"}[${timeRange}])) by (pod)`;
    return await this.query(query);
  }

  /**
   * Get memory usage for a specific tenant namespace
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Memory usage data
   */
  async getTenantMemoryUsage(namespace) {
    const query = `sum(container_memory_working_set_bytes{namespace="${namespace}",container!="",container!="POD"}) by (pod)`;
    return await this.query(query);
  }

  /**
   * Get pod status for a specific tenant
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Pod status data
   */
  async getTenantPodStatus(namespace) {
    const query = `kube_pod_status_phase{namespace="${namespace}"}`;
    return await this.query(query);
  }

  /**
   * Get pod restart count for a specific tenant
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Pod restart data
   */
  async getTenantPodRestarts(namespace) {
    const query = `sum(kube_pod_container_status_restarts_total{namespace="${namespace}"}) by (pod)`;
    return await this.query(query);
  }

  /**
   * Get network I/O for a specific tenant
   * @param {string} namespace - Tenant namespace
   * @param {string} timeRange - Time range (e.g., '5m', '1h')
   * @returns {Promise<Object>} Network I/O data
   */
  async getTenantNetworkIO(namespace, timeRange = '5m') {
    const receiveQuery = `sum(rate(container_network_receive_bytes_total{namespace="${namespace}"}[${timeRange}])) by (pod)`;
    const transmitQuery = `sum(rate(container_network_transmit_bytes_total{namespace="${namespace}"}[${timeRange}])) by (pod)`;

    const [receive, transmit] = await Promise.all([
      this.query(receiveQuery),
      this.query(transmitQuery)
    ]);

    return {
      receive,
      transmit
    };
  }

  /**
   * Get resource quota usage for a specific tenant
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Quota usage data
   */
  async getTenantQuotaUsage(namespace) {
    const cpuUsageQuery = `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}"}[5m]))`;
    const cpuQuotaQuery = `sum(kube_resourcequota{namespace="${namespace}",resource="limits.cpu"})`;
    const memoryUsageQuery = `sum(container_memory_working_set_bytes{namespace="${namespace}"})`;
    const memoryQuotaQuery = `sum(kube_resourcequota{namespace="${namespace}",resource="limits.memory"})`;

    try {
      const [cpuUsage, cpuQuota, memoryUsage, memoryQuota] = await Promise.all([
        this.query(cpuUsageQuery),
        this.query(cpuQuotaQuery),
        this.query(memoryUsageQuery),
        this.query(memoryQuotaQuery)
      ]);

      return {
        cpu: {
          usage: cpuUsage.result[0]?.value[1] || '0',
          quota: cpuQuota.result[0]?.value[1] || '0',
          percentage: cpuQuota.result[0]?.value[1]
            ? ((parseFloat(cpuUsage.result[0]?.value[1] || 0) / parseFloat(cpuQuota.result[0]?.value[1])) * 100).toFixed(2)
            : '0'
        },
        memory: {
          usage: memoryUsage.result[0]?.value[1] || '0',
          quota: memoryQuota.result[0]?.value[1] || '0',
          percentage: memoryQuota.result[0]?.value[1]
            ? ((parseFloat(memoryUsage.result[0]?.value[1] || 0) / parseFloat(memoryQuota.result[0]?.value[1])) * 100).toFixed(2)
            : '0'
        }
      };
    } catch (error) {
      // If quotas don't exist, return just usage
      const [cpuUsage, memoryUsage] = await Promise.all([
        this.query(cpuUsageQuery),
        this.query(memoryUsageQuery)
      ]);

      return {
        cpu: {
          usage: cpuUsage.result[0]?.value[1] || '0',
          quota: null,
          percentage: null
        },
        memory: {
          usage: memoryUsage.result[0]?.value[1] || '0',
          quota: null,
          percentage: null
        }
      };
    }
  }

  /**
   * Get comprehensive tenant metrics overview
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Complete metrics data
   */
  async getTenantMetricsOverview(namespace) {
    try {
      const [cpu, memory, podStatus, restarts, networkIO, quotaUsage] = await Promise.all([
        this.getTenantCPUUsage(namespace),
        this.getTenantMemoryUsage(namespace),
        this.getTenantPodStatus(namespace),
        this.getTenantPodRestarts(namespace),
        this.getTenantNetworkIO(namespace),
        this.getTenantQuotaUsage(namespace)
      ]);

      return {
        namespace,
        timestamp: Date.now(),
        cpu,
        memory,
        podStatus,
        restarts,
        networkIO,
        quotaUsage
      };
    } catch (error) {
      throw new Error(`Failed to get tenant metrics overview: ${error.message}`);
    }
  }

  /**
   * Get platform-wide metrics (all tenants)
   * @returns {Promise<Object>} Platform metrics
   */
  async getPlatformMetrics() {
    try {
      const totalTenantsQuery = 'count(kube_namespace_labels{label_app_kubernetes_io_managed_by="multi-tenant-platform"})';
      const totalPodsQuery = 'sum(kube_pod_info{namespace!~"kube-.*|monitoring|default"})';
      const runningPodsQuery = 'sum(kube_pod_status_phase{phase="Running",namespace!~"kube-.*|monitoring|default"})';
      const failedPodsQuery = 'sum(kube_pod_status_phase{phase=~"Failed|Pending",namespace!~"kube-.*|monitoring|default"})';
      const cpuByTenantQuery = 'sum(rate(container_cpu_usage_seconds_total{namespace!~"kube-.*|monitoring|default",container!="",container!="POD"}[5m])) by (namespace)';
      const memoryByTenantQuery = 'sum(container_memory_working_set_bytes{namespace!~"kube-.*|monitoring|default",container!="",container!="POD"}) by (namespace)';

      const [totalTenants, totalPods, runningPods, failedPods, cpuByTenant, memoryByTenant] = await Promise.all([
        this.query(totalTenantsQuery),
        this.query(totalPodsQuery),
        this.query(runningPodsQuery),
        this.query(failedPodsQuery),
        this.query(cpuByTenantQuery),
        this.query(memoryByTenantQuery)
      ]);

      return {
        timestamp: Date.now(),
        summary: {
          totalTenants: parseInt(totalTenants.result[0]?.value[1] || 0),
          totalPods: parseInt(totalPods.result[0]?.value[1] || 0),
          runningPods: parseInt(runningPods.result[0]?.value[1] || 0),
          failedPods: parseInt(failedPods.result[0]?.value[1] || 0)
        },
        cpuByTenant,
        memoryByTenant
      };
    } catch (error) {
      throw new Error(`Failed to get platform metrics: ${error.message}`);
    }
  }

  /**
   * Get time-series data for charts
   * @param {string} namespace - Tenant namespace
   * @param {string} timeRange - Time range in seconds (e.g., 3600 for 1 hour)
   * @returns {Promise<Object>} Time-series metrics
   */
  async getTenantTimeSeries(namespace, timeRange = 3600) {
    const end = Math.floor(Date.now() / 1000);
    const start = end - timeRange;
    const step = Math.max(Math.floor(timeRange / 100), 15); // Max 100 data points, min 15s step

    const cpuQuery = `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",container!="",container!="POD"}[1m])) by (pod)`;
    const memoryQuery = `sum(container_memory_working_set_bytes{namespace="${namespace}",container!="",container!="POD"}) by (pod)`;

    try {
      const [cpu, memory] = await Promise.all([
        this.queryRange(cpuQuery, start, end, `${step}s`),
        this.queryRange(memoryQuery, start, end, `${step}s`)
      ]);

      return {
        cpu,
        memory,
        timeRange: {
          start,
          end,
          step
        }
      };
    } catch (error) {
      throw new Error(`Failed to get tenant time series: ${error.message}`);
    }
  }
}

export default new PrometheusService();
