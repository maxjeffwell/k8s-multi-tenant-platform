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

// Helper to determine pod role from name
function getPodRole(podName) {
  const name = podName.toLowerCase();
  if (name.includes('client') || name.includes('frontend') || name.includes('web') || name.includes('ui')) {
    return 'client';
  }
  if (name.includes('server') || name.includes('api') || name.includes('backend') || name.includes('graphql')) {
    return 'server';
  }
  if (name.includes('mongo') || name.includes('postgres') || name.includes('mysql') || name.includes('redis') || name.includes('kafka') || name.includes('influx') || name.includes('clickhouse')) {
    return 'database';
  }
  return 'service';
}

// Helper to get icon based on role
function getIcon(role, podName) {
  const name = podName.toLowerCase();
  if (role === 'client') return 'browser';
  if (role === 'database') {
    if (name.includes('redis')) return 'database';
    if (name.includes('kafka')) return 'stream';
    return 'database';
  }
  if (role === 'server') return 'server';
  return 'cloud';
}

// Helper to extract app name from pod name
function getAppName(podName) {
  // Remove common suffixes like -client, -server, -api, hash suffixes
  return podName
    .replace(/-[a-f0-9]{8,10}-[a-z0-9]{5}$/, '') // Remove replicaset hash
    .replace(/-[a-f0-9]{5,}$/, '') // Remove deployment hash
    .replace(/-\d+$/, '') // Remove statefulset index
    .replace(/-(client|server|api|backend|frontend|web)$/, '');
}

// Generate topology data from Prometheus with real service relationships
router.get('/topology/data', async (req, res) => {
  try {
    const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus-kube-prometheus-prometheus.monitoring:9090';

    // Query for pod network traffic
    const query = `sum by (namespace, pod) (rate(container_network_receive_bytes_total{namespace!~"kube-.*|monitoring|default|velero|gpu-operator|cert-manager|traefik|argocd"}[5m]))`;

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query }
    });

    const metrics = response.data.data.result;

    // Build nodes with role classification
    const nodes = [];
    const nodeMap = new Map();

    metrics.forEach((metric) => {
      const namespace = metric.metric.namespace;
      const pod = metric.metric.pod;
      const value = parseFloat(metric.value[1]);
      const role = getPodRole(pod);
      const appName = getAppName(pod);

      const nodeId = `${namespace}/${pod}`;

      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          title: pod,
          subTitle: namespace,
          mainStat: value.toFixed(2),
          secondaryStat: namespace,
          role: role,
          appName: appName,
          arc__success: role === 'database' ? 0.9 : 0.8,
          icon: getIcon(role, pod)
        });
        nodes.push(nodeMap.get(nodeId));
      }
    });

    // Build edges based on actual service relationships
    const edges = [];
    const edgeSet = new Set();

    // Group nodes by namespace
    const namespaceGroups = new Map();
    nodes.forEach(node => {
      const namespace = node.subTitle;
      if (!namespaceGroups.has(namespace)) {
        namespaceGroups.set(namespace, []);
      }
      namespaceGroups.get(namespace).push(node);
    });

    // Create meaningful edges within each namespace
    namespaceGroups.forEach((pods, namespace) => {
      const clients = pods.filter(p => p.role === 'client');
      const servers = pods.filter(p => p.role === 'server');
      const databases = pods.filter(p => p.role === 'database');
      const services = pods.filter(p => p.role === 'service');

      // Client → Server connections (match by app name if possible)
      clients.forEach(client => {
        // Find matching server by app name
        let matchingServer = servers.find(s => s.appName === client.appName);
        // If no match, connect to first server
        if (!matchingServer && servers.length > 0) {
          matchingServer = servers[0];
        }
        if (matchingServer) {
          const edgeId = `${client.id}->${matchingServer.id}`;
          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            edges.push({
              id: edgeId,
              source: client.id,
              target: matchingServer.id,
              mainStat: 'HTTP'
            });
          }
        }
      });

      // Server → Database connections
      servers.forEach(server => {
        databases.forEach(db => {
          const edgeId = `${server.id}->${db.id}`;
          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            const dbType = db.title.toLowerCase().includes('mongo') ? 'MongoDB' :
                          db.title.toLowerCase().includes('postgres') ? 'PostgreSQL' :
                          db.title.toLowerCase().includes('redis') ? 'Redis' :
                          db.title.toLowerCase().includes('kafka') ? 'Kafka' : 'DB';
            edges.push({
              id: edgeId,
              source: server.id,
              target: db.id,
              mainStat: dbType
            });
          }
        });
      });

      // Service → Database connections (for services without explicit server role)
      services.forEach(service => {
        // Connect services to databases if there's no server in between
        if (servers.length === 0) {
          databases.forEach(db => {
            const edgeId = `${service.id}->${db.id}`;
            if (!edgeSet.has(edgeId)) {
              edgeSet.add(edgeId);
              edges.push({
                id: edgeId,
                source: service.id,
                target: db.id,
                mainStat: 'DB'
              });
            }
          });
        }
      });

      // Database replication connections (e.g., redis-master → redis-replicas)
      const redisMaster = databases.find(d => d.title.includes('redis-master'));
      const redisReplicas = databases.filter(d => d.title.includes('redis-replica'));
      if (redisMaster) {
        redisReplicas.forEach(replica => {
          const edgeId = `${redisMaster.id}->${replica.id}`;
          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            edges.push({
              id: edgeId,
              source: redisMaster.id,
              target: replica.id,
              mainStat: 'Replication'
            });
          }
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
