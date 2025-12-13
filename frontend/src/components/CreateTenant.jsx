import { useState } from 'react';
import { tenantApi } from '../services/api';

const DATABASES = {
  'educationelly': 'Educationelly (MongoDB)',
  'educationelly-graphql': 'Educationelly GraphQL (MongoDB)',
  'mongo': 'Generic MongoDB',
  'postgres': 'PostgreSQL (AWS RDS)',
  'neon': 'Neon DB (PostgreSQL)'
};

const APP_TYPES = {
  'educationelly': 'Educationelly',
  'educationelly-graphql': 'Educationelly GraphQL',
  'code-talk': 'Code Talk',
  'bookmarked': 'Bookmarked',
  'firebook': 'FireBook',
  'intervalai': 'IntervalAI'
};

function CreateTenant({ onSuccess, onCancel }) {
  const [tenantName, setTenantName] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4Gi');
  const [appType, setAppType] = useState('educationelly-graphql');
  const [configureDatabase, setConfigureDatabase] = useState(false);
  const [databaseOption, setDatabaseOption] = useState('educationelly');
  const [customMongoUri, setCustomMongoUri] = useState('');
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
        if (databaseOption === 'custom') {
          if (!customMongoUri) {
            setError('Please enter a custom MongoDB URI');
            setLoading(false);
            return;
          }
          requestBody.database = { mongoUri: customMongoUri };
        } else {
          // Send the selected database key to the backend
          requestBody.database = { databaseKey: databaseOption };
        }
      }

      await tenantApi.createTenant(requestBody);
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
            {Object.entries(APP_TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
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
            <div className="form-group">
              <label htmlFor="databaseOption">Select Database:</label>
              <select
                id="databaseOption"
                value={databaseOption}
                onChange={(e) => setDatabaseOption(e.target.value)}
                className="form-select"
              >
                {Object.entries(DATABASES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
                <option value="custom">Custom MongoDB URI</option>
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
                <p><strong>Selected Configuration:</strong> {DATABASES[databaseOption]}</p>
                <p><small>Credentials will be automatically injected from secure storage.</small></p>
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
