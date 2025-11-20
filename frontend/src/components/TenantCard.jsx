import { useState, useEffect } from 'react';
import { tenantApi, deploymentApi } from '../services/api';
import DeploymentControls from './DeploymentControls';

function TenantCard({ tenant, isExpanded, onToggle, onDeleted }) {
  const [details, setDetails] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isExpanded && !details) {
      fetchTenantDetails();
    }
  }, [isExpanded]);

  const fetchTenantDetails = async () => {
    setLoading(true);
    try {
      const [detailsData, metricsData] = await Promise.all([
        tenantApi.getTenant(tenant.name),
        tenantApi.getTenantMetrics(tenant.name),
      ]);
      setDetails(detailsData);
      setMetrics(metricsData);
    } catch (err) {
      console.error('Failed to fetch tenant details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete tenant "${tenant.name}"? This will remove all resources.`)) {
      return;
    }

    setDeleting(true);
    try {
      await tenantApi.deleteTenant(tenant.name);
      onDeleted();
    } catch (err) {
      alert('Failed to delete tenant: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const hasDeployments = details?.deployments && details.deployments.length > 0;

  return (
    <div className={`tenant-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="tenant-card-header" onClick={onToggle}>
        <div className="tenant-info">
          <h3>{tenant.name}</h3>
          <span className={`status-badge ${tenant.status.toLowerCase()}`}>
            {tenant.status}
          </span>
        </div>
        <div className="tenant-meta">
          <span className="created-date">
            Created: {new Date(tenant.createdAt).toLocaleDateString()}
          </span>
          <button className="expand-btn">
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="tenant-card-body">
          {loading ? (
            <div className="loading-details">Loading details...</div>
          ) : (
            <>
              {!hasDeployments && (
                <DeploymentControls
                  tenantName={tenant.name}
                  onDeploymentCreated={fetchTenantDetails}
                />
              )}

              {hasDeployments && (
                <div className="deployments-section">
                  <h4>Deployments</h4>
                  {details.deployments.map((deployment) => (
                    <div key={deployment.name} className="deployment-info">
                      <div className="deployment-header">
                        <span className="deployment-name">{deployment.name}</span>
                        <span className="replica-count">
                          {deployment.availableReplicas || 0}/{deployment.replicas} replicas
                        </span>
                      </div>
                      <div className="deployment-details">
                        <span>Image: {deployment.image}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {details?.services && details.services.length > 0 && (
                <div className="services-section">
                  <h4>Services</h4>
                  {details.services.map((service) => (
                    <div key={service.name} className="service-info">
                      <span>{service.name}</span>
                      <span>Type: {service.type}</span>
                      <span>
                        Ports: {service.ports.map((p) => p.port).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {metrics && (
                <div className="metrics-section">
                  <h4>Resource Usage</h4>
                  <div className="metrics-grid">
                    <div className="metric">
                      <span className="metric-label">Total Pods:</span>
                      <span className="metric-value">{metrics.metrics.pods.total}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Running:</span>
                      <span className="metric-value running">{metrics.metrics.pods.running}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Pending:</span>
                      <span className="metric-value pending">{metrics.metrics.pods.pending}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Failed:</span>
                      <span className="metric-value failed">{metrics.metrics.pods.failed}</span>
                    </div>
                  </div>
                </div>
              )}

              {details?.pods && details.pods.length > 0 && (
                <div className="pods-section">
                  <h4>Pods</h4>
                  <div className="pods-list">
                    {details.pods.map((pod) => (
                      <div key={pod.name} className="pod-info">
                        <span className="pod-name">{pod.name}</span>
                        <span className={`pod-status ${pod.status.toLowerCase()}`}>
                          {pod.status}
                        </span>
                        <span className="pod-restarts">Restarts: {pod.restarts}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="tenant-actions">
                <button className="btn-secondary" onClick={fetchTenantDetails}>
                  Refresh
                </button>
                <button
                  className="btn-danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Tenant'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default TenantCard;
