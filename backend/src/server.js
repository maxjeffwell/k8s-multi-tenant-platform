require('dotenv').config();
const express = require('express');
const cors = require('cors');
const tenantRoutes = require('./routes/tenantRoutes');
const deploymentRoutes = require('./routes/deploymentRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/tenants', tenantRoutes);
app.use('/api/deployments', deploymentRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Multi-Tenant Platform API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
