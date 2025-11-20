import express from 'express';
import deploymentController from '../controllers/deploymentController.js';

const router = express.Router();

// Deployment routes
router.post('/:tenantName/deploy', deploymentController.deployApp.bind(deploymentController));
router.patch('/:tenantName/:deploymentName/scale', deploymentController.scaleDeployment.bind(deploymentController));

export default router;
