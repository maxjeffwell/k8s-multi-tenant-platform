import { k8sApi, k8sAppsApi, k8sNetworkingApi } from '../config/k8s.js';
import * as k8s from '@kubernetes/client-node';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class K8sService {
  // Create a new namespace for a tenant
  async createNamespace(tenantName, resourceQuota = {}) {
    try {
      // Use kubectl as workaround for K8s client API compatibility issue
      const createCmd = `kubectl create namespace ${tenantName} --dry-run=client -o json`;
      const { stdout } = await execAsync(createCmd);
      const nsObject = JSON.parse(stdout);

      // Add labels
      nsObject.metadata.labels = {
        'app.kubernetes.io/managed-by': 'multi-tenant-platform',
        'tenant': tenantName
      };

      // Apply the namespace
      const applyCmd = `echo '${JSON.stringify(nsObject)}' | kubectl apply -f -`;
      await execAsync(applyCmd);

      // Create resource quota if specified
      if (resourceQuota.cpu || resourceQuota.memory) {
        await this.createResourceQuota(tenantName, resourceQuota);
      }

      // Return the namespace details using kubectl
      const getCmd = `kubectl get namespace ${tenantName} -o json`;
      const { stdout: nsData } = await execAsync(getCmd);
      return JSON.parse(nsData);
    } catch (error) {
      throw new Error(`Failed to create namespace: ${error.message}`);
    }
  }

  // Create resource quota for a namespace
  async createResourceQuota(namespace, quota) {
    const resourceQuota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: `${namespace}-quota`,
        namespace: namespace
      },
      spec: {
        hard: {
          'requests.cpu': quota.cpu || '2',
          'requests.memory': quota.memory || '4Gi',
          'limits.cpu': quota.cpu || '2',
          'limits.memory': quota.memory || '4Gi',
          'persistentvolumeclaims': '5',
          'pods': '10'
        }
      }
    };

    try {
      const quotaJson = JSON.stringify(resourceQuota);
      const applyCmd = `echo '${quotaJson}' | kubectl apply -f -`;
      await execAsync(applyCmd);
    } catch (error) {
      throw new Error(`Failed to create resource quota: ${error.message}`);
    }
  }

  // Deploy educationelly-graphql to a namespace
  async deployEducationelly(namespace, config = {}) {
    const {
      replicas = 1,
      serverImage = 'maxjeffwell/educationelly-graphql-server:latest',
      clientImage = 'maxjeffwell/educationelly-graphql-client:latest',
      serverPort = 4000,
      clientPort = 3000,
      env = [],
      databaseSecretName = null
    } = config;

    try {
      // Check if database secret exists in namespace
      const secretName = databaseSecretName || `${namespace}-mongodb-secret`;
      const secretExists = await this.getSecret(namespace, secretName);

      // Deploy GraphQL Server with database secret if available
      const serverDeployment = await this.createDeployment(
        namespace,
        'educationelly-graphql-server',
        serverImage,
        serverPort,
        replicas,
        env,
        secretExists ? secretName : null
      );

      // Create service for server
      await this.createService(namespace, 'educationelly-graphql-server', serverPort);

      // Deploy Client Frontend (doesn't need database access)
      // Security context allows nginx to bind to privileged ports
      const clientSecurityContext = {
        runAsUser: 0, // Run as root to allow nginx to bind to port 80
        allowPrivilegeEscalation: true
      };

      const clientDeployment = await this.createDeployment(
        namespace,
        'educationelly-graphql-client',
        clientImage,
        clientPort,
        replicas,
        env,
        null, // Client doesn't need database secret
        clientSecurityContext
      );

      // Create service for client
      await this.createService(namespace, 'educationelly-graphql-client', clientPort);

      return {
        server: serverDeployment.body,
        client: clientDeployment.body,
        databaseConfigured: !!secretExists
      };
    } catch (error) {
      throw new Error(`Failed to deploy application: ${error.message}`);
    }
  }

  // Helper method to create a deployment
  async createDeployment(namespace, appName, image, port, replicas, env, secretName = null, securityContext = null) {
    const containerSpec = {
      name: appName,
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
        name: appName,
        namespace: namespace,
        labels: {
          app: appName,
          tenant: namespace
        }
      },
      spec: {
        replicas: replicas,
        selector: {
          matchLabels: {
            app: appName
          }
        },
        template: {
          metadata: {
            labels: {
              app: appName,
              tenant: namespace
            }
          },
          spec: {
            containers: [containerSpec]
          }
        }
      }
    };

    try {
      // Use kubectl to create deployment
      const deploymentJson = JSON.stringify(deployment);
      const applyCmd = `echo '${deploymentJson}' | kubectl apply -f -`;
      await execAsync(applyCmd);

      // Read back the deployment using kubectl
      const getCmd = `kubectl get deployment ${appName} -n ${namespace} -o json`;
      const { stdout } = await execAsync(getCmd);
      const deploymentResult = JSON.parse(stdout);

      return { body: deploymentResult };
    } catch (error) {
      throw new Error(`Failed to create deployment ${appName}: ${error.message}`);
    }
  }

  // Create service for the deployment
  async createService(namespace, appName, port) {
    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: appName,
        namespace: namespace,
        labels: {
          app: appName
        }
      },
      spec: {
        type: 'ClusterIP',
        selector: {
          app: appName
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
      // Use kubectl to create service
      const serviceJson = JSON.stringify(service);
      const applyCmd = `echo '${serviceJson}' | kubectl apply -f -`;
      await execAsync(applyCmd);
    } catch (error) {
      throw new Error(`Failed to create service: ${error.message}`);
    }
  }

  // List all tenant namespaces
  async listTenants() {
    try {
      const response = await k8sApi.listNamespace();
      // Handle both response.body and direct response
      const allItems = response.body?.items || response.items || [];

      // Filter to only include namespaces managed by this platform
      const filteredItems = allItems.filter(ns => {
        const labels = ns.metadata?.labels || {};
        return labels['app.kubernetes.io/managed-by'] === 'multi-tenant-platform';
      });

      return filteredItems;
    } catch (error) {
      // If no tenants exist yet, return empty array instead of error
      if (error.response?.statusCode === 404 || error.statusCode === 404) {
        return [];
      }
      throw new Error(`Failed to list tenants: ${error.message}`);
    }
  }

  // Get tenant details including deployments and resource usage
  async getTenantDetails(namespace) {
    try {
      // Use kubectl as workaround for K8s client API compatibility issue
      const [nsResult, deploymentsResult, servicesResult, podsResult] = await Promise.all([
        execAsync(`kubectl get namespace ${namespace} -o json`),
        execAsync(`kubectl get deployments -n ${namespace} -o json`),
        execAsync(`kubectl get services -n ${namespace} -o json`),
        execAsync(`kubectl get pods -n ${namespace} -o json`)
      ]);

      const ns = JSON.parse(nsResult.stdout);
      const deployments = JSON.parse(deploymentsResult.stdout);
      const services = JSON.parse(servicesResult.stdout);
      const pods = JSON.parse(podsResult.stdout);

      return {
        namespace: ns,
        deployments: deployments.items || [],
        services: services.items || [],
        pods: pods.items || []
      };
    } catch (error) {
      throw new Error(`Failed to get tenant details: ${error.message}`);
    }
  }

  // Get resource usage metrics for a namespace
  async getNamespaceMetrics(namespace) {
    try {
      const pods = await k8sApi.listNamespacedPod(namespace);
      const quota = await k8sApi.readNamespacedResourceQuota(`${namespace}-quota`, namespace);

      return {
        pods: {
          total: pods.body.items.length,
          running: pods.body.items.filter(p => p.status.phase === 'Running').length,
          pending: pods.body.items.filter(p => p.status.phase === 'Pending').length,
          failed: pods.body.items.filter(p => p.status.phase === 'Failed').length
        },
        quota: quota.body
      };
    } catch (error) {
      throw new Error(`Failed to get metrics: ${error.message}`);
    }
  }

  // Delete a tenant namespace (this will delete all resources in it)
  async deleteTenant(namespace) {
    try {
      await k8sApi.deleteNamespace(namespace);
      return { message: `Namespace ${namespace} deleted successfully` };
    } catch (error) {
      throw new Error(`Failed to delete tenant: ${error.message}`);
    }
  }

  // Scale a deployment
  async scaleDeployment(namespace, deploymentName, replicas) {
    try {
      const patch = {
        spec: {
          replicas: replicas
        }
      };

      const options = { headers: { 'Content-Type': 'application/merge-patch+json' } };
      await k8sAppsApi.patchNamespacedDeployment(
        deploymentName,
        namespace,
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

  // Create a Kubernetes Secret for database credentials
  async createDatabaseSecret(namespace, secretName, connectionString, username, password, databaseName) {
    const secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: secretName,
        namespace: namespace,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'app.kubernetes.io/component': 'database',
          'tenant': namespace
        }
      },
      type: 'Opaque',
      stringData: {
        'MONGODB_URI': connectionString,  // Primary - used by educationelly-graphql-server
        'MONGO_URI': connectionString,    // Alternate naming
        'MONGO_USERNAME': username,
        'MONGO_PASSWORD': password,
        'MONGO_DATABASE': databaseName
      }
    };

    try {
      // Use kubectl to create secret
      const secretJson = JSON.stringify(secret);
      const applyCmd = `echo '${secretJson}' | kubectl apply -f -`;
      await execAsync(applyCmd);

      return { message: `Secret ${secretName} created successfully` };
    } catch (error) {
      throw new Error(`Failed to create secret: ${error.message}`);
    }
  }

  // Get a secret from a namespace
  async getSecret(namespace, secretName) {
    try {
      const getCmd = `kubectl get secret ${secretName} -n ${namespace} -o json`;
      const { stdout } = await execAsync(getCmd);
      return JSON.parse(stdout);
    } catch (error) {
      if (error.message.includes('NotFound') || error.message.includes('not found')) {
        return null;
      }
      throw new Error(`Failed to get secret: ${error.message}`);
    }
  }

  // Delete a secret from a namespace
  async deleteSecret(namespace, secretName) {
    try {
      const deleteCmd = `kubectl delete secret ${secretName} -n ${namespace}`;
      await execAsync(deleteCmd);
      return { message: `Secret ${secretName} deleted successfully` };
    } catch (error) {
      if (error.message.includes('NotFound') || error.message.includes('not found')) {
        return { message: `Secret already deleted or doesn't exist` };
      }
      throw new Error(`Failed to delete secret: ${error.message}`);
    }
  }

  // Update deployment to use environment variables from secret
  async updateDeploymentWithSecret(namespace, deploymentName, secretName) {
    try {
      // Get current deployment
      const getCmd = `kubectl get deployment ${deploymentName} -n ${namespace} -o json`;
      const { stdout } = await execAsync(getCmd);
      const deployment = JSON.parse(stdout);

      // Update container env to use secretRef
      if (deployment.spec.template.spec.containers[0]) {
        deployment.spec.template.spec.containers[0].envFrom = [
          {
            secretRef: {
              name: secretName
            }
          }
        ];

        // Apply updated deployment
        const deploymentJson = JSON.stringify(deployment);
        const applyCmd = `echo '${deploymentJson}' | kubectl apply -f -`;
        await execAsync(applyCmd);

        return { message: `Deployment ${deploymentName} updated to use secret ${secretName}` };
      }

      throw new Error('No containers found in deployment');
    } catch (error) {
      throw new Error(`Failed to update deployment with secret: ${error.message}`);
    }
  }
}

export default new K8sService();
