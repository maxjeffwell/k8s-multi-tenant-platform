import k8sService from '../services/k8sService.js';
import ingressService from '../services/ingressService.js';

class DeploymentController {
  // Deploy educationelly-graphql to a tenant namespace
  async deployApp(req, res) {
    try {
      const { tenantName } = req.params;
      const { replicas, serverImage, clientImage, env, appType } = req.body;

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
      } catch (ingressError) {
        console.error('Failed to create ingress:', ingressError);
        // Continue even if ingress creation fails
      }

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
      res.status(500).json({ error: error.message });
    }
  }

  // Scale a deployment
  async scaleDeployment(req, res) {
    try {
      const { tenantName, deploymentName } = req.params;
      const { replicas } = req.body;

      if (replicas === undefined || replicas < 0) {
        return res.status(400).json({ error: 'Valid replica count is required' });
      }

      const result = await k8sService.scaleDeployment(tenantName, deploymentName, replicas);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new DeploymentController();
