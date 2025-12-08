import k8sService from '../services/k8sService.js';
import ingressService from '../services/ingressService.js';
import { createLogger } from '../utils/logger.js';
import {
  validateBody,
  validateParams,
  deployAppSchema,
  scaleDeploymentSchema,
  tenantNameParamSchema,
  deploymentNameParamSchema
} from '../utils/validation.js';

const log = createLogger('deployment-controller');

class DeploymentController {
  // Deploy educationelly-graphql to a tenant namespace
  async deployApp(req, res) {
    try {
      // Validate tenant name parameter
      const { tenantName } = validateParams(tenantNameParamSchema, req.params);
      // Validate request body - validates replicas (1-10), images, env vars, appType
      const { replicas, serverImage, clientImage, env, appType } = validateBody(deployAppSchema, req.body);

      log.info({ tenantName, replicas, appType }, 'Deploying application to tenant');

      // Generate ingress URLs that will be created
      const ingressHost = ingressService.generateIngressHost();
      const serverIngressUrl = `http://${tenantName}-api.${ingressHost}`;
      const graphqlEndpoint = `${serverIngressUrl}/graphql`;

      const config = {
        replicas: replicas || 1,
        appType: appType || 'graphql',
        serverImage,
        clientImage,
        env: env || [],
        graphqlEndpoint // Pass the public GraphQL endpoint URL
      };

      const result = await k8sService.deployEducationelly(tenantName, config);

      // Create ingress resources for external access
      let clientIngress = null;
      let serverIngress = null;

      try {
        // Determine service names based on app type
        const isGraphQL = (appType || 'graphql') === 'graphql';
        const appPrefix = isGraphQL ? 'educationelly-graphql' : 'educationelly';
        const serverPort = isGraphQL ? 4000 : 8080;
        const clientPort = 3000; // Same for both types

        // Create ingress for client (frontend)
        clientIngress = await ingressService.createClientIngress(
          tenantName,
          `${appPrefix}-client`,
          clientPort
        );

        // Create ingress for server (API)
        serverIngress = await ingressService.createServerIngress(
          tenantName,
          `${appPrefix}-server`,
          serverPort
        );

        log.debug({ tenantName, clientIngress: clientIngress?.url, serverIngress: serverIngress?.url }, 'Ingresses created');
      } catch (ingressError) {
        log.error({ err: ingressError, tenantName }, 'Failed to create ingress');
        // Continue even if ingress creation fails
      }

      log.info({ tenantName, serverDeployment: result.server?.metadata?.name, clientDeployment: result.client?.metadata?.name }, 'Application deployed successfully');

      res.status(201).json({
        message: 'Application deployed successfully',
        deployments: {
          server: {
            name: result.server.metadata.name,
            namespace: result.server.metadata.namespace,
            replicas: result.server.spec.replicas,
            image: result.server.spec.template.spec.containers[0].image
          },
          client: {
            name: result.client.metadata.name,
            namespace: result.client.metadata.namespace,
            replicas: result.client.spec.replicas,
            image: result.client.spec.template.spec.containers[0].image
          }
        },
        ingress: {
          client: clientIngress,
          server: serverIngress
        }
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName }, 'Failed to deploy application');
      res.status(500).json({ error: error.message });
    }
  }

  // Scale a deployment
  async scaleDeployment(req, res) {
    try {
      // Validate URL parameters
      const { tenantName, deploymentName } = validateParams(deploymentNameParamSchema, req.params);
      // Validate request body - ensures replicas is 0-10
      const { replicas } = validateBody(scaleDeploymentSchema, req.body);

      log.info({ tenantName, deploymentName, replicas }, 'Scaling deployment');

      const result = await k8sService.scaleDeployment(tenantName, deploymentName, replicas);

      log.info({ tenantName, deploymentName, replicas }, 'Deployment scaled successfully');
      res.json(result);
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      log.error({ err: error, tenantName: req.params?.tenantName, deploymentName: req.params?.deploymentName }, 'Failed to scale deployment');
      res.status(500).json({ error: error.message });
    }
  }
}

export default new DeploymentController();
