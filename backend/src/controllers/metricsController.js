import prometheusService from '../services/prometheusService.js';

class MetricsController {
  /**
   * Get comprehensive metrics for a specific tenant
   * GET /api/metrics/tenant/:tenantName
   */
  async getTenantMetrics(req, res) {
    try {
      const { tenantName } = req.params;

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      const metrics = await prometheusService.getTenantMetricsOverview(tenantName);

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Error fetching tenant metrics:', error);
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
      const { tenantName } = req.params;
      const timeRange = parseInt(req.query.range) || 3600; // Default 1 hour

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      // Validate time range (1 hour to 24 hours)
      if (timeRange < 3600 || timeRange > 86400) {
        return res.status(400).json({
          error: 'Time range must be between 3600 (1 hour) and 86400 (24 hours) seconds'
        });
      }

      const timeSeries = await prometheusService.getTenantTimeSeries(tenantName, timeRange);

      res.json({
        success: true,
        data: timeSeries
      });
    } catch (error) {
      console.error('Error fetching tenant time series:', error);
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
      console.error('Error fetching platform metrics:', error);
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
      const { tenantName } = req.params;
      const timeRange = req.query.range || '5m';

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      const cpu = await prometheusService.getTenantCPUUsage(tenantName, timeRange);

      res.json({
        success: true,
        data: cpu
      });
    } catch (error) {
      console.error('Error fetching tenant CPU:', error);
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
      const { tenantName } = req.params;

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      const memory = await prometheusService.getTenantMemoryUsage(tenantName);

      res.json({
        success: true,
        data: memory
      });
    } catch (error) {
      console.error('Error fetching tenant memory:', error);
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
      const { tenantName } = req.params;

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      const pods = await prometheusService.getTenantPodStatus(tenantName);

      res.json({
        success: true,
        data: pods
      });
    } catch (error) {
      console.error('Error fetching tenant pods:', error);
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
      const { tenantName } = req.params;
      const timeRange = req.query.range || '5m';

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      const network = await prometheusService.getTenantNetworkIO(tenantName, timeRange);

      res.json({
        success: true,
        data: network
      });
    } catch (error) {
      console.error('Error fetching tenant network:', error);
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
      const { tenantName } = req.params;

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      const quota = await prometheusService.getTenantQuotaUsage(tenantName);

      res.json({
        success: true,
        data: quota
      });
    } catch (error) {
      console.error('Error fetching tenant quota:', error);
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
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'PromQL query is required' });
      }

      const result = await prometheusService.query(query);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error executing custom query:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new MetricsController();
