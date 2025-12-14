import { useState, useEffect, useCallback } from 'react';
import { tenantApi, databaseApi } from '../services/api';
import DeploymentControls from './DeploymentControls';

const APP_DB_MAPPING = {
  'educationelly': 'educationelly-db',
  'educationelly-graphql': 'educationelly-db',
  'code-talk': 'postgres-aws',
  'bookmarked': 'postgres-neon',
  'firebook': 'firebook-db',
  'intervalai': 'spaced-repetition-db'
};

function TenantCard({ tenant, isExpanded, onToggle, onDeleted }) {
  const [details, setDetails] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [enablingDatabase, setEnablingDatabase] = useState(false);
  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaForm, setQuotaForm] = useState({ cpu: '', memory: '' });

  const fetchTenantDetails = useCallback(async () => {
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
  }, [tenant.name]);

  useEffect(() => {
    if (isExpanded && !details) {
      fetchTenantDetails();
    }
  }, [isExpanded, details, fetchTenantDetails]);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete tenant "${tenant.name}"? This will remove all resources.`)) {
      return;
    }

    setDeleting(true);
    try {
      await tenantApi.deleteTenant(tenant.name);
      // Immediately trigger parent refresh with tenant name
      onDeleted(tenant.name);
    } catch (err) {
      alert('Failed to delete tenant: ' + err.message);
      setDeleting(false);
    }
    // Don't set deleting to false on success - let the component unmount
  };

  const handleEnableDatabase = async () => {
    const appType = tenant.appType || details?.tenant?.appType;
    
    if (!appType) {
      alert('Cannot enable database: App type is unknown for this tenant.');
      return;
    }

    const dbKey = APP_DB_MAPPING[appType];
    if (!dbKey) {
      alert(`No database mapping found for app type: ${appType}`);
      return;
    }

    if (!confirm(`Enable ${dbKey} for ${tenant.name}?`)) {
      return;
    }

    setEnablingDatabase(true);
    try {
      // Send only the database key to the backend
      await databaseApi.enableDatabaseWithKey(tenant.name, dbKey);
      alert('Database enabled successfully! Pods are restarting...');
      await fetchTenantDetails();
    } catch (err) {
      alert('Failed to enable database: ' + err.message);
    } finally {
      setEnablingDatabase(false);
    }
  };

  const handleEditQuota = () => {
    setQuotaForm({
      cpu: tenant.cpu || '2',
      memory: tenant.memory || '4Gi'
    });
    setEditingQuota(true);
  };

  const handleUpdateQuota = async (e) => {
    e.preventDefault();

    if (!quotaForm.cpu || !quotaForm.memory) {
      alert('Please provide both CPU and memory values');
      return;
    }

    try {
      await tenantApi.updateTenant(tenant.name, quotaForm);
      alert('Resource quota updated successfully!');
      setEditingQuota(false);
      // Refresh parent to show updated quotas
      onDeleted(null); // This triggers parent refresh without deleting
      window.location.reload(); // Reload to show updated values
    } catch (err) {
      alert('Failed to update quota: ' + err.message);
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
                  lockedAppType={tenant.appType || details?.tenant?.appType}
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

              {details?.ingresses && details.ingresses.length > 0 && (
                <div className="ingress-section">
                  <h4>Access URLs</h4>
                  {details.ingresses.map((ingress) => (
                    <div key={ingress.name} className="ingress-info">
                      <div className="ingress-header">
                        <span className="ingress-type">
                          {ingress.type === 'client' ? '🌐 Frontend' : '⚡ API'}
                        </span>
                        <a
                          href={ingress.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ingress-url"
                        >
                          {ingress.host}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {details?.database && (
                <div className="database-section">
                  <h4>Database</h4>
                  <div className="database-info">
                    {details.database.configured ? (
                      <>
                        <div className="database-header">
                          <span className="database-name">
                            {details.database.name}
                          </span>
                          {details.database.connection && (
                            <span className={`connection-status ${details.database.connection.status}`}>
                              {details.database.connection.status === 'connected' && '✓ Connected'}
                              {details.database.connection.status === 'connection_error' && '✗ Connection Error'}
                              {details.database.connection.status === 'no_pods' && '○ No Pods'}
                              {details.database.connection.status === 'pod_not_running' && '○ Pod Not Running'}
                              {details.database.connection.status === 'unknown' && '? Unknown'}
                              {details.database.connection.status === 'logs_unavailable' && '? Logs Unavailable'}
                            </span>
                          )}
                        </div>
                        <div className="database-details">
                          {details.database.connection?.message && (
                            <span className="connection-message">
                              {details.database.connection.message}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="database-not-configured">
                        <p>No database configured</p>
                        <button
                          className="btn-primary btn-enable-database"
                          onClick={handleEnableDatabase}
                          disabled={enablingDatabase || !hasDeployments}
                        >
                          {enablingDatabase ? 'Enabling...' : 'Enable Database'}
                        </button>
                        {!hasDeployments && (
                          <p className="database-hint">Deploy an application first</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {details?.services && details.services.length > 0 && (
                <div className="services-section">
                  <h4>Services</h4>
                  {details.services.map((service) => {
                    // Find pods that match this service's selector
                    const matchingPods = details.pods?.filter(pod => {
                      if (!service.selector || !pod.labels) return false;
                      return Object.entries(service.selector).every(
                        ([key, value]) => pod.labels[key] === value
                      );
                    }) || [];

                    return (
                      <div key={service.name} className="service-info">
                        <div className="service-header">
                          <span className="service-name">{service.name}</span>
                          <span className="service-type">Type: {service.type}</span>
                        </div>
                        <div className="service-details">
                          <div className="service-ports">
                            Ports: {service.ports.map((p) => `${p.port}:${p.targetPort}`).join(', ')}
                          </div>
                          {matchingPods.length > 0 && (
                            <div className="service-pods">
                              <span className="pods-label">Targeting pods:</span>
                              {matchingPods.map(pod => (
                                <span key={pod.name} className={`pod-badge ${pod.status.toLowerCase()}`}>
                                  {pod.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {metrics && metrics.pods && (
                <div className="metrics-section">
                  <h4>Resource Usage</h4>
                  <div className="metrics-grid">
                    <div className="metric">
                      <span className="metric-label">Total Pods:</span>
                      <span className="metric-value">{metrics.pods.total}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Running:</span>
                      <span className="metric-value running">{metrics.pods.running}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Pending:</span>
                      <span className="metric-value pending">{metrics.pods.pending}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Failed:</span>
                      <span className="metric-value failed">{metrics.pods.failed}</span>
                    </div>
                  </div>
                </div>
              )}

              {metrics?.podsList && metrics.podsList.length > 0 && (
                <div className="pods-section">
                  <h4>Pods</h4>
                  <div className="pods-list">
                    {metrics.podsList.map((pod) => (
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

              {editingQuota && (
                <div className="edit-quota-form">
                  <h4>Edit Resource Quota</h4>
                  <form onSubmit={handleUpdateQuota}>
                    <div className="form-group">
                      <label>CPU Cores</label>
                      <input
                        type="text"
                        value={quotaForm.cpu}
                        onChange={(e) => setQuotaForm({ ...quotaForm, cpu: e.target.value })}
                        placeholder="e.g., 2 or 500m"
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Memory</label>
                      <input
                        type="text"
                        value={quotaForm.memory}
                        onChange={(e) => setQuotaForm({ ...quotaForm, memory: e.target.value })}
                        placeholder="e.g., 4Gi or 2048Mi"
                        className="form-input"
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn-primary">
                        Update
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setEditingQuota(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="tenant-actions">
                <button className="btn-secondary" onClick={fetchTenantDetails}>
                  Refresh
                </button>
                <button className="btn-secondary" onClick={handleEditQuota}>
                  Edit Quota
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
