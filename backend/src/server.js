import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import logger, { httpLoggerConfig, createLogger } from './utils/logger.js';
import tenantRoutes from './routes/tenantRoutes.js';
import deploymentRoutes from './routes/deploymentRoutes.js';
import databaseRoutes from './routes/databaseRoutes.js';
import prometheusRoutes from './routes/prometheusRoutes.js';
import metricsRoutes from './routes/metrics.js';
import grafanaRoutes from './routes/grafanaRoutes.js';

const log = createLogger('server');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Structured request logging with pino-http
app.use(pinoHttp(httpLoggerConfig));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/tenants', tenantRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/prometheus', prometheusRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/grafana', grafanaRoutes);

// Error handling
app.use((err, req, res, next) => {
  const correlationId = req.id;

  log.error({
    err,
    correlationId,
    method: req.method,
    path: req.path,
    statusCode: 500
  }, 'Unhandled error in request');

  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    correlationId
  });
});

// 404 handler
app.use((req, res) => {
  log.warn({
    method: req.method,
    path: req.path,
    statusCode: 404
  }, 'Route not found');

  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  log.info({
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    healthCheck: `http://localhost:${PORT}/health`
  }, 'Multi-Tenant Platform API started');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'Uncaught exception - shutting down');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log.error({ reason, promise }, 'Unhandled promise rejection');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('SIGTERM received - shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('SIGINT received - shutting down gracefully');
  process.exit(0);
});
