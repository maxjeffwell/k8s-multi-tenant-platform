import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class IngressService {
  constructor() {
    this.ingressDomain = process.env.INGRESS_DOMAIN || 'localhost.nip.io';
    this.ingressClass = process.env.INGRESS_CLASS || 'nginx';
  }

  /**
   * Get the full URL for a tenant
   * @param {string} tenantName - Name of the tenant
   * @param {string} serviceName - Name of the service (default: educationelly-graphql-client)
   * @returns {string} - Full URL
   */
  getTenantURL(tenantName, serviceName = 'educationelly-graphql-client') {
    return `http://${tenantName}.${this.ingressDomain}`;
  }

  /**
   * Get the server URL for a tenant
   * @param {string} tenantName - Name of the tenant
   * @returns {string} - Server URL
   */
  getTenantServerURL(tenantName) {
    return `http://${tenantName}-api.${this.ingressDomain}`;
  }

  /**
   * Create ingress for tenant's client application
   * @param {string} tenantName - Name of the tenant/namespace
   * @param {string} serviceName - Name of the service to expose
   * @param {number} servicePort - Port of the service
   * @returns {Promise<Object>}
   */
  async createClientIngress(tenantName, serviceName = 'educationelly-graphql-client', servicePort = 3000) {
    const ingressName = `${tenantName}-client-ingress`;
    const host = `${tenantName}.${this.ingressDomain}`;

    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: ingressName,
        namespace: tenantName,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'tenant': tenantName,
          'ingress-type': 'client'
        },
        annotations: {
          'nginx.ingress.kubernetes.io/ssl-redirect': 'false'
        }
      },
      spec: {
        ingressClassName: this.ingressClass,
        rules: [
          {
            host: host,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: serviceName,
                      port: {
                        number: servicePort
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    };

    try {
      const ingressJson = JSON.stringify(ingress);
      const applyCmd = `echo '${ingressJson}' | kubectl apply -f -`;
      await execAsync(applyCmd);

      return {
        name: ingressName,
        url: `http://${host}`,
        host: host
      };
    } catch (error) {
      throw new Error(`Failed to create client ingress: ${error.message}`);
    }
  }

  /**
   * Create ingress for tenant's server/API application
   * @param {string} tenantName - Name of the tenant/namespace
   * @param {string} serviceName - Name of the service to expose
   * @param {number} servicePort - Port of the service
   * @returns {Promise<Object>}
   */
  async createServerIngress(tenantName, serviceName = 'educationelly-graphql-server', servicePort = 4000) {
    const ingressName = `${tenantName}-server-ingress`;
    const host = `${tenantName}-api.${this.ingressDomain}`;

    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: ingressName,
        namespace: tenantName,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'tenant': tenantName,
          'ingress-type': 'server'
        },
        annotations: {
          'nginx.ingress.kubernetes.io/ssl-redirect': 'false'
        }
      },
      spec: {
        ingressClassName: this.ingressClass,
        rules: [
          {
            host: host,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: serviceName,
                      port: {
                        number: servicePort
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    };

    try {
      const ingressJson = JSON.stringify(ingress);
      const applyCmd = `echo '${ingressJson}' | kubectl apply -f -`;
      await execAsync(applyCmd);

      return {
        name: ingressName,
        url: `http://${host}`,
        host: host
      };
    } catch (error) {
      throw new Error(`Failed to create server ingress: ${error.message}`);
    }
  }

  /**
   * Get all ingress resources for a tenant
   * @param {string} tenantName - Name of the tenant/namespace
   * @returns {Promise<Array>}
   */
  async getTenantIngresses(tenantName) {
    try {
      const getCmd = `kubectl get ingress -n ${tenantName} -o json`;
      const { stdout } = await execAsync(getCmd);
      const result = JSON.parse(stdout);

      if (!result.items || result.items.length === 0) {
        return [];
      }

      return result.items.map(ingress => ({
        name: ingress.metadata.name,
        type: ingress.metadata.labels?.['ingress-type'] || 'unknown',
        host: ingress.spec.rules?.[0]?.host || null,
        url: ingress.spec.rules?.[0]?.host ? `http://${ingress.spec.rules[0].host}` : null,
        createdAt: ingress.metadata.creationTimestamp
      }));
    } catch (error) {
      // If namespace has no ingresses, return empty array
      if (error.message.includes('No resources found')) {
        return [];
      }
      throw new Error(`Failed to get tenant ingresses: ${error.message}`);
    }
  }

  /**
   * Delete all ingress resources for a tenant
   * @param {string} tenantName - Name of the tenant/namespace
   * @returns {Promise<Object>}
   */
  async deleteTenantIngresses(tenantName) {
    try {
      const deleteCmd = `kubectl delete ingress -n ${tenantName} --all`;
      await execAsync(deleteCmd);
      return { message: `All ingresses for ${tenantName} deleted successfully` };
    } catch (error) {
      // If no ingresses exist, consider it success
      if (error.message.includes('No resources found')) {
        return { message: `No ingresses found for ${tenantName}` };
      }
      throw new Error(`Failed to delete tenant ingresses: ${error.message}`);
    }
  }

  /**
   * Check if ingress is ready (has IP assigned)
   * @param {string} tenantName - Name of the tenant/namespace
   * @param {string} ingressName - Name of the ingress
   * @returns {Promise<Object>}
   */
  async checkIngressReady(tenantName, ingressName) {
    try {
      const getCmd = `kubectl get ingress ${ingressName} -n ${tenantName} -o json`;
      const { stdout } = await execAsync(getCmd);
      const ingress = JSON.parse(stdout);

      const hasIP = ingress.status?.loadBalancer?.ingress?.[0]?.ip !== undefined;
      const host = ingress.spec.rules?.[0]?.host;

      return {
        ready: hasIP,
        host: host,
        url: host ? `http://${host}` : null,
        ip: ingress.status?.loadBalancer?.ingress?.[0]?.ip || null
      };
    } catch (error) {
      throw new Error(`Failed to check ingress readiness: ${error.message}`);
    }
  }

  /**
   * Check if ingress controller is available
   * @returns {Promise<boolean>}
   */
  async isIngressControllerAvailable() {
    try {
      const getCmd = `kubectl get ingressclass ${this.ingressClass} -o json`;
      await execAsync(getCmd);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default new IngressService();
