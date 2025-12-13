import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { tenantApi } from '../services/api';
import metricsService from '../services/metricsService';
import MetricsCharts from '../components/MetricsCharts';
import TopologyViewer from '../components/TopologyViewer';
import '../styles/Analytics.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

function Analytics() {
  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://192.168.50.119:30300';
  const [selectedView, setSelectedView] = useState('platform');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setPlatformMetrics] = useState(null);

  // Dashboard URLs
  const dashboardUrl = `${grafanaUrl}/d/multi-tenant-overview/multi-tenant-platform-overview?orgId=1&refresh=30s&kiosk=tv`;
  const exploreUrl = `${grafanaUrl}/explore?orgId=1&left=%7B%22datasource%22:%22prometheus%22,%22queries%22:%5B%7B%22expr%22:%22%22%7D%5D%7D`;

  const fetchData = useCallback(async () => {
    try {
      // Fetch tenant list and platform metrics in parallel
      const [tenantsResponse, platformMetricsResponse] = await Promise.all([
        tenantApi.listTenants(),
        metricsService.getPlatformMetrics().catch(() => null)
      ]);

      const tenantsData = tenantsResponse.tenants || tenantsResponse.data || tenantsResponse;
      const tenantsWithMetrics = await Promise.all(
        tenantsData.map(async (tenant) => {
          try {
            const metrics = await tenantApi.getTenantMetrics(tenant.name);
            return { ...tenant, metrics: metrics };
          } catch {
            return { ...tenant, metrics: null };
          }
        })
      );

      setTenants(tenantsWithMetrics);
      if (tenantsWithMetrics.length > 0 && !selectedTenant) {
        setSelectedTenant(tenantsWithMetrics[0].name);
      }

      if (platformMetricsResponse?.success) {
        setPlatformMetrics(platformMetricsResponse.data);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setLoading(false);
    }
  }, [selectedTenant]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  // Prepare data for Resource Usage Chart (CPU & Memory)
  const resourceData = {
    labels: tenants.map(t => t.name),
    datasets: [
      {
        label: 'CPU (cores)',
        data: tenants.map(t => parseFloat(t.cpu) || 0),
        backgroundColor: 'rgba(79, 70, 229, 0.6)',
        borderColor: 'rgba(79, 70, 229, 1)',
        borderWidth: 2,
      },
      {
        label: 'Memory (Gi)',
        data: tenants.map(t => {
          const memory = t.memory || '0Gi';
          return parseFloat(memory.replace('Gi', '')) || 0;
        }),
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 2,
      },
    ],
  };

  // Prepare data for Pod Status Distribution
  const podStatusData = () => {
    const statusCounts = { running: 0, pending: 0, failed: 0 };
    tenants.forEach(tenant => {
      if (tenant.metrics?.podsList) {
        tenant.metrics.podsList.forEach(pod => {
          const status = pod.status.toLowerCase();
          if (Object.hasOwn(statusCounts, status)) {
            statusCounts[status]++;
          }
        });
      }
    });

    return {
      labels: ['Running', 'Pending', 'Failed'],
      datasets: [
        {
          label: 'Pod Status',
          data: [statusCounts.running, statusCounts.pending, statusCounts.failed],
          backgroundColor: [
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
          ],
          borderColor: [
            'rgba(16, 185, 129, 1)',
            'rgba(245, 158, 11, 1)',
            'rgba(239, 68, 68, 1)',
          ],
          borderWidth: 2,
        },
      ],
    };
  };

  // Prepare data for Deployments per Tenant
  const deploymentData = {
    labels: tenants.map(t => t.name),
    datasets: [
      {
        label: 'Deployments',
        data: tenants.map(t => t.metrics?.deployments?.length || 0),
        backgroundColor: 'rgba(99, 102, 241, 0.6)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
      },
    },
  };

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h1>Analytics Dashboard</h1>
        <p className="analytics-subtitle">
          Real-time monitoring and metrics for your multi-tenant platform
        </p>
      </div>

      <div className="analytics-controls">
        <button
          className={`view-button ${selectedView === 'platform' ? 'active' : ''}`}
          onClick={() => setSelectedView('platform')}
        >
          Platform Overview
        </button>
        <button
          className={`view-button ${selectedView === 'tenant' ? 'active' : ''}`}
          onClick={() => setSelectedView('tenant')}
          disabled={tenants.length === 0}
        >
          Tenant Metrics
        </button>
        <button
          className={`view-button ${selectedView === 'topology' ? 'active' : ''}`}
          onClick={() => setSelectedView('topology')}
        >
          Service Topology
        </button>
        <button
          className={`view-button ${selectedView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setSelectedView('dashboard')}
        >
          Grafana Dashboard
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

      {/* Tenant selector for tenant metrics view */}
      {selectedView === 'tenant' && tenants.length > 0 && (
        <div className="tenant-selector">
          <label htmlFor="tenant-select">Select Tenant:</label>
          <select
            id="tenant-select"
            value={selectedTenant || ''}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="tenant-select-dropdown"
          >
            {tenants.map(tenant => (
              <option key={tenant.name} value={tenant.name}>
                {tenant.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && (
        <div className="loading">Loading analytics data...</div>
      )}

      {!loading && selectedView === 'platform' && (
        <div className="charts-content">
          {tenants.length === 0 ? (
            <div className="empty-state">
              <h3>No Tenant Data Available</h3>
              <p>Create tenants to see analytics and metrics</p>
            </div>
          ) : (
            <>
              <div className="stats-summary">
                <div className="stat-card">
                  <h3>Total Tenants</h3>
                  <p className="stat-value">{tenants.length}</p>
                </div>
                <div className="stat-card">
                  <h3>Total Pods</h3>
                  <p className="stat-value">
                    {tenants.reduce((sum, t) => sum + (t.metrics?.podsList?.length || 0), 0)}
                  </p>
                </div>
                <div className="stat-card">
                  <h3>Total Deployments</h3>
                  <p className="stat-value">
                    {tenants.reduce((sum, t) => sum + (t.metrics?.deployments?.length || 0), 0)}
                  </p>
                </div>
                <div className="stat-card">
                  <h3>Total CPU Allocated</h3>
                  <p className="stat-value">
                    {tenants.reduce((sum, t) => sum + (parseFloat(t.cpu) || 0), 0).toFixed(1)} cores
                  </p>
                </div>
              </div>

              <div className="charts-grid">
                <div className="chart-card">
                  <h3>Resource Quotas per Tenant</h3>
                  <div className="chart-wrapper">
                    <Bar data={resourceData} options={chartOptions} />
                  </div>
                </div>

                <div className="chart-card">
                  <h3>Pod Status Distribution</h3>
                  <div className="chart-wrapper">
                    <Doughnut data={podStatusData()} options={doughnutOptions} />
                  </div>
                </div>

                <div className="chart-card">
                  <h3>Deployments per Tenant</h3>
                  <div className="chart-wrapper">
                    <Bar data={deploymentData} options={chartOptions} />
                  </div>
                </div>

                <div className="chart-card tenant-details">
                  <h3>Tenant Details</h3>
                  <div className="tenant-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Tenant</th>
                          <th>CPU</th>
                          <th>Memory</th>
                          <th>Pods</th>
                          <th>Deployments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenants.map(tenant => (
                          <tr key={tenant.name}>
                            <td>{tenant.name}</td>
                            <td>{tenant.cpu} cores</td>
                            <td>{tenant.memory}</td>
                            <td>{tenant.metrics?.podsList?.length || 0}</td>
                            <td>{tenant.metrics?.deployments?.length || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!loading && selectedView === 'tenant' && selectedTenant && (
        <MetricsCharts tenantName={selectedTenant} />
      )}

      {selectedView === 'topology' && (
        <TopologyViewer />
      )}

      {!loading && (selectedView === 'dashboard' || selectedView === 'explore') && (
        <div className="analytics-content">
          <div className="grafana-notice">
            <h2>
              {selectedView === 'dashboard' ? 'Multi-Tenant Overview Dashboard' : 'Prometheus Explorer'}
            </h2>
            <p>
              Grafana cannot be embedded for security reasons. Click the button below to open it in a new tab.
            </p>
            <a
              href={selectedView === 'dashboard' ? dashboardUrl : exploreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="open-grafana-btn"
            >
              {selectedView === 'dashboard' ? 'Open Multi-Tenant Dashboard' : 'Open Prometheus Explorer'}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <div className="grafana-preview">
              {selectedView === 'dashboard' ? (
                <>
                  <h3>Dashboard Features:</h3>
                  <ul>
                    <li>Real-time tenant resource usage</li>
                    <li>Pod status and health metrics</li>
                    <li>CPU and memory consumption by namespace</li>
                    <li>Network I/O monitoring</li>
                    <li>Auto-refresh every 30 seconds</li>
                  </ul>
                </>
              ) : (
                <>
                  <h3>Explorer Features:</h3>
                  <ul>
                    <li>Query Prometheus metrics directly</li>
                    <li>Build custom PromQL queries</li>
                    <li>Visualize time-series data</li>
                    <li>Export and share queries</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Analytics;
