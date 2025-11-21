import { useState, useEffect } from 'react';
import { tenantApi } from '../services/api';
import TenantList from '../components/TenantList';
import CreateTenant from '../components/CreateTenant';
import '../styles/Dashboard.css';

function Dashboard() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const data = await tenantApi.listTenants();
      setTenants(data.tenants);
      setError(null);
    } catch (err) {
      setError('Failed to fetch tenants: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
    // No auto-refresh - user can manually refresh when needed
  }, []);

  const handleTenantCreated = () => {
    setShowCreateForm(false);
    fetchTenants();
  };

  const handleTenantDeleted = (deletedTenantName) => {
    // Optimistically remove tenant from UI immediately
    setTenants(prevTenants => prevTenants.filter(t => t.name !== deletedTenantName));
    // Fetch again after a delay to sync with actual state
    setTimeout(fetchTenants, 2000);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Multi-Tenant Portfolio Hosting</h1>
        <p>Manage isolated instances of educationelly-graphql</p>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-actions">
          <button
            className="btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : 'Create New Tenant'}
          </button>
          <button className="btn-secondary" onClick={fetchTenants}>
            Refresh
          </button>
        </div>

        {showCreateForm && (
          <CreateTenant onSuccess={handleTenantCreated} onCancel={() => setShowCreateForm(false)} />
        )}

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Loading tenants...</div>
        ) : (
          <TenantList
            tenants={tenants}
            onTenantDeleted={handleTenantDeleted}
          />
        )}
      </div>
    </div>
  );
}

export default Dashboard;
