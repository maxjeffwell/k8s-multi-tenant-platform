import { k8sApi, k8sAppsApi, k8sNetworkingApi, k8sCustomObjectsApi } from '../config/k8s.js';
import * as k8s from '@kubernetes/client-node';
import { createLogger } from '../utils/logger.js';
import neonService from './neonService.js';

// Default logger - can be overridden via dependency injection for testing
const defaultLog = createLogger('k8s-service');

// Input validation for Kubernetes resource names
// RFC 1123: lowercase alphanumeric, hyphens allowed (not at start/end), max 63 chars
const K8S_NAME_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function validateResourceName(name, resourceType = 'resource') {
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid ${resourceType} name: name is required`);
  }

  const trimmed = name.trim().toLowerCase();

  if (trimmed.length === 0) {
    throw new Error(`Invalid ${resourceType} name: cannot be empty`);
  }

  if (trimmed.length > 63) {
    throw new Error(`Invalid ${resourceType} name: exceeds 63 character limit`);
  }

  if (!K8S_NAME_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid ${resourceType} name "${name}": must be lowercase alphanumeric, ` +
      `may contain hyphens (not at start/end), max 63 characters`
    );
  }

  return trimmed;
}

// Helper to extract response body from K8s client responses
function extractBody(response) {
  return response?.body || response;
}

// Helper to check if error is "not found"
function isNotFoundError(error) {
  const statusCode = error?.response?.statusCode || error?.statusCode || error?.code;
  return statusCode === 404 ||
    (error?.message && error.message.toLowerCase().includes('not found'));
}

// Helper to check if error is "already exists"
function isAlreadyExistsError(error) {
  const statusCode = error?.response?.statusCode || error?.statusCode;
  return statusCode === 409 ||
    (error?.message && error.message.toLowerCase().includes('already exists'));
}

/**
 * Execute a Kubernetes API call with automatic create-or-update logic
 * Tries to create a resource, and if it already exists, updates it instead
 * @param {Function} createFn - Function to create the resource
 * @param {Function} updateFn - Function to update the resource (called if already exists)
 * @param {string} resourceType - Type of resource for error messages
 * @returns {Promise<any>} The created or updated resource
 */
async function createOrUpdate(createFn, updateFn, resourceType = 'resource') {
  try {
    const response = await createFn();
    return extractBody(response);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      const response = await updateFn();
      return extractBody(response);
    }
    throw new Error(`Failed to create ${resourceType}: ${error.message}`);
  }
}

/**
 * Execute a Kubernetes API call with automatic update-or-create logic
 * Tries to update a resource, and if it doesn't exist, creates it instead
 * @param {Function} updateFn - Function to update the resource
 * @param {Function} createFn - Function to create the resource (called if not found)
 * @param {string} resourceType - Type of resource for error messages
 * @returns {Promise<any>} The updated or created resource
 */
async function updateOrCreate(updateFn, createFn, resourceType = 'resource') {
  try {
    const response = await updateFn();
    return extractBody(response);
  } catch (error) {
    if (isNotFoundError(error)) {
      const response = await createFn();
      return extractBody(response);
    }
    throw new Error(`Failed to update ${resourceType}: ${error.message}`);
  }
}

/**
 * Execute a Kubernetes API call with standard error handling
 * @param {Function} apiFn - Function that makes the API call
 * @param {string} resourceType - Type of resource for error messages
 * @param {Object} options - Options for handling specific errors
 * @param {boolean} options.ignoreNotFound - Return null instead of throwing on 404
 * @returns {Promise<any>} The API response body or null if not found and ignoreNotFound is true
 */
async function executeK8sCall(apiFn, resourceType = 'resource', options = {}) {
  try {
    const response = await apiFn();
    return extractBody(response);
  } catch (error) {
    if (options.ignoreNotFound && isNotFoundError(error)) {
      return null;
    }
    throw new Error(`Failed to ${options.operation || 'access'} ${resourceType}: ${error.message}`);
  }
}

class K8sService {
  /**
   * Create a K8sService instance
   * @param {Object} deps - Optional dependencies for testing
   * @param {Object} deps.coreApi - Kubernetes CoreV1Api client
   * @param {Object} deps.appsApi - Kubernetes AppsV1Api client
   * @param {Object} deps.networkingApi - Kubernetes NetworkingV1Api client
   * @param {Object} deps.customObjectsApi - Kubernetes CustomObjectsApi client
   * @param {Object} deps.logger - Logger instance
   */
  constructor(deps = {}) {
    this.coreApi = deps.coreApi || k8sApi;
    this.appsApi = deps.appsApi || k8sAppsApi;
    this.networkingApi = deps.networkingApi || k8sNetworkingApi;
    this.customObjectsApi = deps.customObjectsApi || k8sCustomObjectsApi;
    this.log = deps.logger || defaultLog;
  }

  // Create a new namespace for a tenant
  async createNamespace(tenantName, resourceQuota = {}, appType = null) {
    const validatedName = validateResourceName(tenantName, 'namespace');

    try {
      // Create namespace manifest - use plain object
      const namespaceManifest = {
        metadata: {
          name: validatedName,
          labels: {
            'app.kubernetes.io/managed-by': 'multi-tenant-platform',
            'tenant': validatedName,
            'portfolio': 'true'
          }
        }
      };

      // Add app type label if provided
      if (appType) {
        namespaceManifest.metadata.labels['tenant-app-type'] = appType;
      }

      // Try to create namespace directly
      let namespace;
      try {
        const response = await this.coreApi.createNamespace({ body: namespaceManifest });
        namespace = extractBody(response);
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          const response = await this.coreApi.readNamespace({ name: validatedName });
          namespace = extractBody(response);
        } else {
          throw error;
        }
      }

      // Create resource quota if specified
      if (resourceQuota.cpu || resourceQuota.memory) {
        await this.createResourceQuota(validatedName, resourceQuota);
      }

      // WAIT for namespace to be Active (fix for race condition)
      let retries = 0;
      while (retries < 10) {
        try {
          const nsStatus = await this.coreApi.readNamespace({ name: validatedName });
          const statusPhase = extractBody(nsStatus).status.phase;
          if (statusPhase === 'Active') {
            break;
          }
        } catch (e) {
          // ignore error, wait and retry
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }

      return namespace;
    } catch (error) {
      throw new Error(`Failed to create namespace: ${error.message}`);
    }
  }

  // Helper to convert memory format (GB -> Gi)
  normalizeMemory(memory) {
    if (!memory) return '4Gi';
    // If already in Kubernetes format, return as is
    if (memory.match(/^[0-9]+[KMGT]i?$/)) return memory;
    // Convert GB to Gi
    if (memory.match(/^[0-9]+GB$/i)) {
      const value = parseInt(memory);
      return `${value}Gi`;
    }
    return memory;
  }

  // Create resource quota for a namespace
  async createResourceQuota(namespace, quota) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const normalizedMemory = this.normalizeMemory(quota.memory);
    const quotaName = `${validatedNamespace}-quota`;

    const resourceQuota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: quotaName,
        namespace: validatedNamespace
      },
      spec: {
        hard: {
          'requests.cpu': quota.cpu || '2',
          'requests.memory': normalizedMemory,
          'limits.cpu': quota.cpu || '2',
          'limits.memory': normalizedMemory,
          'persistentvolumeclaims': '5',
          'pods': '10'
        }
      }
    };

    try {
      await createOrUpdate(
        () => this.coreApi.createNamespacedResourceQuota({ namespace: validatedNamespace, body: resourceQuota }),
        () => this.coreApi.replaceNamespacedResourceQuota({ name: quotaName, namespace: validatedNamespace, body: resourceQuota }),
        'resource quota'
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Run pre-flight checks before tenant creation
   * Validates: ingress controller availability, database pods, TLS secret, shared credentials
   * @param {Object} options - Pre-flight options
   * @param {string} options.databaseKey - Database key to validate (optional)
   * @param {string} options.ingressClass - Ingress class to check (default: 'traefik')
   * @returns {Promise<Object>} Pre-flight check results
   */
  async runPreFlightChecks(options = {}) {
    const results = {
      passed: true,
      checks: [],
      errors: []
    };

    // 1. Check ingress controller
    try {
      const ingressClass = options.ingressClass || process.env.INGRESS_CLASS || 'traefik';
      const classResponse = await this.networkingApi.listIngressClass();
      const classes = extractBody(classResponse)?.items || [];
      const hasIngressClass = classes.some(ic => ic.metadata.name === ingressClass);

      if (hasIngressClass) {
        results.checks.push({ name: 'ingressController', status: 'passed', message: `Ingress class '${ingressClass}' available` });
      } else {
        results.passed = false;
        results.checks.push({ name: 'ingressController', status: 'failed', message: `Ingress class '${ingressClass}' not found` });
        results.errors.push(`Ingress controller with class '${ingressClass}' not available`);
      }
    } catch (error) {
      results.passed = false;
      results.checks.push({ name: 'ingressController', status: 'error', message: error.message });
      results.errors.push(`Failed to check ingress controller: ${error.message}`);
    }

    // 2. Check database pods (if databaseKey provided)
    if (options.databaseKey) {
      try {
        let labelSelector = '';
        let skipCheck = false;

        switch (options.databaseKey) {
          case 'mongodb-educationelly':
            labelSelector = 'app=mongodb-educationelly';
            break;
          case 'mongodb-educationelly-graphql':
            labelSelector = 'app=mongodb-educationelly-graphql';
            break;
          case 'mongodb-intervalai':
            labelSelector = 'app=mongodb-intervalai';
            break;
          case 'postgres-codetalk':
            labelSelector = 'app=postgresql-codetalk';
            break;
          case 'postgres-neon':
            // Neon is external, skip pod check
            results.checks.push({ name: 'databasePods', status: 'skipped', message: 'Neon is external database' });
            skipCheck = true;
            break;
          case 'firebook-db':
            // Firebase is external, skip pod check
            results.checks.push({ name: 'databasePods', status: 'skipped', message: 'Firebase is external database' });
            skipCheck = true;
            break;
          default:
            results.checks.push({ name: 'databasePods', status: 'skipped', message: `Unknown database key: ${options.databaseKey}` });
            skipCheck = true;
        }

        if (!skipCheck && labelSelector) {
          const podsResponse = await this.coreApi.listNamespacedPod({ namespace: 'default', labelSelector });
          const pods = extractBody(podsResponse)?.items || [];
          const runningPods = pods.filter(p => p.status?.phase === 'Running');

          if (runningPods.length > 0) {
            results.checks.push({ name: 'databasePods', status: 'passed', message: `${runningPods.length} database pod(s) running` });
          } else {
            results.passed = false;
            results.checks.push({ name: 'databasePods', status: 'failed', message: 'No running database pods found' });
            results.errors.push(`No running database pods for ${options.databaseKey}`);
          }
        }
      } catch (error) {
        results.passed = false;
        results.checks.push({ name: 'databasePods', status: 'error', message: error.message });
        results.errors.push(`Failed to check database pods: ${error.message}`);
      }
    }

    // 3. Check TLS secret exists (or can be created)
    try {
      const tlsSecret = await this.getSecret('default', 'tenants-wildcard-tls');
      if (tlsSecret && tlsSecret.data?.['tls.crt']) {
        results.checks.push({ name: 'tlsSecret', status: 'passed', message: 'Wildcard TLS secret available' });
      } else {
        results.checks.push({ name: 'tlsSecret', status: 'warning', message: 'TLS secret not found, will attempt to provision via cert-manager' });
      }
    } catch (error) {
      results.checks.push({ name: 'tlsSecret', status: 'warning', message: 'TLS secret check failed, will attempt provisioning' });
    }

    // 4. Check shared credentials secret
    try {
      const credSecret = await this.getSecret('default', 'production-db-credentials');
      if (credSecret) {
        results.checks.push({ name: 'sharedCredentials', status: 'passed', message: 'Shared database credentials available' });
      } else {
        results.passed = false;
        results.checks.push({ name: 'sharedCredentials', status: 'failed', message: 'Shared credentials secret not found' });
        results.errors.push('production-db-credentials secret not found in default namespace');
      }
    } catch (error) {
      results.passed = false;
      results.checks.push({ name: 'sharedCredentials', status: 'error', message: error.message });
      results.errors.push(`Failed to check shared credentials: ${error.message}`);
    }

    this.log.info({ passed: results.passed, checkCount: results.checks.length }, 'Pre-flight checks completed');
    return results;
  }

  /**
   * Ensure wildcard certificate exists via cert-manager
   * Creates a Certificate resource in default namespace if TLS secret doesn't exist
   * @param {string} secretName - Name of the TLS secret (default: 'tenants-wildcard-tls')
   * @param {string} domain - Wildcard domain (default: '*.tenants.el-jefe.me')
   * @param {string} issuerName - cert-manager ClusterIssuer name (default: 'letsencrypt-prod')
   * @returns {Promise<Object>} Certificate creation result
   */
  async ensureWildcardCertificate(secretName = 'tenants-wildcard-tls', domain = '*.tenants.el-jefe.me', issuerName = 'letsencrypt-prod') {
    const namespace = 'default';

    // Check if secret already exists
    const existingSecret = await this.getSecret(namespace, secretName);
    if (existingSecret && existingSecret.data?.['tls.crt']) {
      this.log.info({ secretName, namespace }, 'Wildcard TLS secret already exists');
      return { exists: true, secretName };
    }

    // Create Certificate resource for cert-manager
    const certificate = {
      apiVersion: 'cert-manager.io/v1',
      kind: 'Certificate',
      metadata: {
        name: secretName,
        namespace: namespace,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform'
        }
      },
      spec: {
        secretName: secretName,
        issuerRef: {
          name: issuerName,
          kind: 'ClusterIssuer'
        },
        commonName: domain,
        dnsNames: [
          domain,
          domain.replace('*.', '')  // Also include base domain
        ]
      }
    };

    // Use CustomObjectsApi to create cert-manager Certificate
    try {
      await this.customObjectsApi.createNamespacedCustomObject({
        group: 'cert-manager.io',
        version: 'v1',
        namespace: namespace,
        plural: 'certificates',
        body: certificate
      });
      this.log.info({ secretName, domain, issuerName }, 'Wildcard certificate created');
      return { created: true, secretName, certificate };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        this.log.info({ secretName }, 'Certificate already exists, waiting for secret');
        return { exists: true, secretName };
      }
      throw new Error(`Failed to create wildcard certificate: ${error.message}`);
    }
  }

  /**
   * Wait for TLS secret to be ready (cert-manager provisioning)
   * @param {string} namespace - Namespace where secret should exist
   * @param {string} secretName - Name of the TLS secret
   * @param {number} timeoutMs - Timeout in milliseconds (default: 120000 = 2 minutes)
   * @returns {Promise<boolean>} True if secret is ready
   */
  async waitForTLSSecret(namespace, secretName, timeoutMs = 120000) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      const secret = await this.getSecret(namespace, secretName);
      if (secret && secret.data && secret.data['tls.crt'] && secret.data['tls.key']) {
        this.log.info({ secretName, namespace }, 'TLS secret is ready');
        return true;
      }

      this.log.debug({ secretName, namespace, elapsed: Date.now() - startTime }, 'Waiting for TLS secret...');
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`TLS secret ${secretName} not ready after ${timeoutMs}ms`);
  }

  /**
   * Create network policy for tenant isolation
   * @param {string} namespace - Tenant namespace
   * @param {Object} options - Network policy options
   * @param {string} options.ingressNamespace - Namespace of ingress controller (default: 'kube-system')
   * @returns {Promise<Object>} Created network policy
   */
  async createNetworkPolicy(namespace, options = {}) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const policyName = 'tenant-isolation';
    const ingressNamespace = options.ingressNamespace || 'kube-system';

    const networkPolicy = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: policyName,
        namespace: validatedNamespace,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'tenant': validatedNamespace,
          'portfolio': 'true'
        }
      },
      spec: {
        podSelector: {},  // Applies to all pods in namespace
        policyTypes: ['Ingress', 'Egress'],
        ingress: [
          // Allow ingress from same namespace (pod-to-pod communication)
          {
            from: [{ podSelector: {} }]
          },
          // Allow ingress from ingress controller (Traefik in kube-system)
          {
            from: [{
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': ingressNamespace
                }
              }
            }]
          },
          // Allow ingress from default namespace (for management)
          {
            from: [{
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'default'
                }
              }
            }]
          }
        ],
        egress: [
          // Allow DNS resolution (kube-system)
          {
            to: [{
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'kube-system'
                }
              }
            }],
            ports: [
              { protocol: 'UDP', port: 53 },
              { protocol: 'TCP', port: 53 }
            ]
          },
          // Allow egress to same namespace
          {
            to: [{ podSelector: {} }]
          },
          // Allow egress to default namespace (for shared databases and AI gateway)
          {
            to: [{
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'default'
                }
              }
            }],
            ports: [
              { protocol: 'TCP', port: 27017 },  // MongoDB
              { protocol: 'TCP', port: 5432 },   // PostgreSQL
              { protocol: 'TCP', port: 6379 },   // Redis
              { protocol: 'TCP', port: 8002 },   // Shared AI Gateway
              { protocol: 'TCP', port: 4000 }    // LiteLLM
            ]
          },
          // Allow external HTTPS (for Neon, Firebase, external APIs)
          {
            to: [{ ipBlock: { cidr: '0.0.0.0/0', except: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'] } }],
            ports: [
              { protocol: 'TCP', port: 443 },
              { protocol: 'TCP', port: 80 }
            ]
          }
        ]
      }
    };

    try {
      return await createOrUpdate(
        () => this.networkingApi.createNamespacedNetworkPolicy({ namespace: validatedNamespace, body: networkPolicy }),
        () => this.networkingApi.replaceNamespacedNetworkPolicy({ name: policyName, namespace: validatedNamespace, body: networkPolicy }),
        'network policy'
      );
    } catch (error) {
      throw new Error(`Failed to create network policy: ${error.message}`);
    }
  }

  /**
   * Wait for a deployment to be fully ready
   * @param {string} namespace - Kubernetes namespace
   * @param {string} deploymentName - Name of the deployment
   * @param {number} timeoutMs - Timeout in milliseconds (default: 300000 = 5 minutes)
   * @param {number} pollIntervalMs - Polling interval (default: 5000 = 5 seconds)
   * @returns {Promise<Object>} Deployment status
   */
  async waitForDeploymentReady(namespace, deploymentName, timeoutMs = 300000, pollIntervalMs = 5000) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedDeployment = validateResourceName(deploymentName, 'deployment');
    const startTime = Date.now();

    this.log.info({ deployment: validatedDeployment, namespace: validatedNamespace, timeoutMs }, 'Waiting for deployment to be ready');

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await this.appsApi.readNamespacedDeployment({
          name: validatedDeployment,
          namespace: validatedNamespace
        });
        const deployment = extractBody(response);

        const desiredReplicas = deployment.spec?.replicas || 1;
        const readyReplicas = deployment.status?.readyReplicas || 0;
        const availableReplicas = deployment.status?.availableReplicas || 0;
        const updatedReplicas = deployment.status?.updatedReplicas || 0;

        // Check all conditions for readiness
        const conditions = deployment.status?.conditions || [];
        const availableCondition = conditions.find(c => c.type === 'Available');
        const progressingCondition = conditions.find(c => c.type === 'Progressing');

        const isAvailable = availableCondition?.status === 'True';

        // Deployment is ready when all replicas are ready and available
        if (readyReplicas >= desiredReplicas &&
            availableReplicas >= desiredReplicas &&
            updatedReplicas >= desiredReplicas &&
            isAvailable) {
          this.log.info({
            deployment: validatedDeployment,
            readyReplicas,
            desiredReplicas,
            elapsed: Date.now() - startTime
          }, 'Deployment is ready');

          return {
            ready: true,
            deployment: validatedDeployment,
            replicas: { desired: desiredReplicas, ready: readyReplicas, available: availableReplicas }
          };
        }

        // Check for failure conditions
        if (progressingCondition?.reason === 'ProgressDeadlineExceeded') {
          throw new Error(`Deployment ${validatedDeployment} exceeded progress deadline`);
        }

        this.log.debug({
          deployment: validatedDeployment,
          readyReplicas,
          desiredReplicas,
          elapsed: Date.now() - startTime
        }, 'Deployment not ready, waiting...');

      } catch (error) {
        if (!isNotFoundError(error)) {
          this.log.warn({ err: error, deployment: validatedDeployment }, 'Error checking deployment status');
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Deployment ${validatedDeployment} not ready after ${timeoutMs}ms`);
  }

  /**
   * Wait for all deployments in a namespace to be ready
   * @param {string} namespace - Kubernetes namespace
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<Object>} Status of all deployments
   */
  async waitForAllDeploymentsReady(namespace, timeoutMs = 300000) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    const response = await this.appsApi.listNamespacedDeployment({ namespace: validatedNamespace });
    const deployments = extractBody(response)?.items || [];

    if (deployments.length === 0) {
      return { ready: true, deployments: [] };
    }

    const results = await Promise.all(
      deployments.map(d =>
        this.waitForDeploymentReady(validatedNamespace, d.metadata.name, timeoutMs)
          .catch(err => ({ ready: false, deployment: d.metadata.name, error: err.message }))
      )
    );

    const allReady = results.every(r => r.ready);
    return { ready: allReady, deployments: results };
  }

  // Get credentials from the shared platform secret
  async getSharedDatabaseCredentials(databaseKey, namespace = null) {
    try {
      // Read the master secret from default namespace
      // Using 'production-db-credentials' to avoid conflict with ArgoCD managed 'tenantflow-db-credentials'
      const secret = await this.getSecret('default', 'production-db-credentials');
      if (!secret || !secret.data) {
        throw new Error('Shared database credentials secret not found');
      }

      // Helper to decode base64
      const decode = (val) => val ? Buffer.from(val, 'base64').toString('utf-8') : '';
      const data = secret.data;

      let prefix = '';
      let extraData = {};
      let databaseName = 'default';

      // For multi-tenancy, use namespace as database name for isolation
      const tenantDbName = namespace ? `tenant_${namespace.replace(/-/g, '_')}` : null;

      switch (databaseKey) {
        case 'mongodb-educationelly':
          prefix = 'MONGODB_EDUCATIONELLY';
          databaseName = tenantDbName || 'educationelly';
          // Educationelly REST API needs ALLOWED_ORIGINS for CORS
          extraData = {
            'ALLOWED_ORIGINS': `https://${namespace}.tenants.el-jefe.me,http://localhost:3000`
          };
          break;
        case 'mongodb-educationelly-graphql':
          prefix = 'MONGODB_EDUCATIONELLY_GRAPHQL';
          databaseName = tenantDbName || 'educationelly-graphql';
          break;
        case 'mongodb-intervalai':
          prefix = 'MONGODB_INTERVALAI';
          databaseName = tenantDbName || 'intervalai';
          // IntervalAI uses Triton Inference Server for ML predictions
          // CLIENT_ORIGIN is set dynamically based on tenant namespace
          extraData = {
            'USE_TRITON': 'true',
            'TRITON_URL': 'http://triton-service.default.svc.cluster.local:8000',
            'TRITON_MODEL_NAME': 'interval_ai',
            'TFJS_BACKEND': 'node',
            'USE_OPENVINO': 'false',
            'API_ONLY': 'true',
            'CLIENT_ORIGIN': `https://${namespace}.tenants.el-jefe.me`
          };
          break;
        case 'postgres-codetalk':
          prefix = 'POSTGRES_CODETALK';
          databaseName = tenantDbName || 'codetalk';
          break;
        case 'redis-local':
          prefix = 'REDIS_LOCAL';
          // Redis uses numeric DB indices (0-15) or key prefixes for isolation
          // We'll use database index based on tenant, but also set a key prefix
          databaseName = tenantDbName || 'redis';
          if (namespace) {
            extraData = {
              'REDIS_KEY_PREFIX': `${namespace}:`
            };
          }
          break;
        case 'postgres-neon':
          prefix = 'NEONDB';
          databaseName = tenantDbName || 'neondb';
          // Bookmarked uses Neon + Local AI (Llama via shared gateway)
          extraData = {
            'OPENAI_API_KEY': decode(data['OPENAI_API_KEY']),
            'OPENAI_MODEL': decode(data['OPENAI_MODEL']),
            'OPENAI_TEMPERATURE': decode(data['OPENAI_TEMPERATURE']),
            'OPENAI_MAX_TOKENS': decode(data['OPENAI_MAX_TOKENS']),
            'AI_FEATURES_ENABLED': 'true',
            'AI_CACHE_ENABLED': 'true',
            'USE_LOCAL_AI': 'true',
            'LOCAL_AI_URL': 'http://shared-ai-gateway-service.default.svc.cluster.local:8002',
            'LOCAL_AI_ENDPOINT': '/api/ai/generate',
            'REACT_APP_API_BASE_URL': decode(data['REACT_APP_API_BASE_URL'])
          };

          // Use Neon branching for tenant isolation if configured
          if (namespace && neonService.isConfigured()) {
            try {
              this.log.info({ namespace }, 'Creating Neon branch for tenant');
              const branchInfo = await neonService.createTenantBranch(namespace);
              // Return early with branch-specific connection string
              return {
                connectionString: branchInfo.connectionString,
                username: 'neondb_owner',
                password: '', // Password is embedded in connection string
                databaseName: branchInfo.databaseName,
                extraData: {
                  ...extraData,
                  'NEON_BRANCH_ID': branchInfo.branchId,
                  'NEON_BRANCH_NAME': branchInfo.branchName
                }
              };
            } catch (branchError) {
              this.log.warn({ err: branchError, namespace }, 'Failed to create Neon branch, falling back to shared database');
              // Fall through to default behavior
            }
          }
          break;
        case 'firebook-db':
          // Firebook uses Firebase + Algolia
          // No "database connection string" in the traditional sense, but we need to pass the config
          extraData = {
            'VITE_FIREBASE_API_KEY': decode(data['VITE_FIREBASE_API_KEY']),
            'VITE_FIREBASE_AUTH_DOMAIN': decode(data['VITE_FIREBASE_AUTH_DOMAIN']),
            'VITE_FIREBASE_PROJECT_ID': decode(data['VITE_FIREBASE_PROJECT_ID']),
            'VITE_FIREBASE_STORAGE_BUCKET': decode(data['VITE_FIREBASE_STORAGE_BUCKET']),
            'VITE_FIREBASE_MESSAGING_SENDER_ID': decode(data['VITE_FIREBASE_MESSAGING_SENDER_ID']),
            'VITE_FIREBASE_APP_ID': decode(data['VITE_FIREBASE_APP_ID']),
            'VITE_FIREBASE_MEASUREMENT_ID': decode(data['VITE_FIREBASE_MEASUREMENT_ID']),
            'VITE_ALGOLIA_APP_ID': decode(data['VITE_ALGOLIA_APP_ID']),
            'VITE_ALGOLIA_SEARCH_API_KEY': decode(data['VITE_ALGOLIA_SEARCH_API_KEY']),
            'VITE_ALGOLIA_INDEX_NAME': decode(data['VITE_ALGOLIA_INDEX_NAME'])
          };
          // We can return null for connectionString if the app handles it, 
          // or pass a dummy one if validation requires it.
          // Let's pass a placeholder to avoid "undefined" errors in other parts of the code.
          return {
            connectionString: 'firebase://configured-via-env-vars',
            username: '',
            password: '',
            databaseName: 'firebook',
            extraData: extraData
          };
        default:
          throw new Error(`Unknown database key: ${databaseKey}`);
      }

      // Get the base connection string and replace database name for tenant isolation
      let connectionString = decode(data[`${prefix}_CONNECTION_STRING`]);

      // For MongoDB and PostgreSQL connections, replace the database name in the URL with tenant-specific name
      if (tenantDbName && (connectionString.includes('mongodb') || connectionString.includes('postgres'))) {
        // Connection string format: mongodb://user:pass@host:port/dbname?options
        //                       or: postgres://user:pass@host:port/dbname?options
        // Replace the database name (between last / and ? or end of string)
        connectionString = connectionString.replace(
          /\/([^/?]+)(\?|$)/,
          `/${databaseName}$2`
        );
      }

      return {
        connectionString: connectionString,
        username: decode(data[`${prefix}_USERNAME`]),
        password: decode(data[`${prefix}_PASSWORD`]),
        databaseName: databaseName,
        extraData: extraData
      };
    } catch (error) {
      throw new Error(`Failed to retrieve shared credentials: ${error.message}`);
    }
  }

  // Deploy generic application to a namespace
  async deployEducationelly(namespace, config = {}) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    const {
      replicas = 1,
      appType = 'educationelly-graphql',
      apiType = 'graphql',  // 'graphql', 'rest', or 'none'
      serverImage,
      clientImage,
      serverPort,
      clientPort,
      healthCheckPath = '/health',  // Configurable health check path
      env = [],
      databaseSecretName = null,
      databaseKey = null,
      graphqlEndpoint = null // Public GraphQL endpoint URL (only for GraphQL apps)
    } = config;

    // Use appType as the prefix for resource names
    const appPrefix = appType;
    const finalServerPort = serverPort || 8000;
    const finalClientPort = clientPort || 3000;

    if (!clientImage && !serverImage) {
      throw new Error('At least one of Server or Client image is required');
    }

    try {
      // Handle Database Secret
      let secretName = databaseSecretName;

      // If a database key is provided, setup the secret from shared credentials
      if (databaseKey) {
        const credentials = await this.getSharedDatabaseCredentials(databaseKey, validatedNamespace);
        secretName = `${validatedNamespace}-db-secret`;

        await this.createDatabaseSecret(
          validatedNamespace,
          secretName,
          credentials.connectionString,
          credentials.username,
          credentials.password,
          credentials.databaseName,
          credentials.extraData
        );
      } else if (!secretName) {
        // Default fallback
        secretName = `${validatedNamespace}-mongodb-secret`;
      }

      const secretExists = await this.getSecret(validatedNamespace, secretName);

      let serverDeployment = null;

      // Deploy Server with database secret if available AND server image is provided
      if (serverImage) {
        // Add AI gateway env vars for server
        const serverEnv = [
          ...env,
          { name: 'AI_GATEWAY_URL', value: 'http://shared-ai-gateway.default.svc.cluster.local:8002' },
          { name: 'LITELLM_URL', value: 'http://litellm.default.svc.cluster.local:4000' }
        ];

        serverDeployment = await this.createDeployment(
          validatedNamespace,
          `${appPrefix}-server`,
          serverImage,
          finalServerPort,
          replicas,
          serverEnv,
          secretExists ? secretName : null,
          null,  // securityContext
          null,  // volumeConfig
          healthCheckPath  // Use configured health check path
        );

        // Create service for server
        await this.createService(validatedNamespace, `${appPrefix}-server`, finalServerPort);

        // IntervalAI client nginx expects 'spaced-repetition-server' - create alias
        if (appType === 'intervalai') {
          await this.createExternalNameService(
            validatedNamespace,
            'spaced-repetition-server',
            `${appPrefix}-server.${validatedNamespace}.svc.cluster.local`
          );
        }
      }

      // Deploy Client Frontend (doesn't need database access)
      // Security context allows nginx to bind to privileged ports
      const clientSecurityContext = {
        runAsUser: 0, // Run as root to allow nginx to bind to port 80
        allowPrivilegeEscalation: true
      };

      // Add GRAPHQL_ENDPOINT environment variable for client
      const clientEnv = [...env];
      if (graphqlEndpoint) {
        clientEnv.push({
          name: 'GRAPHQL_ENDPOINT',
          value: graphqlEndpoint
        });
      }

      let clientDeployment = null;
      let volumeConfig = null;

      // If we have both server and client, create nginx ConfigMap with API proxy
      if (clientImage && serverImage) {
        const nginxConfig = await this.createNginxConfigMap(
          validatedNamespace,
          `${appPrefix}-server`,
          finalServerPort,
          apiType  // Pass apiType to determine proxy configuration
        );
        volumeConfig = { configMapName: nginxConfig.name };
      }

      if (clientImage) {
        clientDeployment = await this.createDeployment(
          validatedNamespace,
          `${appPrefix}-client`,
          clientImage,
          finalClientPort,
          replicas,
          clientEnv,
          // Client NEEDS the secret if it needs VITE_ keys (Bookmarked/Firebook)
          // Usually frontend keys are public so it's okay to inject them.
          secretExists ? secretName : null,
          clientSecurityContext,
          volumeConfig,  // Mount nginx config for GraphQL proxy
          '/'  // Client health check always uses root path
        );

        // Create service for client
        await this.createService(validatedNamespace, `${appPrefix}-client`, finalClientPort);
      }

      return {
        server: serverDeployment,
        client: clientDeployment,
        databaseConfigured: !!secretExists
      };
    } catch (error) {
      throw new Error(`Failed to deploy application: ${error.message}`);
    }
  }

  // Helper method to create a deployment
  async createDeployment(namespace, appName, image, port, replicas, env, secretName = null, securityContext = null, volumeConfig = null, healthCheckPath = null) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedAppName = validateResourceName(appName, 'deployment');

    // Use provided health check path or determine from app type
    const isClient = validatedAppName.includes('client');
    const probePath = healthCheckPath || (isClient ? '/' : '/health');

    const containerSpec = {
      name: validatedAppName,
      image: image,
      ports: [
        {
          containerPort: port,
          name: 'http'
        }
      ],
      resources: {
        requests: {
          memory: '128Mi',
          cpu: '100m'
        },
        limits: {
          memory: '512Mi',
          cpu: '500m'
        }
      },
      // Liveness probe - restarts container if it fails
      livenessProbe: {
        httpGet: {
          path: probePath,
          port: port
        },
        initialDelaySeconds: 15,
        periodSeconds: 20,
        timeoutSeconds: 5,
        failureThreshold: 3,
        successThreshold: 1
      },
      // Readiness probe - removes from service if not ready
      readinessProbe: {
        httpGet: {
          path: probePath,
          port: port
        },
        initialDelaySeconds: 5,
        periodSeconds: 10,
        timeoutSeconds: 3,
        failureThreshold: 3,
        successThreshold: 1
      },
      // Startup probe - allows slow-starting containers
      startupProbe: {
        httpGet: {
          path: probePath,
          port: port
        },
        initialDelaySeconds: 0,
        periodSeconds: 5,
        timeoutSeconds: 3,
        failureThreshold: 30,  // 30 * 5 = 150 seconds max startup time
        successThreshold: 1
      }
    };

    // Add security context if provided
    if (securityContext) {
      containerSpec.securityContext = securityContext;
    }

    // Add volume mounts if volume config provided (e.g., nginx config)
    if (volumeConfig && volumeConfig.configMapName) {
      containerSpec.volumeMounts = [
        {
          name: 'nginx-config',
          mountPath: '/etc/nginx/conf.d/default.conf',
          subPath: 'default.conf'
        }
      ];
    }

    // Add environment variables from secret if provided
    if (secretName) {
      containerSpec.envFrom = [
        {
          secretRef: {
            name: secretName
          }
        }
      ];
    }

    // Add additional env vars if provided
    if (env && env.length > 0) {
      containerSpec.env = env;
    }

    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: validatedAppName,
        namespace: validatedNamespace,
        labels: {
          app: validatedAppName,
          tenant: validatedNamespace,
          portfolio: 'true'
        }
      },
      spec: {
        replicas: replicas,
        selector: {
          matchLabels: {
            app: validatedAppName
          }
        },
        template: {
          metadata: {
            labels: {
              app: validatedAppName,
              tenant: validatedNamespace,
              portfolio: 'true'
            },
            annotations: {
              'prometheus.io/scrape': 'true',
              'prometheus.io/path': '/metrics',
              'prometheus.io/port': port.toString()
            }
          },
          spec: {
            containers: [containerSpec],
            ...(volumeConfig && volumeConfig.configMapName && {
              volumes: [
                {
                  name: 'nginx-config',
                  configMap: {
                    name: volumeConfig.configMapName
                  }
                }
              ]
            })
          }
        }
      }
    };

    try {
      return await createOrUpdate(
        () => this.appsApi.createNamespacedDeployment({ namespace: validatedNamespace, body: deployment }),
        () => this.appsApi.replaceNamespacedDeployment({ name: validatedAppName, namespace: validatedNamespace, body: deployment }),
        `deployment ${appName}`
      );
    } catch (error) {
      throw error;
    }
  }

  // Create service for the deployment
  async createService(namespace, appName, port) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedAppName = validateResourceName(appName, 'service');

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: validatedAppName,
        namespace: validatedNamespace,
        labels: {
          app: validatedAppName,
          portfolio: 'true'
        }
      },
      spec: {
        type: 'ClusterIP',
        selector: {
          app: validatedAppName
        },
        ports: [
          {
            port: port,
            targetPort: port,
            protocol: 'TCP',
            name: 'http'
          }
        ]
      }
    };

    try {
      await createOrUpdate(
        () => this.coreApi.createNamespacedService({ namespace: validatedNamespace, body: service }),
        () => this.coreApi.replaceNamespacedService({ name: validatedAppName, namespace: validatedNamespace, body: service }),
        'service'
      );
    } catch (error) {
      throw error;
    }
  }

  // Create ExternalName service (alias to another service)
  async createExternalNameService(namespace, serviceName, externalName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedServiceName = validateResourceName(serviceName, 'service');

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: validatedServiceName,
        namespace: validatedNamespace,
        labels: {
          app: validatedServiceName,
          portfolio: 'true'
        }
      },
      spec: {
        type: 'ExternalName',
        externalName: externalName
      }
    };

    try {
      await createOrUpdate(
        () => this.coreApi.createNamespacedService({ namespace: validatedNamespace, body: service }),
        () => this.coreApi.replaceNamespacedService({ name: validatedServiceName, namespace: validatedNamespace, body: service }),
        'service'
      );
    } catch (error) {
      throw error;
    }
  }

  // List all tenant namespaces
  async listTenants() {
    try {
      const response = await this.coreApi.listNamespace({});
      const allItems = extractBody(response)?.items || [];

      // Filter to only include namespaces managed by this platform
      // and exclude terminating namespaces
      const filteredItems = allItems.filter(ns => {
        const labels = ns.metadata?.labels || {};
        const isManaged = labels['app.kubernetes.io/managed-by'] === 'multi-tenant-platform';
        const isTerminating = ns.metadata?.deletionTimestamp !== undefined;

        return isManaged && !isTerminating;
      });

      return filteredItems;
    } catch (error) {
      // If no tenants exist yet, return empty array instead of error
      if (isNotFoundError(error)) {
        return [];
      }
      throw new Error(`Failed to list tenants: ${error.message}`);
    }
  }

  // Get tenant details including deployments and resource usage
  async getTenantDetails(namespace) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    try {
      const [nsResponse, deploymentsResponse, servicesResponse, podsResponse] = await Promise.all([
        this.coreApi.readNamespace({ name: validatedNamespace }),
        this.appsApi.listNamespacedDeployment({ namespace: validatedNamespace }),
        this.coreApi.listNamespacedService({ namespace: validatedNamespace }),
        this.coreApi.listNamespacedPod({ namespace: validatedNamespace })
      ]);

      return {
        namespace: extractBody(nsResponse),
        deployments: extractBody(deploymentsResponse)?.items || [],
        services: extractBody(servicesResponse)?.items || [],
        pods: extractBody(podsResponse)?.items || []
      };
    } catch (error) {
      throw new Error(`Failed to get tenant details: ${error.message}`);
    }
  }

  // Get resource usage metrics for a namespace
  async getNamespaceMetrics(namespace) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    try {
      const podsResponse = await this.coreApi.listNamespacedPod({ namespace: validatedNamespace });
      const pods = extractBody(podsResponse);

      const quotaData = await executeK8sCall(
        () => this.coreApi.readNamespacedResourceQuota({ name: `${validatedNamespace}-quota`, namespace: validatedNamespace }),
        'resource quota',
        { ignoreNotFound: true, operation: 'read' }
      );

      const podItems = pods?.items || [];
      return {
        pods: {
          total: podItems.length,
          running: podItems.filter(p => p.status?.phase === 'Running').length,
          pending: podItems.filter(p => p.status?.phase === 'Pending').length,
          failed: podItems.filter(p => p.status?.phase === 'Failed').length
        },
        quota: quotaData
      };
    } catch (error) {
      throw new Error(`Failed to get metrics: ${error.message}`);
    }
  }

  // Delete a pod in a namespace
  async deletePod(namespace, podName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedPodName = validateResourceName(podName, 'pod');

    try {
      await this.coreApi.deleteNamespacedPod({
        name: validatedPodName,
        namespace: validatedNamespace
      });
      this.log.info({ podName: validatedPodName, namespace: validatedNamespace }, 'Pod deleted');
      return { deleted: true, podName: validatedPodName, namespace: validatedNamespace };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { deleted: false, reason: 'not_found', podName: validatedPodName };
      }
      this.log.error({ err: error, podName: validatedPodName, namespace: validatedNamespace }, 'Failed to delete pod');
      throw new Error(`Failed to delete pod: ${error.message}`);
    }
  }

  // Get resource quota for a namespace
  async getResourceQuota(namespace) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    return await executeK8sCall(
      () => this.coreApi.readNamespacedResourceQuota({ name: `${validatedNamespace}-quota`, namespace: validatedNamespace }),
      'resource quota',
      { ignoreNotFound: true, operation: 'read' }
    );
  }

  // Update resource quota for a namespace
  async updateResourceQuota(namespace, quota) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const normalizedMemory = this.normalizeMemory(quota.memory);
    const quotaName = `${validatedNamespace}-quota`;

    const resourceQuota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: quotaName,
        namespace: validatedNamespace
      },
      spec: {
        hard: {
          'requests.cpu': quota.cpu || '2',
          'requests.memory': normalizedMemory,
          'limits.cpu': quota.cpu || '2',
          'limits.memory': normalizedMemory,
          'persistentvolumeclaims': '5',
          'pods': '10'
        }
      }
    };

    try {
      await updateOrCreate(
        () => this.coreApi.replaceNamespacedResourceQuota({ name: quotaName, namespace: validatedNamespace, body: resourceQuota }),
        () => this.coreApi.createNamespacedResourceQuota({ namespace: validatedNamespace, body: resourceQuota }),
        'resource quota'
      );
      return resourceQuota.spec.hard;
    } catch (error) {
      throw error;
    }
  }

  // Delete a tenant namespace (this will delete all resources in it)
  async deleteTenant(namespace) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    try {
      await this.coreApi.deleteNamespace({ name: validatedNamespace });
      return { message: `Namespace ${validatedNamespace} deletion initiated successfully` };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { message: `Namespace ${validatedNamespace} already deleted or doesn't exist` };
      }
      throw new Error(`Failed to delete tenant: ${error.message}`);
    }
  }

  // Scale a deployment
  async scaleDeployment(namespace, deploymentName, replicas) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedDeployment = validateResourceName(deploymentName, 'deployment');

    try {
      const patch = {
        spec: {
          replicas: replicas
        }
      };

      const options = { headers: { 'Content-Type': 'application/merge-patch+json' } };
      await this.appsApi.patchNamespacedDeployment({
        name: validatedDeployment,
        namespace: validatedNamespace,
        body: patch
      }, options);

      return { message: `Deployment scaled to ${replicas} replicas` };
    } catch (error) {
      throw new Error(`Failed to scale deployment: ${error.message}`);
    }
  }

  // Restart a deployment by adding a restart annotation
  async restartDeployment(namespace, deploymentName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedDeployment = validateResourceName(deploymentName, 'deployment');

    try {
      this.log.info({ deployment: validatedDeployment, namespace: validatedNamespace }, 'Restarting deployment');

      const patch = {
        spec: {
          template: {
            metadata: {
              annotations: {
                'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
              }
            }
          }
        }
      };

      await this.appsApi.patchNamespacedDeployment({
        name: validatedDeployment,
        namespace: validatedNamespace,
        body: patch
      }, { headers: { 'Content-Type': 'application/merge-patch+json' } });

      return { message: `Deployment ${validatedDeployment} restarted` };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { message: `Deployment ${validatedDeployment} not found, skipping restart` };
      }
      throw new Error(`Failed to restart deployment: ${error.message}`);
    }
  }

  // Create a Kubernetes Secret for database credentials
  async createDatabaseSecret(namespace, secretName, connectionString, username, password, databaseName, extraData = {}) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    // Determine database type
    const isPostgres = connectionString && (
      connectionString.startsWith('postgres://') ||
      connectionString.startsWith('postgresql://')
    );

    const stringData = {
      // Common credentials
      'DB_USERNAME': username,
      'DB_PASSWORD': password,
      'DB_NAME': databaseName,
      // Generic fallback (many frameworks use this)
      'DATABASE_URL': connectionString,
      // Merge extra data (Algolia keys, etc.)
      ...extraData
    };

    if (isPostgres) {
      // PostgreSQL specific env vars
      stringData['POSTGRES_URL'] = connectionString;
      stringData['PG_CONNECTION_STRING'] = connectionString;
      stringData['POSTGRES_USER'] = username;
      stringData['POSTGRES_PASSWORD'] = password;
      stringData['POSTGRES_DB'] = databaseName;
    } else {
      // MongoDB specific env vars (default assumption if not postgres)
      stringData['MONGODB_URI'] = connectionString;
      stringData['MONGODB_URL'] = connectionString; // Express.js convention
      stringData['MONGO_URI'] = connectionString;   // Alternate naming
      stringData['MONGO_URL'] = connectionString;   // Another common variant
      stringData['MONGO_USERNAME'] = username;
      stringData['MONGO_PASSWORD'] = password;
      stringData['MONGO_DATABASE'] = databaseName;
    }

    const secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: validatedSecretName,
        namespace: validatedNamespace,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'app.kubernetes.io/component': 'database',
          'tenant': validatedNamespace,
          'portfolio': 'true'
        }
      },
      type: 'Opaque',
      stringData: stringData
    };

    try {
      try {
        await this.coreApi.createNamespacedSecret({ namespace: validatedNamespace, body: secret });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          // Update existing secret
          await this.coreApi.replaceNamespacedSecret({ name: validatedSecretName, namespace: validatedNamespace, body: secret });
        } else {
          throw error;
        }
      }
      return { message: `Secret ${validatedSecretName} created successfully` };
    } catch (error) {
      throw new Error(`Failed to create secret: ${error.message}`);
    }
  }

  // Create nginx ConfigMap with API proxy for client deployments
  // apiType: 'graphql' proxies /graphql, 'rest' proxies /api
  async createNginxConfigMap(namespace, serverServiceName, serverPort = 8000, apiType = 'graphql') {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const configMapName = 'nginx-config';

    // Generate proxy location block based on API type
    let proxyLocationBlock;
    if (apiType === 'graphql') {
      proxyLocationBlock = `
    # Proxy GraphQL requests to server
    location /graphql {
        proxy_pass http://${serverServiceName}:${serverPort}/graphql;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }`;
    } else {
      // REST API - proxy /api to server root
      proxyLocationBlock = `
    # Proxy REST API requests to server
    location /api {
        proxy_pass http://${serverServiceName}:${serverPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }`;
    }

    const nginxConfig = `server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
${proxyLocationBlock}

    location ~* \\.(?:css|js|jpg|jpeg|gif|png|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}`;

    const configMap = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: configMapName,
        namespace: validatedNamespace,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          tenant: validatedNamespace,
          portfolio: 'true'
        }
      },
      data: {
        'default.conf': nginxConfig
      }
    };

    try {
      try {
        await this.coreApi.createNamespacedConfigMap({ namespace: validatedNamespace, body: configMap });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          await this.coreApi.replaceNamespacedConfigMap({ name: configMapName, namespace: validatedNamespace, body: configMap });
        } else {
          throw error;
        }
      }
      this.log.info({ configMapName, namespace: validatedNamespace }, 'Nginx ConfigMap created');
      return { name: configMapName };
    } catch (error) {
      throw new Error(`Failed to create nginx ConfigMap: ${error.message}`);
    }
  }

  // Get a secret from a namespace
  async getSecret(namespace, secretName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    return await executeK8sCall(
      () => this.coreApi.readNamespacedSecret({ name: validatedSecretName, namespace: validatedNamespace }),
      'secret',
      { ignoreNotFound: true, operation: 'read' }
    );
  }

  // Copy a secret from one namespace to another
  async copySecret(sourceNamespace, secretName, targetNamespace) {
    const validatedSource = validateResourceName(sourceNamespace, 'source namespace');
    const validatedTarget = validateResourceName(targetNamespace, 'target namespace');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    try {
      // Read the source secret
      const response = await this.coreApi.readNamespacedSecret({
        name: validatedSecretName,
        namespace: validatedSource
      });
      const sourceSecret = extractBody(response);

      if (!sourceSecret) {
        throw new Error(`Secret ${validatedSecretName} not found in namespace ${validatedSource}`);
      }

      // Create new secret in target namespace (strip resourceVersion and uid for new resource)
      const newSecret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: validatedSecretName,
          namespace: validatedTarget,
          labels: {
            ...sourceSecret.metadata?.labels,
            'copied-from': validatedSource
          }
        },
        type: sourceSecret.type,
        data: sourceSecret.data
      };

      // Create or update the secret in target namespace
      try {
        await this.coreApi.createNamespacedSecret({ namespace: validatedTarget, body: newSecret });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          await this.coreApi.replaceNamespacedSecret({
            name: validatedSecretName,
            namespace: validatedTarget,
            body: newSecret
          });
        } else {
          throw error;
        }
      }

      this.log.info({ secretName: validatedSecretName, from: validatedSource, to: validatedTarget }, 'Secret copied');
      return { message: `Secret ${validatedSecretName} copied to ${validatedTarget}` };
    } catch (error) {
      throw new Error(`Failed to copy secret: ${error.message}`);
    }
  }

  // Delete a secret from a namespace
  async deleteSecret(namespace, secretName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    try {
      await this.coreApi.deleteNamespacedSecret({ name: validatedSecretName, namespace: validatedNamespace });
      return { message: `Secret ${validatedSecretName} deleted successfully` };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { message: `Secret already deleted or doesn't exist` };
      }
      throw new Error(`Failed to delete secret: ${error.message}`);
    }
  }

  // Update deployment to use environment variables from secret
  async updateDeploymentWithSecret(namespace, deploymentName, secretName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedDeployment = validateResourceName(deploymentName, 'deployment');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    try {
      // Get current deployment
      const response = await this.appsApi.readNamespacedDeployment({ name: validatedDeployment, namespace: validatedNamespace });
      const deployment = extractBody(response);

      // Update container env to use secretRef
      if (deployment.spec?.template?.spec?.containers?.[0]) {
        deployment.spec.template.spec.containers[0].envFrom = [
          {
            secretRef: {
              name: validatedSecretName
            }
          }
        ];

        // Apply updated deployment
        await this.appsApi.replaceNamespacedDeployment({
          name: validatedDeployment,
          namespace: validatedNamespace,
          body: deployment
        });

        return { message: `Deployment ${validatedDeployment} updated to use secret ${validatedSecretName}` };
      }

      throw new Error('No containers found in deployment');
    } catch (error) {
      throw new Error(`Failed to update deployment with secret: ${error.message}`);
    }
  }

  // Check database connection status by examining pod logs
  async checkDatabaseConnection(namespace) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    try {
      // Try different server label patterns based on app type
      const serverLabels = [
        'app=educationelly-graphql-server',
        'app=educationelly-server',
        'app=bookmarked-server',
        'app=intervalai-server',
        'app=codetalk-server',
        'app=code-talk-server'
      ];

      let pods = null;
      for (const labelSelector of serverLabels) {
        const podsResponse = await this.coreApi.listNamespacedPod({
          namespace: validatedNamespace,
          labelSelector
        });
        pods = extractBody(podsResponse);
        if (pods?.items && pods.items.length > 0) {
          break;
        }
      }

      if (!pods?.items || pods.items.length === 0) {
        return {
          connected: false,
          status: 'no_pods',
          message: 'No server pods found'
        };
      }

      // Get the most recent pod
      const pod = pods.items[0];
      const podName = pod.metadata.name;
      const podPhase = pod.status?.phase;

      // If pod is not running, can't check logs
      if (podPhase !== 'Running') {
        return {
          connected: false,
          status: 'pod_not_running',
          message: `Pod is ${podPhase}`,
          podName: podName
        };
      }

      try {
        // Get recent logs (last 100 lines) from the pod
        const logsResponse = await this.coreApi.readNamespacedPodLog({
          name: podName,
          namespace: validatedNamespace,
          tailLines: 100
        });

        const logs = logsResponse?.body || logsResponse || '';

        // Check for database connection errors (MongoDB, PostgreSQL, Redis)
        const hasDbError =
          // MongoDB errors
          logs.includes('MongoServerError') ||
          logs.includes('MongooseServerSelectionError') ||
          logs.includes('MongoNetworkError') ||
          // PostgreSQL errors
          logs.includes('FATAL:') ||
          logs.includes('password authentication failed') ||
          logs.includes('database does not exist') ||
          logs.includes('role does not exist') ||
          /pg.*error/i.test(logs) ||
          // Redis errors
          logs.includes('NOAUTH') ||
          logs.includes('Redis connection') && logs.includes('error') ||
          // Generic connection errors
          logs.includes('ECONNREFUSED') ||
          logs.includes('ENOTFOUND') ||
          logs.includes('getaddrinfo') ||
          logs.includes('connection error') ||
          logs.includes('Authentication failed');

        if (hasDbError) {
          return {
            connected: false,
            status: 'connection_error',
            message: 'Database connection error detected in logs',
            podName: podName
          };
        }

        // Check for explicit database connection indicators
        const hasDbConnection =
          // MongoDB
          logs.includes('MongoDB') ||
          logs.includes('mongoose') ||
          logs.includes('Connected to mongo') ||
          // PostgreSQL / Neon
          logs.includes('PostgreSQL') ||
          logs.includes('Connected to postgres') ||
          logs.includes('pg pool') ||
          logs.includes('sequelize') ||
          logs.includes('prisma') ||
          logs.includes('neon') ||
          logs.includes('Database initialized successfully') ||
          // Redis
          logs.includes('Redis connected') ||
          logs.includes('redis ready') ||
          // Generic
          logs.includes('Connected to') ||
          logs.includes('Database: Connected') ||
          /Database.*Connected/i.test(logs) ||
          /Database.*initialized/i.test(logs) ||
          /connected to.*database/i.test(logs);

        if (hasDbConnection) {
          return {
            connected: true,
            status: 'connected',
            message: 'Database connection detected',
            podName: podName
          };
        }

        // Check for successful API calls that require database connectivity
        // These patterns indicate the app is processing requests (which need DB)
        const hasSuccessfulDbOperations =
          /POST \/signin.*200/.test(logs) ||          // Successful login requires DB
          /POST \/signup.*200/.test(logs) ||          // Successful signup requires DB
          /POST \/login.*200/.test(logs) ||           // Alternative login endpoint
          /GET \/students.*200/.test(logs) ||         // Fetching students requires DB
          /GET \/students.*304/.test(logs) ||         // Cached student fetch
          /GET \/bookmarks.*200/.test(logs) ||        // Bookmarked app
          /GET \/messages.*200/.test(logs) ||         // Code-talk app
          /POST \/ai\/chat.*200/.test(logs) ||        // AI chat requires auth
          /GET \/health.*200/.test(logs) ||           // Health checks passing = app running
          logs.includes('Server listening on');        // Server started successfully

        if (hasSuccessfulDbOperations) {
          return {
            connected: true,
            status: 'connected',
            message: 'App serving requests successfully',
            podName: podName
          };
        }

        // Pod is running but no indicators found
        return {
          connected: null,
          status: 'unknown',
          message: 'No database activity detected yet',
          podName: podName
        };
      } catch (logError) {
        return {
          connected: null,
          status: 'logs_unavailable',
          message: 'Could not retrieve pod logs',
          podName: podName
        };
      }
    } catch (error) {
      return {
        connected: false,
        status: 'error',
        message: error.message
      };
    }
  }

  // Get pod logs
  async getPodLogs(namespace, podName, options = {}) {
    const { tailLines = 100, container, timestamps = true } = options;

    try {
      const params = {
        name: podName,
        namespace: namespace,
        tailLines: tailLines,
        timestamps: timestamps
      };

      if (container) {
        params.container = container;
      }

      const response = await this.coreApi.readNamespacedPodLog(params);
      const logs = response?.body || response || '';

      return logs;
    } catch (error) {
      this.log.error({ err: error, namespace, podName }, 'Failed to get pod logs');
      throw new Error(`Failed to get logs for pod ${podName}: ${error.message}`);
    }
  }
}

// Export the class for testing with dependency injection
export { K8sService };

// Export validation helpers for testing
export { validateResourceName, isNotFoundError, isAlreadyExistsError };

// Factory function for creating instances with custom dependencies
export function createK8sService(deps = {}) {
  return new K8sService(deps);
}

// Default singleton instance for production use
const k8sService = new K8sService();
export default k8sService;
