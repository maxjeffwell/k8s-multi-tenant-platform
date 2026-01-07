import { useState, useEffect } from 'react';
import { deploymentApi } from '../services/api';

const APP_CONFIGS = {
  'educationelly': {
    label: 'educationELLy (REST)',
    serverImage: 'maxjeffwell/educationelly-server:latest',
    clientImage: 'maxjeffwell/educationelly-client:latest',
    serverPort: 8080,
    clientPort: 3000,
    dbKey: 'mongodb-educationelly',
    dbLabel: 'MongoDB Educationelly (Local)'
  },
  'educationelly-graphql': {
    label: 'educationELLy (GraphQL)',
    serverImage: 'maxjeffwell/educationelly-graphql-server:latest',
    clientImage: 'maxjeffwell/educationelly-graphql-client:latest',
    serverPort: 8000,
    clientPort: 80,
    dbKey: 'mongodb-educationelly-graphql',
    dbLabel: 'MongoDB Educationelly GraphQL (Local)'
  },
  'code-talk': {
    label: 'Code Talk',
    serverImage: 'maxjeffwell/code-talk-graphql-server:latest',
    clientImage: 'maxjeffwell/code-talk-graphql-client:latest',
    serverPort: 8000,
    clientPort: 5000,
    dbKey: 'postgres-codetalk',
    dbLabel: 'PostgreSQL + Redis (Local)'
  },
  'bookmarked': {
    label: 'Bookmarked',
    serverImage: 'maxjeffwell/bookmarks-react-hooks-server:latest',
    clientImage: 'maxjeffwell/bookmarks-react-hooks-client:latest',
    serverPort: 3001,
    clientPort: 80,
    dbKey: 'postgres-neon',
    dbLabel: 'PostgreSQL (Neon DB)'
  },
  'firebook': {
    label: 'Firebook',
    serverImage: null,
    clientImage: 'maxjeffwell/firebook:latest',
    serverPort: null,
    clientPort: 80,
    dbKey: 'firebook-db',
    dbLabel: 'Firebase Realtime DB (Configured in App)'
  },
  'intervalai': {
    label: 'IntervalAI',
    serverImage: 'maxjeffwell/spaced-repetition-capstone-server:latest',
    clientImage: 'maxjeffwell/spaced-repetition-capstone-client:latest',
    serverPort: 8080,
    clientPort: 80,
    dbKey: 'mongodb-intervalai',
    dbLabel: 'MongoDB IntervalAI (Local)'
  }
};

function DeploymentControls({ tenantName, onDeploymentCreated, lockedAppType }) {
  const [appType, setAppType] = useState(lockedAppType || 'educationelly-graphql');
  // Initialize dbKey based on initial appType
  const initialConfig = APP_CONFIGS[lockedAppType || 'educationelly-graphql'];
  const [databaseKey, setDatabaseKey] = useState(initialConfig ? initialConfig.dbKey : 'mongodb-educationelly-graphql');
  
  const [replicas, setReplicas] = useState(1);
  const [serverImage, setServerImage] = useState(initialConfig ? initialConfig.serverImage : '');
  const [clientImage, setClientImage] = useState(initialConfig ? initialConfig.clientImage : '');
  const [serverPort, setServerPort] = useState(initialConfig ? initialConfig.serverPort : 8000);
  const [clientPort, setClientPort] = useState(initialConfig ? initialConfig.clientPort : 3000);
  const [envVars, setEnvVars] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);

  // If lockedAppType changes (e.g. data loaded), update state
  useEffect(() => {
    if (lockedAppType && APP_CONFIGS[lockedAppType]) {
      const config = APP_CONFIGS[lockedAppType];
      setAppType(lockedAppType);
      setServerImage(config.serverImage);
      setClientImage(config.clientImage);
      setServerPort(config.serverPort);
      setClientPort(config.clientPort);
      setDatabaseKey(config.dbKey);
    }
  }, [lockedAppType]);

  const handleAppTypeChange = (type) => {
    setAppType(type);
    const config = APP_CONFIGS[type];
    if (config) {
      setServerImage(config.serverImage);
      setClientImage(config.clientImage);
      setServerPort(config.serverPort);
      setClientPort(config.clientPort);
      setDatabaseKey(config.dbKey);
    }
  };

  const handleDeploy = async (e) => {
    e.preventDefault();
    setDeploying(true);
    setError(null);

    try {
      // Parse environment variables
      const env = envVars
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [name, value] = line.split('=');
          return { name: name.trim(), value: value.trim() };
        });

      await deploymentApi.deployApp(tenantName, {
        appType,
        databaseKey,
        replicas: parseInt(replicas),
        serverImage,
        clientImage,
        serverPort: parseInt(serverPort),
        clientPort: parseInt(clientPort),
        env,
      });

      onDeploymentCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deploy application');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="deployment-controls">
      <h4>Deploy Application</h4>
      <form onSubmit={handleDeploy}>
        <div className="form-group">
          <label>Select Application:</label>
          <select 
            value={appType} 
            onChange={(e) => handleAppTypeChange(e.target.value)}
            className="app-select"
            style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '2px solid #e5e7eb' }}
            disabled={!!lockedAppType}
            title={lockedAppType ? "App type is locked for this tenant" : "Select application to deploy"}
          >
            {Object.entries(APP_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
          {lockedAppType && <small style={{ color: '#666' }}>App type locked to tenant configuration</small>}
        </div>

        <div className="form-group">
          <label>Database Connection:</label>
          <div className="read-only-field" style={{ padding: '0.75rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#374151' }}>
            {APP_CONFIGS[appType]?.dbLabel || 'Default Database'}
          </div>
          <small style={{ color: '#666' }}>Automatically configured based on application type</small>
        </div>

        <div className="form-group">
          <label htmlFor="replicas">Replicas (per service):</label>
          <input
            type="number"
            id="replicas"
            value={replicas}
            onChange={(e) => setReplicas(e.target.value)}
            min="1"
            max="10"
            required
          />
          <small>Number of pods for both server and client</small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="serverImage">Server Image:</label>
            <input
              type="text"
              id="serverImage"
              value={serverImage}
              onChange={(e) => setServerImage(e.target.value)}
              placeholder="image:tag"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="serverPort">Server Port:</label>
            <input
              type="number"
              id="serverPort"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              placeholder="8000"
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="clientImage">Client Image:</label>
            <input
              type="text"
              id="clientImage"
              value={clientImage}
              onChange={(e) => setClientImage(e.target.value)}
              placeholder="image:tag"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="clientPort">Client Port:</label>
            <input
              type="number"
              id="clientPort"
              value={clientPort}
              onChange={(e) => setClientPort(e.target.value)}
              placeholder="3000"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="envVars">Environment Variables (optional):</label>
          <textarea
            id="envVars"
            value={envVars}
            onChange={(e) => setEnvVars(e.target.value)}
            placeholder="NODE_ENV=production&#10;LOG_LEVEL=info"
            rows="4"
          />
          <small>Format: KEY=value (one per line).</small>
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" className="btn-primary" disabled={deploying}>
          {deploying ? 'Deploying...' : 'Deploy Application'}
        </button>
      </form>
    </div>
  );
}

export default DeploymentControls;