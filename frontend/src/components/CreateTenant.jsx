import { useState } from 'react';
import { tenantApi } from '../services/api';

const APP_TYPES = {
  'educationelly': {
    label: 'Educationelly',
    dbKey: 'educationelly-db',
    dbLabel: 'Educationelly DB (MongoDB Atlas)'
  },
  'educationelly-graphql': {
    label: 'Educationelly GraphQL',
    dbKey: 'educationelly-db',
    dbLabel: 'Educationelly DB (MongoDB Atlas)'
  },
  'code-talk': {
    label: 'Code Talk',
    dbKey: 'postgres-aws',
    dbLabel: 'PostgreSQL (AWS RDS)'
  },
  'bookmarked': {
    label: 'Bookmarked',
    dbKey: 'postgres-neon',
    dbLabel: 'PostgreSQL (Neon DB)'
  },
  'firebook': {
    label: 'FireBook',
    dbKey: 'firebook-db',
    dbLabel: 'Firebase Realtime DB (Configured in App)'
  },
  'intervalai': {
    label: 'IntervalAI',
    dbKey: 'spaced-repetition-db',
    dbLabel: 'Spaced Repetition DB (MongoDB Atlas)'
  }
};

function CreateTenant({ onSuccess, onCancel }) {
  const [tenantName, setTenantName] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4Gi');
  const [appType, setAppType] = useState('educationelly-graphql');
  const [configureDatabase, setConfigureDatabase] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Structure the request body correctly for the backend
      const requestBody = {
        tenantName,
        resourceQuota: {
          cpu,
          memory
        },
        appType
      };

      // Add database configuration if enabled
      if (configureDatabase) {
        // Automatically set the correct database key for the selected app
        const dbKey = APP_TYPES[appType]?.dbKey || 'educationelly-db';
        requestBody.database = { databaseKey: dbKey };
      }

      await tenantApi.createTenant(requestBody);
      onSuccess();
    } catch (err) {
      console.error('Create tenant error:', err);
      if (err.response?.data?.details && Array.isArray(err.response.data.details)) {
        // Format validation errors
        const details = err.response.data.details.map(d => d.message).join(', ');
        setError(`Validation failed: ${details}`);
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to create tenant');
      }
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
            onChange={(e) => setTenantName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="demo-client-a"
            title="Lowercase alphanumeric with hyphens only"
            required
          />
          <small>Lowercase alphanumeric with hyphens (e.g., demo-client-a)</small>
        </div>

        <div className="form-group">
          <label htmlFor="appType">Application Type:</label>
          <select
            id="appType"
            value={appType}
            onChange={(e) => setAppType(e.target.value)}
            className="form-select"
            required
          >
            {Object.entries(APP_TYPES).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
          <small>Select the application type to deploy</small>
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

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={configureDatabase}
              onChange={(e) => setConfigureDatabase(e.target.checked)}
            />
            Configure Database Connection
          </label>
        </div>

        {configureDatabase && (
          <div className="database-config-section">
            <div className="database-info-preview">
              <p><strong>Database:</strong> {APP_TYPES[appType]?.dbLabel}</p>
              <p><small>Credentials will be automatically injected from secure storage.</small></p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message alert alert-danger">
            {error}
          </div>
        )}

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
