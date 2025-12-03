import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import metricsService from '../services/metricsService';
import '../styles/MetricsCharts.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function MetricsCharts({ tenantName }) {
  const [metrics, setMetrics] = useState(null);
  const [timeSeries, setTimeSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch metrics data
  const fetchMetrics = async () => {
    try {
      setError(null);
      const [metricsData, timeSeriesData] = await Promise.all([
        metricsService.getTenantMetrics(tenantName),
        metricsService.getTenantTimeSeries(tenantName, 3600) // 1 hour
      ]);

      setMetrics(metricsData.data);
      setTimeSeries(timeSeriesData.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError('Failed to load metrics. Please try again.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();

    // Auto-refresh every 30 seconds
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchMetrics, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [tenantName, autoRefresh]);

  if (loading) {
    return (
      <div className="metrics-loading">
        <div className="spinner"></div>
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="metrics-error">
        <p>{error}</p>
        <button onClick={fetchMetrics} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) {
    return <div className="metrics-error">No metrics available</div>;
  }

  // Prepare CPU time-series chart data
  const cpuChartData = timeSeries?.cpu?.result
    ? {
        labels: timeSeries.cpu.result[0]?.values.map(v =>
          new Date(v[0] * 1000).toLocaleTimeString()
        ) || [],
        datasets: timeSeries.cpu.result.map((series, index) => ({
          label: series.metric.pod || `Pod ${index + 1}`,
          data: series.values.map(v => parseFloat(v[1])),
          borderColor: `hsl(${index * 60}, 70%, 50%)`,
          backgroundColor: `hsla(${index * 60}, 70%, 50%, 0.1)`,
          fill: true,
          tension: 0.4
        }))
      }
    : null;

  // Prepare memory time-series chart data
  const memoryChartData = timeSeries?.memory?.result
    ? {
        labels: timeSeries.memory.result[0]?.values.map(v =>
          new Date(v[0] * 1000).toLocaleTimeString()
        ) || [],
        datasets: timeSeries.memory.result.map((series, index) => ({
          label: series.metric.pod || `Pod ${index + 1}`,
          data: series.values.map(v => parseFloat(v[1]) / (1024 * 1024)), // Convert to MB
          borderColor: `hsl(${index * 60 + 180}, 70%, 50%)`,
          backgroundColor: `hsla(${index * 60 + 180}, 70%, 50%, 0.1)`,
          fill: true,
          tension: 0.4
        }))
      }
    : null;

  // Prepare pod status doughnut chart
  const podStatusData = metrics.podStatus?.result
    ? (() => {
        const statusCounts = {};
        metrics.podStatus.result.forEach(item => {
          const phase = item.metric.phase;
          const count = parseInt(item.value[1]);
          statusCounts[phase] = (statusCounts[phase] || 0) + count;
        });

        return {
          labels: Object.keys(statusCounts),
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: [
              '#10b981', // Running - green
              '#f59e0b', // Pending - orange
              '#ef4444', // Failed - red
              '#6b7280', // Unknown - gray
              '#8b5cf6'  // Other - purple
            ],
            borderWidth: 2,
            borderColor: '#1f2937'
          }]
        };
      })()
    : null;

  // Prepare network I/O bar chart
  const networkData = metrics.networkIO
    ? (() => {
        const receivePods = metrics.networkIO.receive?.result || [];
        const transmitPods = metrics.networkIO.transmit?.result || [];

        const podNames = [
          ...new Set([
            ...receivePods.map(p => p.metric.pod),
            ...transmitPods.map(p => p.metric.pod)
          ])
        ];

        return {
          labels: podNames,
          datasets: [
            {
              label: 'Receive (KB/s)',
              data: podNames.map(pod => {
                const item = receivePods.find(p => p.metric.pod === pod);
                return item ? parseFloat(item.value[1]) / 1024 : 0;
              }),
              backgroundColor: '#3b82f6'
            },
            {
              label: 'Transmit (KB/s)',
              data: podNames.map(pod => {
                const item = transmitPods.find(p => p.metric.pod === pod);
                return item ? parseFloat(item.value[1]) / 1024 : 0;
              }),
              backgroundColor: '#8b5cf6'
            }
          ]
        };
      })()
    : null;

  // Chart options
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#e5e7eb' }
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      x: {
        ticks: { color: '#9ca3af', maxTicksLimit: 10 },
        grid: { color: '#374151' }
      },
      y: {
        ticks: { color: '#9ca3af' },
        grid: { color: '#374151' }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  const memoryChartOptions = {
    ...lineChartOptions,
    scales: {
      ...lineChartOptions.scales,
      y: {
        ...lineChartOptions.scales.y,
        title: {
          display: true,
          text: 'Memory (MB)',
          color: '#9ca3af'
        }
      }
    }
  };

  const cpuChartOptions = {
    ...lineChartOptions,
    scales: {
      ...lineChartOptions.scales,
      y: {
        ...lineChartOptions.scales.y,
        title: {
          display: true,
          text: 'CPU Cores',
          color: '#9ca3af'
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#e5e7eb' }
      }
    }
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#e5e7eb' }
      }
    },
    scales: {
      x: {
        ticks: { color: '#9ca3af' },
        grid: { color: '#374151' }
      },
      y: {
        ticks: { color: '#9ca3af' },
        grid: { color: '#374151' },
        title: {
          display: true,
          text: 'KB/s',
          color: '#9ca3af'
        }
      }
    }
  };

  return (
    <div className="metrics-charts">
      <div className="metrics-header">
        <h2>Metrics for {tenantName}</h2>
        <div className="metrics-controls">
          <button
            className={`refresh-toggle ${autoRefresh ? 'active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '⏸️ Pause' : '▶️ Resume'} Auto-Refresh
          </button>
          <button onClick={fetchMetrics} className="refresh-button">
            🔄 Refresh Now
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="metrics-summary">
        <div className="metric-card">
          <h3>CPU Usage</h3>
          <p className="metric-value">
            {metrics.quotaUsage?.cpu?.usage
              ? metricsService.formatCPU(metrics.quotaUsage.cpu.usage)
              : 'N/A'}
          </p>
          {metrics.quotaUsage?.cpu?.percentage && (
            <p className="metric-subtitle">
              {metrics.quotaUsage.cpu.percentage}% of quota
            </p>
          )}
        </div>

        <div className="metric-card">
          <h3>Memory Usage</h3>
          <p className="metric-value">
            {metrics.quotaUsage?.memory?.usage
              ? metricsService.formatBytes(metrics.quotaUsage.memory.usage)
              : 'N/A'}
          </p>
          {metrics.quotaUsage?.memory?.percentage && (
            <p className="metric-subtitle">
              {metrics.quotaUsage.memory.percentage}% of quota
            </p>
          )}
        </div>

        <div className="metric-card">
          <h3>Pod Restarts</h3>
          <p className="metric-value">
            {metrics.restarts?.result?.reduce((sum, item) =>
              sum + parseInt(item.value[1]), 0
            ) || 0}
          </p>
          <p className="metric-subtitle">Total restarts</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* CPU Time Series */}
        {cpuChartData && (
          <div className="chart-container">
            <h3>CPU Usage Over Time</h3>
            <div className="chart-wrapper">
              <Line data={cpuChartData} options={cpuChartOptions} />
            </div>
          </div>
        )}

        {/* Memory Time Series */}
        {memoryChartData && (
          <div className="chart-container">
            <h3>Memory Usage Over Time</h3>
            <div className="chart-wrapper">
              <Line data={memoryChartData} options={memoryChartOptions} />
            </div>
          </div>
        )}

        {/* Pod Status */}
        {podStatusData && (
          <div className="chart-container small">
            <h3>Pod Status</h3>
            <div className="chart-wrapper">
              <Doughnut data={podStatusData} options={doughnutOptions} />
            </div>
          </div>
        )}

        {/* Network I/O */}
        {networkData && (
          <div className="chart-container small">
            <h3>Network I/O by Pod</h3>
            <div className="chart-wrapper">
              <Bar data={networkData} options={barChartOptions} />
            </div>
          </div>
        )}
      </div>

      <div className="metrics-footer">
        <p>
          Last updated: {new Date(metrics.timestamp).toLocaleTimeString()} •
          Auto-refreshing every 30 seconds
        </p>
      </div>
    </div>
  );
}

export default MetricsCharts;
