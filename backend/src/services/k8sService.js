const { k8sApi, k8sAppsApi, k8sNetworkingApi } = require('../config/k8s');

class K8sService {
  // Create a new namespace for a tenant
  async createNamespace(tenantName, resourceQuota = {}) {
    const namespace = {
      metadata: {
        name: tenantName,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'tenant': tenantName
        }
      }
    };

    try {
      const response = await k8sApi.createNamespace(namespace);

      // Create resource quota if specified
      if (resourceQuota.cpu || resourceQuota.memory) {
        await this.createResourceQuota(tenantName, resourceQuota);
      }

      return response.body;
    } catch (error) {
      throw new Error(`Failed to create namespace: ${error.message}`);
    }
  }

  // Create resource quota for a namespace
  async createResourceQuota(namespace, quota) {
    const resourceQuota = {
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
      await k8sApi.createNamespacedResourceQuota(namespace, resourceQuota);
    } catch (error) {
      throw new Error(`Failed to create resource quota: ${error.message}`);
    }
  }

  // Deploy educationelly-graphql to a namespace
  async deployEducationelly(namespace, config = {}) {
    const appName = 'educationelly-graphql';
    const {
      replicas = 1,
      image = 'your-registry/educationelly-graphql:latest',
      port = 4000,
      env = []
    } = config;

    // Create deployment
    const deployment = {
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
      const deploymentResponse = await k8sAppsApi.createNamespacedDeployment(namespace, deployment);

      // Create service
      await this.createService(namespace, appName, port);

      return deploymentResponse.body;
    } catch (error) {
      throw new Error(`Failed to deploy application: ${error.message}`);
    }
  }

  // Create service for the deployment
  async createService(namespace, appName, port) {
    const service = {
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
      await k8sApi.createNamespacedService(namespace, service);
    } catch (error) {
      throw new Error(`Failed to create service: ${error.message}`);
    }
  }

  // List all tenant namespaces
  async listTenants() {
    try {
      const response = await k8sApi.listNamespace(
        undefined,
        undefined,
        undefined,
        undefined,
        'app.kubernetes.io/managed-by=multi-tenant-platform'
      );
      return response.body.items;
    } catch (error) {
      throw new Error(`Failed to list tenants: ${error.message}`);
    }
  }

  // Get tenant details including deployments and resource usage
  async getTenantDetails(namespace) {
    try {
      const [ns, deployments, services, pods] = await Promise.all([
        k8sApi.readNamespace(namespace),
        k8sAppsApi.listNamespacedDeployment(namespace),
        k8sApi.listNamespacedService(namespace),
        k8sApi.listNamespacedPod(namespace)
      ]);

      return {
        namespace: ns.body,
        deployments: deployments.body.items,
        services: services.body.items,
        pods: pods.body.items
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

module.exports = new K8sService();
