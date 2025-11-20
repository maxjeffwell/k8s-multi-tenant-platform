import { useState } from 'react';
import { deploymentApi } from '../services/api';

function DeploymentControls({ tenantName, onDeploymentCreated }) {
  const [replicas, setReplicas] = useState(1);
  const [serverImage, setServerImage] = useState('maxjeffwell/educationelly-graphql-server:latest');
  const [clientImage, setClientImage] = useState('maxjeffwell/educationelly-graphql-client:latest');
  const [serverPort, setServerPort] = useState(4000);
  const [clientPort, setClientPort] = useState(3000);
  const [envVars, setEnvVars] = useState('GRAPHQL_ENDPOINT=http://educationelly-graphql-server:4000/graphql');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);

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
      <h4>Deploy educationelly-graphql (Server + Client)</h4>
      <form onSubmit={handleDeploy}>
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
          <label htmlFor="envVars">Environment Variables (applied to both):</label>
          <textarea
            id="envVars"
            value={envVars}
            onChange={(e) => setEnvVars(e.target.value)}
            placeholder="GRAPHQL_ENDPOINT=http://educationelly-graphql-server:4000/graphql&#10;NODE_ENV=production"
            rows="4"
          />
          <small>Format: KEY=value (one per line)</small>
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
