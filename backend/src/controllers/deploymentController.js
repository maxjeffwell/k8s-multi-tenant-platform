const k8sService = require('../services/k8sService');

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

module.exports = new DeploymentController();
