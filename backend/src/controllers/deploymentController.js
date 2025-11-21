import k8sService from '../services/k8sService.js';
import ingressService from '../services/ingressService.js';

class DeploymentController {
  // Deploy educationelly-graphql to a tenant namespace
  async deployApp(req, res) {
    try {
      const { tenantName } = req.params;
      const { replicas, serverImage, clientImage, env } = req.body;

      const config = {
        replicas: replicas || 1,
        serverImage,
        clientImage,
        env: env || []
      };

      const result = await k8sService.deployEducationelly(tenantName, config);

      // Create ingress resources for external access
      let clientIngress = null;
      let serverIngress = null;

      try {
        // Create ingress for client (frontend)
        clientIngress = await ingressService.createClientIngress(
          tenantName,
          'educationelly-graphql-client',
          3000
        );

        // Create ingress for server (GraphQL API)
        serverIngress = await ingressService.createServerIngress(
          tenantName,
          'educationelly-graphql-server',
          4000
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
