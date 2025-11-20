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

      // Return the namespace details
      const response = await k8sApi.readNamespace(tenantName);
      return response.body || response;
    } catch (error) {
      throw new Error(`Failed to create namespace: ${error.message}`);
    }
  }

  // Create resource quota for a namespace
  async createResourceQuota(namespace, quota) {
    const resourceQuota = {
      metadata: {
        name: `${namespace}-quota`
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
      await k8sApi.createNamespacedResourceQuota(namespace, resourceQuota);
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
      env = []
    } = config;

    try {
      // Deploy GraphQL Server
      const serverDeployment = await this.createDeployment(
        namespace,
        'educationelly-graphql-server',
        serverImage,
        serverPort,
        replicas,
        env
      );

      // Create service for server
      await this.createService(namespace, 'educationelly-graphql-server', serverPort);

      // Deploy Client Frontend
      const clientDeployment = await this.createDeployment(
        namespace,
        'educationelly-graphql-client',
        clientImage,
        clientPort,
        replicas,
        env
      );

      // Create service for client
      await this.createService(namespace, 'educationelly-graphql-client', clientPort);

      return {
        server: serverDeployment.body,
        client: clientDeployment.body
      };
    } catch (error) {
      throw new Error(`Failed to deploy application: ${error.message}`);
    }
  }

  // Helper method to create a deployment
  async createDeployment(namespace, appName, image, port, replicas, env) {
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
            containers: [
              {
                name: appName,
                image: image,
                ports: [
                  {
                    containerPort: port,
                    name: 'http'
                  }
                ],
                env: env,
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
              }
            ]
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
}

export default new K8sService();
