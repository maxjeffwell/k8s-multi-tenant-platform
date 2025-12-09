import express from 'express';
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('prometheus-routes');

const router = express.Router();
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://192.168.50.119:30090';

// Proxy GET requests to Prometheus API
router.get('/query', async (req, res) => {
  try {
    const { query, time } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const params = { query };
    if (time) params.time = time;

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params });
    res.json(response.data);
  } catch (error) {
    log.error({ err: error, query: req.query?.query }, 'Prometheus query failed');
    res.status(500).json({
      error: 'Failed to query Prometheus',
      message: error.message
    });
  }
});

// Proxy GET requests for range queries
router.get('/query_range', async (req, res) => {
  try {
    const { query, start, end, step } = req.query;

    if (!query || !start || !end) {
      return res.status(400).json({
        error: 'Query, start, and end parameters are required'
      });
    }

    const params = { query, start, end };
    if (step) params.step = step;

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, { params });
    res.json(response.data);
  } catch (error) {
    log.error({ err: error, query: req.query?.query }, 'Prometheus range query failed');
    res.status(500).json({
      error: 'Failed to query Prometheus range',
      message: error.message
    });
  }
});

// Get all metrics/labels
router.get('/labels', async (req, res) => {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/labels`);
    res.json(response.data);
  } catch (error) {
    log.error({ err: error }, 'Failed to get Prometheus labels');
    res.status(500).json({
      error: 'Failed to get Prometheus labels',
      message: error.message
    });
  }
});

// Get label values
router.get('/label/:name/values', async (req, res) => {
  try {
    const { name } = req.params;
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/label/${name}/values`);
    res.json(response.data);
  } catch (error) {
    log.error({ err: error, labelName: req.params?.name }, 'Failed to get Prometheus label values');
    res.status(500).json({
      error: 'Failed to get Prometheus label values',
      message: error.message
    });
  }
});

// Get series metadata
router.get('/series', async (req, res) => {
  try {
    const { match } = req.query;
    if (!match) {
      return res.status(400).json({ error: 'Match parameter is required' });
    }

    const params = { 'match[]': match };
    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/series`, { params });
    res.json(response.data);
  } catch (error) {
    log.error({ err: error, match: req.query?.match }, 'Failed to get Prometheus series');
    res.status(500).json({
      error: 'Failed to get Prometheus series',
      message: error.message
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const response = await axios.get(`${PROMETHEUS_URL}/-/healthy`);
    res.json({ status: 'ok', prometheus: response.status === 200 });
  } catch (error) {
    log.warn({ err: error }, 'Prometheus health check failed');
    res.status(500).json({
      status: 'error',
      message: 'Prometheus is not accessible'
    });
  }
});

export default router;
