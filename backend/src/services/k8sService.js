import { k8sApi, k8sAppsApi, k8sNetworkingApi } from '../config/k8s.js';
import * as k8s from '@kubernetes/client-node';
import { createLogger } from '../utils/logger.js';

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
   * @param {Object} deps.logger - Logger instance
   */
  constructor(deps = {}) {
    this.coreApi = deps.coreApi || k8sApi;
    this.appsApi = deps.appsApi || k8sAppsApi;
    this.networkingApi = deps.networkingApi || k8sNetworkingApi;
    this.log = deps.logger || defaultLog;
  }

  // Create a new namespace for a tenant
  async createNamespace(tenantName, resourceQuota = {}) {
    const validatedName = validateResourceName(tenantName, 'namespace');

    try {
      const namespaceManifest = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: validatedName,
          labels: {
            'app.kubernetes.io/managed-by': 'multi-tenant-platform',
            'tenant': validatedName
          }
        }
      };

      const namespace = await createOrUpdate(
        () => this.coreApi.createNamespace(namespaceManifest),
        () => this.coreApi.readNamespace(validatedName),
        'namespace'
      );

      // Create resource quota if specified
      if (resourceQuota.cpu || resourceQuota.memory) {
        await this.createResourceQuota(validatedName, resourceQuota);
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
        () => this.coreApi.createNamespacedResourceQuota(validatedNamespace, resourceQuota),
        () => this.coreApi.replaceNamespacedResourceQuota(quotaName, validatedNamespace, resourceQuota),
        'resource quota'
      );
    } catch (error) {
      throw error;
    }
  }

  // Deploy educationelly-graphql to a namespace
  async deployEducationelly(namespace, config = {}) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    const {
      replicas = 1,
      appType = 'graphql', // 'graphql' or 'rest'
      serverImage = null,
      clientImage = null,
      serverPort = null,
      clientPort = null,
      env = [],
      databaseSecretName = null,
      graphqlEndpoint = null // Public GraphQL endpoint URL
    } = config;

    // Set defaults based on app type
    const isGraphQL = appType === 'graphql';
    const finalServerImage = serverImage || (isGraphQL ? 'maxjeffwell/educationelly-graphql-server:latest' : 'maxjeffwell/educationelly-server:latest');
    const finalClientImage = clientImage || (isGraphQL ? 'maxjeffwell/educationelly-graphql-client:latest' : 'maxjeffwell/educationelly-client:latest');
    const finalServerPort = serverPort || (isGraphQL ? 4000 : 8080);
    const finalClientPort = clientPort || (isGraphQL ? 3000 : 3000);
    const appPrefix = isGraphQL ? 'educationelly-graphql' : 'educationelly';

    try {
      // Check if database secret exists in namespace
      const secretName = databaseSecretName || `${validatedNamespace}-mongodb-secret`;
      const secretExists = await this.getSecret(validatedNamespace, secretName);

      // Deploy Server with database secret if available
      const serverDeployment = await this.createDeployment(
        validatedNamespace,
        `${appPrefix}-server`,
        finalServerImage,
        finalServerPort,
        replicas,
        env,
        secretExists ? secretName : null
      );

      // Create service for server
      await this.createService(validatedNamespace, `${appPrefix}-server`, finalServerPort);

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

      const clientDeployment = await this.createDeployment(
        validatedNamespace,
        `${appPrefix}-client`,
        finalClientImage,
        finalClientPort,
        replicas,
        clientEnv,
        null, // Client doesn't need database secret
        clientSecurityContext
      );

      // Create service for client
      await this.createService(validatedNamespace, `${appPrefix}-client`, finalClientPort);

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
  async createDeployment(namespace, appName, image, port, replicas, env, secretName = null, securityContext = null) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedAppName = validateResourceName(appName, 'deployment');

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
          memory: '256Mi',
          cpu: '250m'
        },
        limits: {
          memory: '512Mi',
          cpu: '500m'
        }
      }
    };

    // Add security context if provided
    if (securityContext) {
      containerSpec.securityContext = securityContext;
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
          tenant: validatedNamespace
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
              tenant: validatedNamespace
            }
          },
          spec: {
            containers: [containerSpec]
          }
        }
      }
    };

    try {
      return await createOrUpdate(
        () => this.appsApi.createNamespacedDeployment(validatedNamespace, deployment),
        () => this.appsApi.replaceNamespacedDeployment(validatedAppName, validatedNamespace, deployment),
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
          app: validatedAppName
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
        () => this.coreApi.createNamespacedService(validatedNamespace, service),
        () => this.coreApi.replaceNamespacedService(validatedAppName, validatedNamespace, service),
        'service'
      );
    } catch (error) {
      throw error;
    }
  }

  // List all tenant namespaces
  async listTenants() {
    try {
      const response = await this.coreApi.listNamespace();
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
        this.coreApi.readNamespace(validatedNamespace),
        this.appsApi.listNamespacedDeployment(validatedNamespace),
        this.coreApi.listNamespacedService(validatedNamespace),
        this.coreApi.listNamespacedPod(validatedNamespace)
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
      const podsResponse = await this.coreApi.listNamespacedPod(validatedNamespace);
      const pods = extractBody(podsResponse);

      const quotaData = await executeK8sCall(
        () => this.coreApi.readNamespacedResourceQuota(`${validatedNamespace}-quota`, validatedNamespace),
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

  // Get resource quota for a namespace
  async getResourceQuota(namespace) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');

    return await executeK8sCall(
      () => this.coreApi.readNamespacedResourceQuota(`${validatedNamespace}-quota`, validatedNamespace),
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
        () => this.coreApi.replaceNamespacedResourceQuota(quotaName, validatedNamespace, resourceQuota),
        () => this.coreApi.createNamespacedResourceQuota(validatedNamespace, resourceQuota),
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
      await this.coreApi.deleteNamespace(validatedNamespace);
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
      await this.appsApi.patchNamespacedDeployment(
        validatedDeployment,
        validatedNamespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        options
      );

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

      await this.appsApi.patchNamespacedDeployment(
        validatedDeployment,
        validatedNamespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/merge-patch+json' } }
      );

      return { message: `Deployment ${validatedDeployment} restarted` };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { message: `Deployment ${validatedDeployment} not found, skipping restart` };
      }
      throw new Error(`Failed to restart deployment: ${error.message}`);
    }
  }

  // Create a Kubernetes Secret for database credentials
  async createDatabaseSecret(namespace, secretName, connectionString, username, password, databaseName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    const secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: validatedSecretName,
        namespace: validatedNamespace,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'app.kubernetes.io/component': 'database',
          'tenant': validatedNamespace
        }
      },
      type: 'Opaque',
      stringData: {
        'MONGODB_URI': connectionString,  // Primary - used by educationelly-graphql-server
        'MONGODB_URL': connectionString,  // Express.js convention
        'MONGO_URI': connectionString,    // Alternate naming
        'MONGO_URL': connectionString,    // Another common variant
        'MONGO_USERNAME': username,
        'MONGO_PASSWORD': password,
        'MONGO_DATABASE': databaseName
      }
    };

    try {
      try {
        await this.coreApi.createNamespacedSecret(validatedNamespace, secret);
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          // Update existing secret
          await this.coreApi.replaceNamespacedSecret(validatedSecretName, validatedNamespace, secret);
        } else {
          throw error;
        }
      }
      return { message: `Secret ${validatedSecretName} created successfully` };
    } catch (error) {
      throw new Error(`Failed to create secret: ${error.message}`);
    }
  }

  // Get a secret from a namespace
  async getSecret(namespace, secretName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    return await executeK8sCall(
      () => this.coreApi.readNamespacedSecret(validatedSecretName, validatedNamespace),
      'secret',
      { ignoreNotFound: true, operation: 'read' }
    );
  }

  // Delete a secret from a namespace
  async deleteSecret(namespace, secretName) {
    const validatedNamespace = validateResourceName(namespace, 'namespace');
    const validatedSecretName = validateResourceName(secretName, 'secret');

    try {
      await this.coreApi.deleteNamespacedSecret(validatedSecretName, validatedNamespace);
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
      const response = await this.appsApi.readNamespacedDeployment(validatedDeployment, validatedNamespace);
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
        await this.appsApi.replaceNamespacedDeployment(
          validatedDeployment,
          validatedNamespace,
          deployment
        );

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
      // Get pods in the namespace that match either GraphQL or REST server deployment
      let podsResponse = await this.coreApi.listNamespacedPod(
        validatedNamespace,
        undefined,
        undefined,
        undefined,
        undefined,
        'app=educationelly-graphql-server'
      );
      let pods = extractBody(podsResponse);

      // If no GraphQL server pods found, try REST API server
      if (!pods?.items || pods.items.length === 0) {
        podsResponse = await this.coreApi.listNamespacedPod(
          validatedNamespace,
          undefined,
          undefined,
          undefined,
          undefined,
          'app=educationelly-server'
        );
        pods = extractBody(podsResponse);
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
        const logsResponse = await this.coreApi.readNamespacedPodLog(
          podName,
          validatedNamespace,
          undefined, // container
          undefined, // follow
          undefined, // insecureSkipTLSVerifyBackend
          undefined, // limitBytes
          undefined, // pretty
          undefined, // previous
          undefined, // sinceSeconds
          100,       // tailLines
          undefined  // timestamps
        );

        const logs = logsResponse?.body || logsResponse || '';

        // Check for MongoDB connection indicators
        const hasMongoConnection = logs.includes('MongoDB') ||
                                   logs.includes('mongoose') ||
                                   logs.includes('Connected to') ||
                                   logs.includes('Database: Connected') ||
                                   /Database.*Connected/i.test(logs);
        const hasMongoError = logs.includes('MongoServerError') ||
                             logs.includes('MongooseServerSelectionError') ||
                             logs.includes('Authentication failed') ||
                             logs.includes('ECONNREFUSED') ||
                             logs.includes('connection error');

        if (hasMongoError) {
          return {
            connected: false,
            status: 'connection_error',
            message: 'Database connection error detected in logs',
            podName: podName
          };
        }

        if (hasMongoConnection) {
          return {
            connected: true,
            status: 'connected',
            message: 'Database connection detected',
            podName: podName
          };
        }

        // No clear indicators - pod is running but no connection info
        return {
          connected: null,
          status: 'unknown',
          message: 'No database connection info in logs',
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
