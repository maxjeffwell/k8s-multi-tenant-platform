import { useState, useEffect } from 'react';
import { deploymentApi } from '../services/api';

const APP_CONFIGS = {
  'educationelly': {
    label: 'educationELLy (REST)',
    serverImage: 'maxjeffwell/educationelly-api:latest',
    clientImage: 'maxjeffwell/educationelly-client:latest',
    serverPort: 8080,
    clientPort: 5000,
    dbType: 'mongodb'
  },
  'educationelly-graphql': {
    label: 'educationELLy (GraphQL)',
    serverImage: 'maxjeffwell/educationelly-graphql-api:latest',
    clientImage: 'maxjeffwell/educationelly-graphql-client:latest',
    serverPort: 8000,
    clientPort: 3000,
    dbType: 'mongodb'
  },
  'code-talk': {
    label: 'Code Talk',
    serverImage: 'maxjeffwell/code-talk-api:latest',
    clientImage: 'maxjeffwell/code-talk-client:latest',
    serverPort: 8000,
    clientPort: 3000,
    dbType: 'mongodb'
  },
  'bookmarked': {
    label: 'Bookmarked',
    serverImage: 'maxjeffwell/bookmarked-api:latest',
    clientImage: 'maxjeffwell/bookmarked-client:latest',
    serverPort: 8000,
    clientPort: 3000,
    dbType: 'mongodb'
  },
  'firebook': {
    label: 'Firebook',
    serverImage: 'maxjeffwell/firebook-api:latest',
    clientImage: 'maxjeffwell/firebook-client:latest',
    serverPort: 8000,
    clientPort: 3000,
    dbType: 'mongodb'
  },
  'intervalai': {
    label: 'IntervalAI',
    serverImage: 'maxjeffwell/intervalai-api:latest',
    clientImage: 'maxjeffwell/intervalai-client:latest',
    serverPort: 8000,
    clientPort: 3000,
    dbType: 'mongodb'
  }
};

const DATABASES = {
  'educationelly-db': 'Educationelly DB (MongoDB Atlas)',
  'spaced-repetition-db': 'Spaced Repetition DB (MongoDB Atlas)',
  'postgres-aws': 'PostgreSQL (AWS RDS)',
  'postgres-neon': 'PostgreSQL (Neon DB)'
};

const DATABASE_TYPES = {
  'educationelly-db': 'mongodb',
  'spaced-repetition-db': 'mongodb',
  'postgres-aws': 'postgres',
  'postgres-neon': 'postgres'
};

function DeploymentControls({ tenantName, onDeploymentCreated, lockedAppType }) {
  const [appType, setAppType] = useState(lockedAppType || 'educationelly-graphql');
  const [databaseKey, setDatabaseKey] = useState('educationelly-db');
  const [replicas, setReplicas] = useState(1);
  const [serverImage, setServerImage] = useState(APP_CONFIGS[lockedAppType || 'educationelly-graphql'].serverImage);
  const [clientImage, setClientImage] = useState(APP_CONFIGS[lockedAppType || 'educationelly-graphql'].clientImage);
  const [serverPort, setServerPort] = useState(APP_CONFIGS[lockedAppType || 'educationelly-graphql'].serverPort);
  const [clientPort, setClientPort] = useState(APP_CONFIGS[lockedAppType || 'educationelly-graphql'].clientPort);
  const [envVars, setEnvVars] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);

  // Filter databases based on selected app type
  const getCompatibleDatabases = (selectedAppType) => {
    const config = APP_CONFIGS[selectedAppType];
    const requiredType = config ? config.dbType : 'mongodb';
    
    return Object.entries(DATABASES).filter(([key]) => {
      const dbType = DATABASE_TYPES[key];
      return dbType === requiredType;
    });
  };

  // If lockedAppType changes (e.g. data loaded), update state
  useEffect(() => {
    if (lockedAppType && APP_CONFIGS[lockedAppType]) {
      setAppType(lockedAppType);
      const config = APP_CONFIGS[lockedAppType];
      setServerImage(config.serverImage);
      setClientImage(config.clientImage);
      setServerPort(config.serverPort);
      setClientPort(config.clientPort);
      
      // Also reset DB selection if needed
      const compatibleDbs = getCompatibleDatabases(lockedAppType);
      if (compatibleDbs.length > 0) {
        // Check if current DB is compatible, if not pick first compatible
        const currentDbType = DATABASE_TYPES[databaseKey];
        if (currentDbType !== config.dbType) {
          setDatabaseKey(compatibleDbs[0][0]);
        }
      }
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
      
      // Auto-select compatible DB
      const compatibleDbs = getCompatibleDatabases(type);
      if (compatibleDbs.length > 0) {
         setDatabaseKey(compatibleDbs[0][0]);
      }
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
          <label>Select Database:</label>
          <select 
            value={databaseKey} 
            onChange={(e) => setDatabaseKey(e.target.value)}
            className="db-select"
            style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '2px solid #e5e7eb' }}
          >
            {getCompatibleDatabases(appType).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
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