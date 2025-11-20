const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');

// Tenant management routes
router.post('/', tenantController.createTenant.bind(tenantController));
router.get('/', tenantController.listTenants.bind(tenantController));
router.get('/:tenantName', tenantController.getTenant.bind(tenantController));
router.get('/:tenantName/metrics', tenantController.getTenantMetrics.bind(tenantController));
router.delete('/:tenantName', tenantController.deleteTenant.bind(tenantController));

module.exports = router;
