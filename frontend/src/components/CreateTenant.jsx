import { useState } from 'react';
import { tenantApi } from '../services/api';

function CreateTenant({ onSuccess, onCancel }) {
  const [tenantName, setTenantName] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4Gi');
  const [configureDatabase, setConfigureDatabase] = useState(false);
  const [databaseOption, setDatabaseOption] = useState('graphql-test');
  const [customMongoUri, setCustomMongoUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const databaseOptions = {
    'graphql-test': {
      label: 'GraphQL Database (test)',
      uri: import.meta.env.VITE_MONGODB_GRAPHQL_URI || '',
      username: import.meta.env.VITE_MONGODB_GRAPHQL_USERNAME || '',
      password: import.meta.env.VITE_MONGODB_GRAPHQL_PASSWORD || '',
      database: import.meta.env.VITE_MONGODB_GRAPHQL_DATABASE || 'test'
    },
    'rest-educationelly': {
      label: 'REST API Database (educationelly-db)',
      uri: import.meta.env.VITE_MONGODB_REST_URI || '',
      username: import.meta.env.VITE_MONGODB_REST_USERNAME || '',
      password: import.meta.env.VITE_MONGODB_REST_PASSWORD || '',
      database: import.meta.env.VITE_MONGODB_REST_DATABASE || 'educationelly-db'
    },
    'custom': {
      label: 'Custom MongoDB URI',
      uri: null
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const tenantConfig = { cpu, memory };

      // Add database configuration if enabled
      if (configureDatabase) {
        const selectedDb = databaseOptions[databaseOption];
        if (databaseOption === 'custom') {
          if (!customMongoUri) {
            setError('Please enter a custom MongoDB URI');
            setLoading(false);
            return;
          }
          tenantConfig.database = { mongoUri: customMongoUri };
        } else {
          tenantConfig.database = {
            mongoUri: selectedDb.uri,
            username: selectedDb.username,
            password: selectedDb.password,
            databaseName: selectedDb.database
          };
        }
      }

      await tenantApi.createTenant(tenantName, tenantConfig);
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
            <div className="form-group">
              <label htmlFor="databaseOption">Select Database:</label>
              <select
                id="databaseOption"
                value={databaseOption}
                onChange={(e) => setDatabaseOption(e.target.value)}
                className="form-select"
              >
                {Object.entries(databaseOptions).map(([key, option]) => (
                  <option key={key} value={key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {databaseOption === 'custom' && (
              <div className="form-group">
                <label htmlFor="customMongoUri">Custom MongoDB URI:</label>
                <input
                  type="text"
                  id="customMongoUri"
                  value={customMongoUri}
                  onChange={(e) => setCustomMongoUri(e.target.value)}
                  placeholder="mongodb+srv://username:password@cluster.mongodb.net/database"
                  required
                />
                <small>Enter the full MongoDB connection string</small>
              </div>
            )}

            {databaseOption !== 'custom' && (
              <div className="database-info-preview">
                <p><strong>Database:</strong> {databaseOptions[databaseOption].database}</p>
                <p><small>This database will be configured for this tenant's applications</small></p>
              </div>
            )}
          </div>
        )}

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
