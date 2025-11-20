import { useState } from 'react';
import { tenantApi } from '../services/api';

function CreateTenant({ onSuccess, onCancel }) {
  const [tenantName, setTenantName] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4Gi');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await tenantApi.createTenant(tenantName, { cpu, memory });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-tenant-form">
      <h2>Create New Tenant</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="tenantName">Tenant Name:</label>
          <input
            type="text"
            id="tenantName"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="demo-client-a"
            pattern="^[a-z0-9]([-a-z0-9]*[a-z0-9])?$"
            title="Lowercase alphanumeric with hyphens only"
            required
          />
          <small>Lowercase alphanumeric with hyphens (e.g., demo-client-a)</small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="cpu">CPU Quota:</label>
            <input
              type="text"
              id="cpu"
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
              placeholder="2"
            />
          </div>

          <div className="form-group">
            <label htmlFor="memory">Memory Quota:</label>
            <input
              type="text"
              id="memory"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="4Gi"
            />
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Tenant'}
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateTenant;
