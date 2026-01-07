import { k8sNetworkingApi } from '../config/k8s.js';
import { createLogger } from '../utils/logger.js';

// Default logger - can be overridden via dependency injection for testing
const defaultLog = createLogger('ingress-service');

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

class IngressService {
  /**
   * Create an IngressService instance
   * @param {Object} deps - Optional dependencies for testing
   * @param {Object} deps.networkingApi - Kubernetes NetworkingV1Api client
   * @param {Object} deps.config - Configuration overrides
   * @param {string} deps.config.ingressDomain - Base ingress domain
   * @param {string} deps.config.ingressClass - Ingress class name
   * @param {Object} deps.logger - Logger instance
   */
  constructor(deps = {}) {
    const config = deps.config || {};
    this.networkingApi = deps.networkingApi || k8sNetworkingApi;
    this.ingressDomain = config.ingressDomain || process.env.INGRESS_DOMAIN || 'localhost.nip.io';
    this.ingressClass = config.ingressClass || process.env.INGRESS_CLASS || 'nginx';
    this.log = deps.logger || defaultLog;
  }

  /**
   * Generate the ingress host domain
   * @returns {string} - Base ingress domain
   */
  generateIngressHost() {
    return this.ingressDomain;
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
    const validatedTenant = validateResourceName(tenantName, 'namespace');
    const ingressName = `${validatedTenant}-client-ingress`;
    const host = `${validatedTenant}.${this.ingressDomain}`;

    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: ingressName,
        namespace: validatedTenant,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'tenant': validatedTenant,
          'ingress-type': 'client',
          'portfolio': 'true'
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
      try {
        await this.networkingApi.createNamespacedIngress({ namespace: validatedTenant, body: ingress });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          // Update existing ingress
          await this.networkingApi.replaceNamespacedIngress({ name: ingressName, namespace: validatedTenant, body: ingress });
        } else {
          throw error;
        }
      }

      this.log.info({ ingressName, host, namespace: validatedTenant }, 'Client ingress created');

      return {
        name: ingressName,
        url: `http://${host}`,
        host: host
      };
    } catch (error) {
      this.log.error({ err: error, ingressName, namespace: validatedTenant }, 'Failed to create client ingress');
      throw new Error(`Failed to create client ingress: ${error.message}`);
    }
  }

  /**
   * Create a unified ingress with path-based routing for both client and server
   * Routes /graphql, /api, /socket.io to server; everything else to client
   * @param {string} tenantName - Name of the tenant/namespace
   * @param {Object} clientConfig - Client service config { name, port }
   * @param {Object} serverConfig - Server service config { name, port } (optional for client-only apps)
   * @param {Object} options - Additional options { tlsSecretName }
   * @returns {Promise<Object>}
   */
  async createUnifiedIngress(tenantName, clientConfig, serverConfig = null, options = {}) {
    const validatedTenant = validateResourceName(tenantName, 'namespace');
    const ingressName = `${validatedTenant}-ingress`;
    const host = `${validatedTenant}.${this.ingressDomain}`;
    const tlsSecretName = options.tlsSecretName || 'tenants-wildcard-tls';

    // Build paths array - server paths first (more specific), then client catch-all
    const paths = [];

    if (serverConfig && serverConfig.name) {
      // Add server routes for API paths
      const serverPaths = ['/graphql', '/api', '/socket.io'];
      serverPaths.forEach(path => {
        paths.push({
          path: path,
          pathType: 'Prefix',
          backend: {
            service: {
              name: serverConfig.name,
              port: { number: serverConfig.port }
            }
          }
        });
      });
    }

    // Add client catch-all route
    paths.push({
      path: '/',
      pathType: 'Prefix',
      backend: {
        service: {
          name: clientConfig.name,
          port: { number: clientConfig.port }
        }
      }
    });

    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: ingressName,
        namespace: validatedTenant,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'tenant': validatedTenant,
          'ingress-type': 'unified',
          'portfolio': 'true'
        },
        annotations: {
          'traefik.ingress.kubernetes.io/router.entrypoints': 'web,websecure'
        }
      },
      spec: {
        ingressClassName: this.ingressClass,
        tls: [
          {
            hosts: [host],
            secretName: tlsSecretName
          }
        ],
        rules: [
          {
            host: host,
            http: { paths: paths }
          }
        ]
      }
    };

    try {
      try {
        await this.networkingApi.createNamespacedIngress({ namespace: validatedTenant, body: ingress });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          await this.networkingApi.replaceNamespacedIngress({ name: ingressName, namespace: validatedTenant, body: ingress });
        } else {
          throw error;
        }
      }

      this.log.info({ ingressName, host, namespace: validatedTenant, hasServer: !!serverConfig }, 'Unified ingress created');

      return {
        name: ingressName,
        url: `https://${host}`,
        host: host,
        type: 'unified'
      };
    } catch (error) {
      this.log.error({ err: error, ingressName, namespace: validatedTenant }, 'Failed to create unified ingress');
      throw new Error(`Failed to create unified ingress: ${error.message}`);
    }
  }

  /**
   * Create ingress for tenant's server/API application
   * @param {string} tenantName - Name of the tenant/namespace
   * @param {string} serviceName - Name of the service to expose
   * @param {number} servicePort - Port of the service
   * @returns {Promise<Object>}
   * @deprecated Use createUnifiedIngress instead for path-based routing
   */
  async createServerIngress(tenantName, serviceName = 'educationelly-graphql-server', servicePort = 4000) {
    const validatedTenant = validateResourceName(tenantName, 'namespace');
    const ingressName = `${validatedTenant}-server-ingress`;
    const host = `${validatedTenant}-api.${this.ingressDomain}`;

    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: ingressName,
        namespace: validatedTenant,
        labels: {
          'app.kubernetes.io/managed-by': 'multi-tenant-platform',
          'tenant': validatedTenant,
          'ingress-type': 'server',
          'portfolio': 'true'
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
      try {
        await this.networkingApi.createNamespacedIngress({ namespace: validatedTenant, body: ingress });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          // Update existing ingress
          await this.networkingApi.replaceNamespacedIngress({ name: ingressName, namespace: validatedTenant, body: ingress });
        } else {
          throw error;
        }
      }

      this.log.info({ ingressName, host, namespace: validatedTenant }, 'Server ingress created');

      return {
        name: ingressName,
        url: `http://${host}`,
        host: host
      };
    } catch (error) {
      this.log.error({ err: error, ingressName, namespace: validatedTenant }, 'Failed to create server ingress');
      throw new Error(`Failed to create server ingress: ${error.message}`);
    }
  }

  /**
   * Get all ingress resources for a tenant
   * @param {string} tenantName - Name of the tenant/namespace
   * @returns {Promise<Array>}
   */
  async getTenantIngresses(tenantName) {
    const validatedTenant = validateResourceName(tenantName, 'namespace');

    try {
      const response = await this.networkingApi.listNamespacedIngress({ namespace: validatedTenant });
      const result = extractBody(response);

      if (!result?.items || result.items.length === 0) {
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
      if (isNotFoundError(error)) {
        return [];
      }
      this.log.error({ err: error, namespace: validatedTenant }, 'Failed to get tenant ingresses');
      throw new Error(`Failed to get tenant ingresses: ${error.message}`);
    }
  }

  /**
   * Delete all ingress resources for a tenant
   * @param {string} tenantName - Name of the tenant/namespace
   * @returns {Promise<Object>}
   */
  async deleteTenantIngresses(tenantName) {
    const validatedTenant = validateResourceName(tenantName, 'namespace');

    try {
      // Get all ingresses in the namespace
      const response = await this.networkingApi.listNamespacedIngress({ namespace: validatedTenant });
      const ingresses = extractBody(response)?.items || [];

      if (ingresses.length === 0) {
        return { message: `No ingresses found for ${validatedTenant}` };
      }

      // Delete each ingress
      const deletePromises = ingresses.map(ingress =>
        this.networkingApi.deleteNamespacedIngress({ name: ingress.metadata.name, namespace: validatedTenant })
      );

      await Promise.all(deletePromises);

      this.log.info({ namespace: validatedTenant, count: ingresses.length }, 'Tenant ingresses deleted');

      return { message: `All ingresses for ${validatedTenant} deleted successfully` };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { message: `No ingresses found for ${validatedTenant}` };
      }
      this.log.error({ err: error, namespace: validatedTenant }, 'Failed to delete tenant ingresses');
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
    const validatedTenant = validateResourceName(tenantName, 'namespace');
    const validatedIngress = validateResourceName(ingressName, 'ingress');

    try {
      const response = await this.networkingApi.readNamespacedIngress({ name: validatedIngress, namespace: validatedTenant });
      const ingress = extractBody(response);

      const hasIP = ingress.status?.loadBalancer?.ingress?.[0]?.ip !== undefined;
      const host = ingress.spec.rules?.[0]?.host;

      return {
        ready: hasIP,
        host: host,
        url: host ? `http://${host}` : null,
        ip: ingress.status?.loadBalancer?.ingress?.[0]?.ip || null
      };
    } catch (error) {
      this.log.error({ err: error, ingressName: validatedIngress, namespace: validatedTenant }, 'Failed to check ingress readiness');
      throw new Error(`Failed to check ingress readiness: ${error.message}`);
    }
  }

  /**
   * Check if ingress controller is available
   * @returns {Promise<boolean>}
   */
  async isIngressControllerAvailable() {
    try {
      // List ingress classes to check if the specified class exists
      const response = await this.networkingApi.listIngressClass({});
      const classes = extractBody(response)?.items || [];

      return classes.some(ic => ic.metadata.name === this.ingressClass);
    } catch (error) {
      this.log.warn({ err: error, ingressClass: this.ingressClass }, 'Failed to check ingress controller');
      return false;
    }
  }
}

// Export the class for testing with dependency injection
export { IngressService };

// Export validation helpers for testing
export { validateResourceName, isNotFoundError, isAlreadyExistsError };

// Factory function for creating instances with custom dependencies
export function createIngressService(deps = {}) {
  return new IngressService(deps);
}

// Default singleton instance for production use
const ingressService = new IngressService();
export default ingressService;
