import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('grafana-routes');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const GRAFANA_URL = process.env.GRAFANA_URL || 'http://192.168.50.119:30300';
const GRAFANA_API_KEY = process.env.GRAFANA_API_KEY || '';

// Get the service topology dashboard JSON
router.get('/dashboard/topology', async (req, res) => {
  try {
    const dashboardPath = path.join(__dirname, '../dashboards/service-topology.json');
    const dashboardJson = await fs.readFile(dashboardPath, 'utf-8');
    res.json(JSON.parse(dashboardJson));
  } catch (error) {
    log.error({ err: error }, 'Failed to read dashboard configuration');
    res.status(500).json({ error: 'Failed to read dashboard configuration' });
  }
});

// Import dashboard to Grafana
router.post('/dashboard/import', async (req, res) => {
  try {
    const dashboardPath = path.join(__dirname, '../dashboards/service-topology.json');
    const dashboardJson = await fs.readFile(dashboardPath, 'utf-8');
    const dashboard = JSON.parse(dashboardJson);

    const grafanaAuth = GRAFANA_API_KEY
      ? { headers: { 'Authorization': `Bearer ${GRAFANA_API_KEY}` } }
      : { auth: { username: 'admin', password: 'admin' } };

    const response = await axios.post(
      `${GRAFANA_URL}/api/dashboards/db`,
      dashboard,
      grafanaAuth
    );

    log.info({ uid: response.data.uid }, 'Dashboard imported successfully');
    res.json({
      success: true,
      message: 'Dashboard imported successfully',
      url: `${GRAFANA_URL}${response.data.url}`,
      uid: response.data.uid
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to import dashboard to Grafana');
    res.status(500).json({
      error: 'Failed to import dashboard to Grafana',
      message: error.message,
      details: error.response?.data
    });
  }
});

// Generate topology data from Prometheus
router.get('/topology/data', async (req, res) => {
  try {
    const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://192.168.50.119:30090';

    // Query for pod network connections
    const query = `sum by (namespace, pod) (rate(container_network_receive_bytes_total{namespace=~"test-school.*"}[5m]))`;

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query }
    });

    const metrics = response.data.data.result;

    // Transform to nodes and edges format
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    metrics.forEach((metric, index) => {
      const namespace = metric.metric.namespace;
      const pod = metric.metric.pod;
      const value = parseFloat(metric.value[1]);

      const nodeId = `${namespace}/${pod}`;

      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          title: pod,
          subTitle: namespace,
          mainStat: value.toFixed(2),
          secondaryStat: namespace,
          arc__success: 0.8,
          icon: 'cloud'
        });
        nodes.push(nodeMap.get(nodeId));
      }
    });

    // Create edges between pods in the same namespace
    const namespaceGroups = new Map();
    nodes.forEach(node => {
      const namespace = node.subTitle;
      if (!namespaceGroups.has(namespace)) {
        namespaceGroups.set(namespace, []);
      }
      namespaceGroups.get(namespace).push(node);
    });

    namespaceGroups.forEach((pods, namespace) => {
      for (let i = 0; i < pods.length - 1; i++) {
        edges.push({
          id: `${pods[i].id}-${pods[i + 1].id}`,
          source: pods[i].id,
          target: pods[i + 1].id,
          mainStat: '0.5 Mb/s'
        });
      }
    });

    res.json({
      nodes,
      edges,
      metadata: {
        total_nodes: nodes.length,
        total_edges: edges.length,
        namespaces: Array.from(namespaceGroups.keys())
      }
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to generate topology data');
    res.status(500).json({
      error: 'Failed to generate topology data',
      message: error.message
    });
  }
});

export default router;
