import prometheusService from '../services/prometheusService.js';
import k8sService from '../services/k8sService.js';
import { createLogger } from '../utils/logger.js';
import {
  validateBody,
  validateParams,
  tenantNameParamSchema,
  metricsTimeSeriesQuerySchema,
  metricsRangeQuerySchema,
  customPromqlQuerySchema
} from '../utils/validation.js';

const log = createLogger('metrics-controller');

class MetricsController {
  /**
   * Get comprehensive metrics for a specific tenant
   * GET /api/metrics/tenant/:tenantName
   */
  async getTenantMetrics(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);

      const metrics = await prometheusService.getTenantMetricsOverview(tenantName);

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to fetch tenant metrics');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get time-series data for charts
   * GET /api/metrics/tenant/:tenantName/timeseries?range=3600
   */
  async getTenantTimeSeries(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
      // Validate query params - time range in seconds (3600-86400)
      const { range } = validateBody(metricsTimeSeriesQuerySchema, req.query);
      const timeRange = range || 3600;

      const timeSeries = await prometheusService.getTenantTimeSeries(tenantName, timeRange);

      res.json({
        success: true,
        data: timeSeries
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName, range: req.query?.range }, 'Failed to fetch tenant time series');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get platform-wide metrics (all tenants)
   * GET /api/metrics/platform
   */
  async getPlatformMetrics(req, res) {
    try {
      const metrics = await prometheusService.getPlatformMetrics();

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch platform metrics');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get CPU usage for a tenant
   * GET /api/metrics/tenant/:tenantName/cpu?range=5m
   */
  async getTenantCPU(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
      // Validate query params - time range format (e.g., '5m', '1h')
      const { range } = validateBody(metricsRangeQuerySchema, req.query);
      const timeRange = range || '5m';

      const cpu = await prometheusService.getTenantCPUUsage(tenantName, timeRange);

      res.json({
        success: true,
        data: cpu
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to fetch tenant CPU');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get memory usage for a tenant
   * GET /api/metrics/tenant/:tenantName/memory
   */
  async getTenantMemory(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);

      const memory = await prometheusService.getTenantMemoryUsage(tenantName);

      res.json({
        success: true,
        data: memory
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to fetch tenant memory');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get pod status for a tenant
   * GET /api/metrics/tenant/:tenantName/pods
   */
  async getTenantPods(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);

      const pods = await prometheusService.getTenantPodStatus(tenantName);

      res.json({
        success: true,
        data: pods
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to fetch tenant pods');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete a pod for a tenant
   * DELETE /api/metrics/tenant/:tenantName/pods/:podName
   */
  async deleteTenantPod(req, res) {
    try {
      const { tenantName, podName } = req.params;

      // Validate tenant name
      validateParams(tenantNameParamSchema, { tenantName });

      if (!podName || typeof podName !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Pod name is required'
        });
      }

      const result = await k8sService.deletePod(tenantName, podName);

      if (result.deleted) {
        res.json({
          success: true,
          message: `Pod ${podName} deleted successfully`,
          data: result
        });
      } else if (result.reason === 'not_found') {
        res.status(404).json({
          success: false,
          error: `Pod ${podName} not found in namespace ${tenantName}`
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to delete pod'
        });
      }
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName, podName: req.params?.podName }, 'Failed to delete pod');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get network I/O for a tenant
   * GET /api/metrics/tenant/:tenantName/network?range=5m
   */
  async getTenantNetwork(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
      // Validate query params - time range format (e.g., '5m', '1h')
      const { range } = validateBody(metricsRangeQuerySchema, req.query);
      const timeRange = range || '5m';

      const network = await prometheusService.getTenantNetworkIO(tenantName, timeRange);

      res.json({
        success: true,
        data: network
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to fetch tenant network');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get quota usage for a tenant
   * GET /api/metrics/tenant/:tenantName/quota
   */
  async getTenantQuota(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);

      const quota = await prometheusService.getTenantQuotaUsage(tenantName);

      res.json({
        success: true,
        data: quota
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to fetch tenant quota');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Execute a custom PromQL query (admin use)
   * POST /api/metrics/query
   * Body: { query: "sum(kube_pod_info)" }
   */
  async customQuery(req, res) {
    try {
      // Validate request body - validates and sanitizes PromQL query
      const { query } = validateBody(customPromqlQuerySchema, req.body);

      log.debug({ query }, 'Executing custom PromQL query');
      const result = await prometheusService.query(query);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, query: req.body?.query }, 'Failed to execute custom query');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new MetricsController();
