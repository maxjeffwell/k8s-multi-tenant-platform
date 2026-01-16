import express from 'express';
import metricsController from '../controllers/metricsController.js';

const router = express.Router();

// Platform-wide metrics
router.get('/platform', metricsController.getPlatformMetrics);

// Tenant-specific metrics
router.get('/tenant/:tenantName', metricsController.getTenantMetrics);
router.get('/tenant/:tenantName/timeseries', metricsController.getTenantTimeSeries);
router.get('/tenant/:tenantName/cpu', metricsController.getTenantCPU);
router.get('/tenant/:tenantName/memory', metricsController.getTenantMemory);
router.get('/tenant/:tenantName/pods', metricsController.getTenantPods);
router.delete('/tenant/:tenantName/pods/:podName', metricsController.deleteTenantPod.bind(metricsController));
router.get('/tenant/:tenantName/network', metricsController.getTenantNetwork);
router.get('/tenant/:tenantName/quota', metricsController.getTenantQuota);

// Custom PromQL query endpoint (for advanced users/admins)
router.post('/query', metricsController.customQuery);

export default router;
