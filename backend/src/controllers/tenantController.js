const k8sService = require('../services/k8sService');

class TenantController {
  // Create a new tenant
  async createTenant(req, res) {
    try {
      const { tenantName, resourceQuota } = req.body;

      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required' });
      }

      // Validate tenant name (must be valid k8s namespace name)
      const nameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
      if (!nameRegex.test(tenantName)) {
        return res.status(400).json({
          error: 'Invalid tenant name. Must be lowercase alphanumeric with hyphens only'
        });
      }

      const namespace = await k8sService.createNamespace(tenantName, resourceQuota);

      res.status(201).json({
        message: 'Tenant created successfully',
        tenant: {
          name: namespace.metadata.name,
          createdAt: namespace.metadata.creationTimestamp
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // List all tenants
  async listTenants(req, res) {
    try {
      const namespaces = await k8sService.listTenants();

      const tenants = namespaces.map(ns => ({
        name: ns.metadata.name,
        status: ns.status.phase,
        createdAt: ns.metadata.creationTimestamp,
        labels: ns.metadata.labels
      }));

      res.json({ tenants });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get tenant details
  async getTenant(req, res) {
    try {
      const { tenantName } = req.params;
      const details = await k8sService.getTenantDetails(tenantName);

      res.json({
        tenant: {
          name: details.namespace.metadata.name,
          status: details.namespace.status.phase,
          createdAt: details.namespace.metadata.creationTimestamp
        },
        deployments: details.deployments.map(d => ({
          name: d.metadata.name,
          replicas: d.spec.replicas,
          availableReplicas: d.status.availableReplicas || 0,
          image: d.spec.template.spec.containers[0].image
        })),
        services: details.services.map(s => ({
          name: s.metadata.name,
          type: s.spec.type,
          ports: s.spec.ports
        })),
        pods: details.pods.map(p => ({
          name: p.metadata.name,
          status: p.status.phase,
          restarts: p.status.containerStatuses?.[0]?.restartCount || 0
        }))
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get tenant metrics
  async getTenantMetrics(req, res) {
    try {
      const { tenantName } = req.params;
      const metrics = await k8sService.getNamespaceMetrics(tenantName);

      res.json({ metrics });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Delete a tenant
  async deleteTenant(req, res) {
    try {
      const { tenantName } = req.params;
      const result = await k8sService.deleteTenant(tenantName);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new TenantController();
