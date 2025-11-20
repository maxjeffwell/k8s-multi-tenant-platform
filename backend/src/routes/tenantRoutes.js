import express from 'express';
import tenantController from '../controllers/tenantController.js';

const router = express.Router();

// Tenant management routes
router.post('/', tenantController.createTenant.bind(tenantController));
router.get('/', tenantController.listTenants.bind(tenantController));
router.get('/:tenantName', tenantController.getTenant.bind(tenantController));
router.get('/:tenantName/metrics', tenantController.getTenantMetrics.bind(tenantController));
router.delete('/:tenantName', tenantController.deleteTenant.bind(tenantController));

export default router;
