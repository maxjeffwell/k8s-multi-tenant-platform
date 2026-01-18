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
    const { namespace: targetNamespace } = req.query;

    // Build namespace filter for query
    let namespaceFilter;
    if (targetNamespace) {
      // For tenant-specific view: show tenant namespace + default namespace (for shared databases)
      namespaceFilter = `namespace=~"${targetNamespace}|default"`;
    } else {
      // For platform view: exclude system namespaces
      namespaceFilter = `namespace!~"kube-.*|monitoring|velero|gpu-operator|cert-manager|traefik|argocd|external-secrets"`;
    }

    // Query for pod network traffic
    const query = `sum by (namespace, pod) (rate(container_network_receive_bytes_total{${namespaceFilter}}[5m]))`;

    const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query }
    });

    const metrics = response.data.data.result;

    // Build nodes with role classification
    const nodes = [];
    const nodeMap = new Map();
    const tenantPods = []; // Track pods in tenant namespace for cross-namespace edge creation

    metrics.forEach((metric) => {
      const namespace = metric.metric.namespace;
      const pod = metric.metric.pod;
      const value = parseFloat(metric.value[1]);
      const role = getPodRole(pod);
      const appName = getAppName(pod);

      const nodeId = `${namespace}/${pod}`;

      // For tenant-specific view, track which pods belong to the tenant
      if (targetNamespace && namespace === targetNamespace) {
        tenantPods.push({ pod, role, appName });
      }

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

    // For tenant-specific view, filter to only show relevant nodes
    let filteredNodes = nodes;
    if (targetNamespace) {
      // Get app names from tenant pods to find related databases
      const tenantAppNames = new Set(tenantPods.map(p => p.appName));

      // Map app types to their database dependencies
      const appDatabaseMap = {
        'code-talk': ['postgresql-codetalk', 'redis'],
        // bookmarked uses Neon (external PostgreSQL) - no in-cluster database
        'educationelly': ['mongodb-educationelly'],
        'educationelly-graphql': ['mongodb-educationelly-graphql'],
        'intervalai': ['mongodb-intervalai']
      };

      filteredNodes = nodes.filter(node => {
        // Always include tenant namespace pods
        if (node.subTitle === targetNamespace) return true;

        // For default namespace, include databases matching app name and shared services
        if (node.subTitle === 'default') {
          const podName = node.title.toLowerCase();

          // Include databases that match tenant app names
          if (node.role === 'database') {
            // Check explicit database mappings first
            for (const app of tenantAppNames) {
              const databases = appDatabaseMap[app.toLowerCase()] || [];
              if (databases.some(db => podName.includes(db.replace('-', '')))) {
                return true;
              }
            }
            // Fallback: try to match app name directly (e.g., mongodb-educationelly for educationelly)
            return Array.from(tenantAppNames).some(app =>
              podName.includes(app.toLowerCase().replace(/-/g, ''))
            );
          }

          // Include shared services the app might use (AI, caching, etc.)
          const sharedServices = ['litellm', 'ollama', 'langfuse', 'shared-ai-gateway'];
          if (sharedServices.some(svc => podName.includes(svc))) {
            return true;
          }
        }

        return false;
      });
    }

    // Build edges based on actual service relationships
    const edges = [];
    const edgeSet = new Set();

    // Group filtered nodes by namespace
    const namespaceGroups = new Map();
    filteredNodes.forEach(node => {
      const namespace = node.subTitle;
      if (!namespaceGroups.has(namespace)) {
        namespaceGroups.set(namespace, []);
      }
      namespaceGroups.get(namespace).push(node);
    });

    // For tenant-specific view, create cross-namespace edges (tenant app → shared services/databases)
    if (targetNamespace && namespaceGroups.has(targetNamespace) && namespaceGroups.has('default')) {
      const tenantAppPods = namespaceGroups.get(targetNamespace).filter(p => p.role === 'server' || p.role === 'service');
      const defaultPods = namespaceGroups.get('default');
      const sharedDatabases = defaultPods.filter(p => p.role === 'database');
      const sharedServices = defaultPods.filter(p => p.role !== 'database');

      tenantAppPods.forEach(app => {
        // Connect to databases
        sharedDatabases.forEach(db => {
          const edgeId = `${app.id}->${db.id}`;
          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            const dbType = db.title.toLowerCase().includes('mongo') ? 'MongoDB' :
                          db.title.toLowerCase().includes('postgres') ? 'PostgreSQL' :
                          db.title.toLowerCase().includes('redis') ? 'Redis' : 'DB';
            edges.push({
              id: edgeId,
              source: app.id,
              target: db.id,
              mainStat: dbType
            });
          }
        });

        // Connect to shared services (AI, etc.)
        sharedServices.forEach(svc => {
          const edgeId = `${app.id}->${svc.id}`;
          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            const svcName = svc.title.toLowerCase();
            const connType = svcName.includes('litellm') || svcName.includes('ollama') ? 'HTTP/AI' :
                            svcName.includes('langfuse') ? 'HTTP/Telemetry' : 'HTTP';
            edges.push({
              id: edgeId,
              source: app.id,
              target: svc.id,
              mainStat: connType
            });
          }
        });
      });
    }

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

      // Server → Database connections (only if server actually uses that database)
      // Map of which apps use which databases
      const appDbMapping = {
        'code-talk': ['postgresql-codetalk', 'redis'],
        // bookmarked uses Neon (external PostgreSQL) - no in-cluster database to show
        'educationelly': ['mongodb-educationelly'],
        'educationelly-graphql': ['mongodb-educationelly-graphql'],
        'intervalai': ['mongodb-intervalai'],
        'tenantflow': ['mongodb'] // TenantFlow uses MongoDB for tenant data
      };

      servers.forEach(server => {
        const serverAppName = server.appName.toLowerCase();
        const serverDatabases = appDbMapping[serverAppName] || [];

        databases.forEach(db => {
          const dbName = db.title.toLowerCase();

          // Only create edge if this server uses this database
          const usesThisDb = serverDatabases.some(dbPattern =>
            dbName.includes(dbPattern.replace(/-/g, ''))
          );

          // Also allow if app name matches database name (fallback)
          const appMatchesDb = dbName.includes(serverAppName.replace(/-/g, ''));

          if (usesThisDb || appMatchesDb) {
            const edgeId = `${server.id}->${db.id}`;
            if (!edgeSet.has(edgeId)) {
              edgeSet.add(edgeId);
              const dbType = dbName.includes('mongo') ? 'MongoDB' :
                            dbName.includes('postgres') ? 'PostgreSQL' :
                            dbName.includes('redis') ? 'Redis' :
                            dbName.includes('kafka') ? 'Kafka' : 'DB';
              edges.push({
                id: edgeId,
                source: server.id,
                target: db.id,
                mainStat: dbType
              });
            }
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
      nodes: filteredNodes,
      edges,
      metadata: {
        total_nodes: filteredNodes.length,
        total_edges: edges.length,
        namespaces: Array.from(namespaceGroups.keys()),
        tenant: targetNamespace || null
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
