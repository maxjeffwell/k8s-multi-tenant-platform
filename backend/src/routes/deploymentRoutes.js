const express = require('express');
const router = express.Router();
const deploymentController = require('../controllers/deploymentController');

// Deployment routes
router.post('/:tenantName/deploy', deploymentController.deployApp.bind(deploymentController));
router.patch('/:tenantName/:deploymentName/scale', deploymentController.scaleDeployment.bind(deploymentController));

module.exports = router;
