import { useState, useEffect } from 'react';
import { deploymentApi } from '../services/api';

const APP_CONFIGS = {
  'educationelly': {
    label: 'educationELLy (REST)',
    serverImage: 'maxjeffwell/educationelly-api:latest',
    clientImage: 'maxjeffwell/educationelly-client:latest',
    serverPort: 8080,
    clientPort: 5000
  },
  'educationelly-graphql': {
    label: 'educationELLy (GraphQL)',
    serverImage: 'maxjeffwell/educationelly-graphql-api:latest',
    clientImage: 'maxjeffwell/educationelly-graphql-client:latest',
    serverPort: 8000,
    clientPort: 3000
  },
  'code-talk': {
    label: 'Code Talk',
    serverImage: 'maxjeffwell/code-talk-api:latest',
    clientImage: 'maxjeffwell/code-talk-client:latest',
    serverPort: 8000,
    clientPort: 3000
  },
  'bookmarked': {
    label: 'Bookmarked',
    serverImage: 'maxjeffwell/bookmarked-api:latest',
    clientImage: 'maxjeffwell/bookmarked-client:latest',
    serverPort: 8000,
    clientPort: 3000
  },
  'firebook': {
    label: 'Firebook',
    serverImage: 'maxjeffwell/firebook-api:latest',
    clientImage: 'maxjeffwell/firebook-client:latest',
    serverPort: 8000,
    clientPort: 3000
  },
  'intervalai': {
    label: 'IntervalAI',
    serverImage: 'maxjeffwell/intervalai-api:latest',
    clientImage: 'maxjeffwell/intervalai-client:latest',
    serverPort: 8000,
    clientPort: 3000
  }
};

function DeploymentControls({ tenantName, onDeploymentCreated }) {
  const [appType, setAppType] = useState('educationelly-graphql');
  const [replicas, setReplicas] = useState(1);
  const [serverImage, setServerImage] = useState(APP_CONFIGS['educationelly-graphql'].serverImage);
  const [clientImage, setClientImage] = useState(APP_CONFIGS['educationelly-graphql'].clientImage);
  const [serverPort, setServerPort] = useState(APP_CONFIGS['educationelly-graphql'].serverPort);
  const [clientPort, setClientPort] = useState(APP_CONFIGS['educationelly-graphql'].clientPort);
  const [envVars, setEnvVars] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);

  const handleAppTypeChange = (type) => {
    setAppType(type);
    const config = APP_CONFIGS[type];
    if (config) {
      setServerImage(config.serverImage);
      setClientImage(config.clientImage);
      setServerPort(config.serverPort);
      setClientPort(config.clientPort);
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
          >
            {Object.entries(APP_CONFIGS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
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