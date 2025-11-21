import { StaticDashboard, StaticQuestion } from '@metabase/embedding-sdk-react';
import '../styles/Analytics.css';

function Analytics() {
  // Mock KPI data - would come from your API in production
  const kpis = [
    { label: 'Active Tenants', value: '12', trend: '+3', color: '#4caf50' },
    { label: 'Total Deployments', value: '48', trend: '+8', color: '#2196f3' },
    { label: 'Avg Resource Usage', value: '67%', trend: '-5%', color: '#ff9800' },
    { label: 'Database Instances', value: '12', trend: '0', color: '#9c27b0' },
  ];

  return (
    <div className="analytics-page">
      {/* Header */}
      <div className="analytics-header">
        <h1>Multi-Tenant Analytics</h1>
        <p>Monitor tenant usage, resource allocation, and platform performance</p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpis.map((kpi, index) => (
          <div key={index} className="kpi-card" style={{ borderLeftColor: kpi.color }}>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className={`kpi-trend ${kpi.trend.startsWith('+') ? 'positive' : 'negative'}`}>
              {kpi.trend} from last month
            </div>
          </div>
        ))}
      </div>

      {/* Main Dashboard */}
      <div className="dashboard-section">
        <div className="metabase-card">
          <h2 className="dashboard-title">Multi-Tenant Platform Overview</h2>
          <div className="metabase-embed" style={{ height: '700px' }}>
            <StaticDashboard
              dashboardId={1}
              withTitle
              withDownloads
            />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3 className="chart-title">Tenant Resource Usage</h3>
          <div className="metabase-embed" style={{ height: '400px' }}>
            <StaticQuestion
              questionId={1}
              withTitle
            />
          </div>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">Database Performance</h3>
          <div className="metabase-embed" style={{ height: '400px' }}>
            <StaticQuestion
              questionId={2}
              withTitle
            />
          </div>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">Deployment Distribution</h3>
          <div className="metabase-embed" style={{ height: '400px' }}>
            <StaticQuestion
              questionId={3}
              withTitle
            />
          </div>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">Tenant Growth Over Time</h3>
          <div className="metabase-embed" style={{ height: '400px' }}>
            <StaticQuestion
              questionId={4}
              withTitle
            />
          </div>
        </div>
      </div>

      {/* Configuration Guide */}
      <div className="config-guide">
        <h3>⚙️ Configure Your Analytics Dashboards</h3>
        <div className="guide-content">
          <p>To customize these dashboards with your actual Metabase data:</p>
          <ol>
            <li>
              <strong>Get Dashboard IDs:</strong> Open your dashboard in Metabase and note the ID from the URL
              (e.g., <code>/dashboard/5</code> → ID is <code>5</code>)
            </li>
            <li>
              <strong>Enable Embedding:</strong> In Metabase dashboard settings, enable "Embedding" for each
              dashboard/question
            </li>
            <li>
              <strong>Add Secret Key:</strong> Add your Metabase embedding secret key to
              <code>backend/.env</code> as <code>METABASE_SECRET_KEY</code>
            </li>
            <li>
              <strong>Update IDs:</strong> Edit <code>src/pages/AnalyticsSDK.jsx</code> and replace placeholder
              IDs with your actual dashboard/question IDs
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
