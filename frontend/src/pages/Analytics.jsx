import { useState } from 'react';
import '../styles/Analytics.css';

function Analytics() {
  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://192.168.50.119:30300';
  const [selectedView, setSelectedView] = useState('dashboard');

  // Dashboard URLs
  const dashboardUrl = `${grafanaUrl}/d/multi-tenant-overview/multi-tenant-platform-overview?orgId=1&refresh=30s&kiosk=tv`;
  const exploreUrl = `${grafanaUrl}/explore?orgId=1&left=%7B%22datasource%22:%22prometheus%22,%22queries%22:%5B%7B%22expr%22:%22%22%7D%5D%7D`;

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h1>Analytics Dashboard</h1>
        <p className="analytics-subtitle">
          Monitoring your multi-tenant platform with Grafana and Prometheus
        </p>
      </div>

      <div className="analytics-controls">
        <button
          className={`view-button ${selectedView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setSelectedView('dashboard')}
        >
          Multi-Tenant Overview
        </button>
        <button
          className={`view-button ${selectedView === 'explore' ? 'active' : ''}`}
          onClick={() => setSelectedView('explore')}
        >
          Prometheus Explorer
        </button>
        <a
          href={grafanaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="view-button external-link"
        >
          Open Grafana
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      <div className="analytics-content">
        {selectedView === 'dashboard' ? (
          <iframe
            src={dashboardUrl}
            className="grafana-iframe"
            title="Grafana Multi-Tenant Dashboard"
            frameBorder="0"
          />
        ) : (
          <iframe
            src={exploreUrl}
            className="grafana-iframe"
            title="Prometheus Explorer"
            frameBorder="0"
          />
        )}
      </div>

      <div className="analytics-info">
        <div className="info-card">
          <h3>About This Dashboard</h3>
          <p>
            This analytics page embeds your Grafana dashboards for real-time monitoring of your
            Kubernetes multi-tenant platform. The data is collected by Prometheus and visualized
            through Grafana.
          </p>
        </div>
        <div className="info-card">
          <h3>Key Metrics</h3>
          <ul>
            <li>Total tenants and pods across the platform</li>
            <li>CPU and memory usage by tenant</li>
            <li>Network I/O monitoring</li>
            <li>Pod restart tracking and health status</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
