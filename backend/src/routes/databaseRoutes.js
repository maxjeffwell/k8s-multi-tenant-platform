import express from 'express';
import databaseController from '../controllers/databaseController.js';

const router = express.Router();

// Database management routes
router.get('/options', databaseController.getAvailableDatabases.bind(databaseController));
router.get('/test', databaseController.testDatabaseConnection.bind(databaseController));
router.post('/:tenantName/database', databaseController.createDatabase.bind(databaseController));
router.post('/:tenantName/database/connect', databaseController.connectExistingDatabase.bind(databaseController));
router.delete('/:tenantName/database', databaseController.deleteDatabase.bind(databaseController));
router.get('/:tenantName/database/status', databaseController.getDatabaseStatus.bind(databaseController));

export default router;
