import axios from 'axios';
import { createLogger } from '../utils/logger.js';

// Default logger - can be overridden via dependency injection for testing
const defaultLog = createLogger('prometheus-service');

class PrometheusService {
  /**
   * Create a PrometheusService instance
   * @param {Object} deps - Optional dependencies for testing
   * @param {Object} deps.httpClient - HTTP client (defaults to axios)
   * @param {Object} deps.config - Configuration overrides
   * @param {string} deps.config.prometheusUrl - Prometheus server URL
   * @param {Object} deps.logger - Logger instance
   */
  constructor(deps = {}) {
    const config = deps.config || {};
    // Prometheus service URL - can be configured via environment variable
    // Default to NodePort for external access (outside cluster)
    this.prometheusUrl = config.prometheusUrl || process.env.PROMETHEUS_URL || 'http://192.168.50.119:30090';
    this.baseUrl = `${this.prometheusUrl}/api/v1`;
    this.httpClient = deps.httpClient || axios;
    this.log = deps.logger || defaultLog;
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

      const response = await this.httpClient.get(`${this.baseUrl}/query`, { params });

      if (response.data.status === 'success') {
        return response.data.data;
      } else {
        throw new Error(`Prometheus query failed: ${response.data.error}`);
      }
    } catch (error) {
      this.log.error({ err: error, query }, 'Prometheus query failed');
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
      const response = await this.httpClient.get(`${this.baseUrl}/query_range`, { params });

      if (response.data.status === 'success') {
        return response.data.data;
      } else {
        throw new Error(`Prometheus range query failed: ${response.data.error}`);
      }
    } catch (error) {
      this.log.error({ err: error, query, start, end, step }, 'Prometheus range query failed');
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
   * Get HTTP request rate (RPS) for a specific tenant
   * @param {string} namespace - Tenant namespace
   * @param {string} timeRange - Time range (e.g., '5m')
   * @returns {Promise<Object>} Request rate data
   */
  async getTenantRequestRate(namespace, timeRange = '5m') {
    const query = `sum(rate(http_requests_total{namespace="${namespace}"}[${timeRange}]))`;
    return await this.query(query);
  }

  /**
   * Get HTTP error rate for a specific tenant
   * @param {string} namespace - Tenant namespace
   * @param {string} timeRange - Time range (e.g., '5m')
   * @returns {Promise<Object>} Error rate data
   */
  async getTenantErrorRate(namespace, timeRange = '5m') {
    const query = `sum(rate(http_requests_total{namespace="${namespace}", status=~"5.."}[${timeRange}]))`;
    return await this.query(query);
  }

  /**
   * Get P95 latency for a specific tenant
   * @param {string} namespace - Tenant namespace
   * @param {string} timeRange - Time range (e.g., '5m')
   * @returns {Promise<Object>} P95 latency data
   */
  async getTenantLatency(namespace, timeRange = '5m') {
    const query = `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{namespace="${namespace}"}[${timeRange}])) by (le))`;
    return await this.query(query);
  }

  /**
   * Get service availability (Running / Desired)
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Availability data
   */
  async getTenantAvailability(namespace) {
    // Check if available < desired for any deployment in namespace
    const query = `
      kube_deployment_status_replicas_available{namespace="${namespace}"} 
      / kube_deployment_spec_replicas{namespace="${namespace}"} * 100
    `;
    return await this.query(query);
  }

  /**
   * Get PVC storage usage
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Storage usage data
   */
  async getTenantPVCUsage(namespace) {
    const query = `
      sum(kubelet_volume_stats_used_bytes{namespace="${namespace}"}) 
      / sum(kubelet_volume_stats_capacity_bytes{namespace="${namespace}"}) * 100
    `;
    return await this.query(query);
  }

  /**
   * Get comprehensive tenant metrics overview
   * @param {string} namespace - Tenant namespace
   * @returns {Promise<Object>} Complete metrics data
   */
  async getTenantMetricsOverview(namespace) {
    try {
      const [
        cpu, 
        memory, 
        podStatus, 
        restarts, 
        networkIO, 
        quotaUsage,
        requestRate,
        errorRate,
        latency,
        availability,
        pvcUsage
      ] = await Promise.all([
        this.getTenantCPUUsage(namespace),
        this.getTenantMemoryUsage(namespace),
        this.getTenantPodStatus(namespace),
        this.getTenantPodRestarts(namespace),
        this.getTenantNetworkIO(namespace),
        this.getTenantQuotaUsage(namespace),
        this.getTenantRequestRate(namespace).catch(() => ({ result: [] })),
        this.getTenantErrorRate(namespace).catch(() => ({ result: [] })),
        this.getTenantLatency(namespace).catch(() => ({ result: [] })),
        this.getTenantAvailability(namespace).catch(() => ({ result: [] })),
        this.getTenantPVCUsage(namespace).catch(() => ({ result: [] }))
      ]);

      return {
        namespace,
        timestamp: Date.now(),
        cpu,
        memory,
        podStatus,
        restarts,
        networkIO,
        quotaUsage,
        appPerformance: {
          requestRate: parseFloat(requestRate.result[0]?.value[1] || 0),
          errorRate: parseFloat(errorRate.result[0]?.value[1] || 0),
          latency: parseFloat(latency.result[0]?.value[1] || 0)
        },
        reliability: {
          availability: parseFloat(availability.result[0]?.value[1] || 100), // Default to 100 if metric missing (optimistic) or 0 if query works but returns 0
          pvcUsage: parseFloat(pvcUsage.result[0]?.value[1] || 0)
        }
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

// Export the class for testing with dependency injection
export { PrometheusService };

// Factory function for creating instances with custom dependencies
export function createPrometheusService(deps = {}) {
  return new PrometheusService(deps);
}

// Default singleton instance for production use
const prometheusService = new PrometheusService();
export default prometheusService;
