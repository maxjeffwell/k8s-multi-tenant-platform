import { useState } from 'react';
import { deploymentApi } from '../services/api';

function DeploymentControls({ tenantName, onDeploymentCreated }) {
  const [appType, setAppType] = useState('graphql');
  const [replicas, setReplicas] = useState(1);
  const [serverImage, setServerImage] = useState('maxjeffwell/educationelly-graphql-server:latest');
  const [clientImage, setClientImage] = useState('maxjeffwell/educationelly-graphql-client:latest');
  const [serverPort, setServerPort] = useState(4000);
  const [clientPort, setClientPort] = useState(3000);
  const [envVars, setEnvVars] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);

  const handleAppTypeChange = (type) => {
    setAppType(type);
    if (type === 'graphql') {
      setServerImage('maxjeffwell/educationelly-graphql-server:latest');
      setClientImage('maxjeffwell/educationelly-graphql-client:latest');
      setServerPort(4000);
      setClientPort(3000);
      setEnvVars('');
    } else {
      setServerImage('maxjeffwell/educationelly-server:latest');
      setClientImage('maxjeffwell/educationelly-client:latest');
      setServerPort(8080);
      setClientPort(3000);
      setEnvVars('');
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
      <h4>Deploy educationELLy Application (Server + Client)</h4>
      <form onSubmit={handleDeploy}>
        <div className="form-group">
          <label>Application Type:</label>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                value="graphql"
                checked={appType === 'graphql'}
                onChange={(e) => handleAppTypeChange(e.target.value)}
              />
              GraphQL Version (Apollo Server + React)
            </label>
            <label className="radio-label">
              <input
                type="radio"
                value="rest"
                checked={appType === 'rest'}
                onChange={(e) => handleAppTypeChange(e.target.value)}
              />
              REST API Version (Express + React)
            </label>
          </div>
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
              placeholder="maxjeffwell/educationelly-graphql-server:latest"
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
              placeholder="4000"
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
              placeholder="maxjeffwell/educationelly-graphql-client:latest"
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
          <small>Format: KEY=value (one per line). API endpoint is auto-configured.</small>
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
