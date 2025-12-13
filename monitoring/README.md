# Grafana Monitoring Setup

Your Kubernetes cluster already has Grafana and Prometheus installed in the `monitoring` namespace.

## Access Grafana

**URL:** https://grafana.el-jefe.me

**Login Credentials:**
- Username: `admin`
- Password: `oucuvo7xsIQh6WJQ1T5gJvtAJZOKi6MtwRXG8fTR`

## Quick Start

1. Open Grafana in your browser: https://grafana.el-jefe.me
2. Log in with the credentials above
3. Import the Multi-Tenant Platform dashboard (see below)

## Import the Multi-Tenant Dashboard

### Option 1: Via Grafana UI

1. Log in to Grafana
2. Click the **+** icon in the left sidebar
3. Select **Import**
4. Click **Upload JSON file**
5. Select `monitoring/dashboards/multi-tenant-overview.json`
6. Select **Prometheus** as the data source
7. Click **Import**

### Option 2: Via API

```bash
# Get Grafana pod name
GRAFANA_POD=$(kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}')

# Copy dashboard to pod
kubectl cp monitoring/dashboards/multi-tenant-overview.json monitoring/$GRAFANA_POD:/tmp/dashboard.json

# Import via API (from inside the pod)
kubectl exec -n monitoring $GRAFANA_POD -- curl -X POST \
  -H "Content-Type: application/json" \
  -d @/tmp/dashboard.json \
  http://admin:hmUFxoqh4QlU1uyoXj4MBRwYNRuEswutCkr1Y6sc@localhost:3000/api/dashboards/db
```

## Dashboard Features

The Multi-Tenant Platform Overview dashboard includes:

### Summary Statistics
- **Total Tenants**: Count of all tenant namespaces
- **Total Pods**: All pods across tenant namespaces
- **Running Pods**: Currently running pods
- **Failed/Pending Pods**: Pods that need attention

### Resource Monitoring
- **CPU Usage by Tenant**: Real-time CPU consumption per namespace
- **Memory Usage by Tenant**: Memory utilization per namespace
- **Pods per Tenant**: Bar chart showing pod distribution
- **Pod Restarts**: Track stability issues by namespace

### Network Monitoring
- **Network I/O**: Incoming/outgoing traffic per tenant

### Auto-Refresh
The dashboard refreshes every 30 seconds by default.

## Available Data Sources

Your Prometheus instance is already configured and collecting metrics from:
- **Kubernetes Metrics**: Pod, node, and container metrics
- **cAdvisor**: Container resource usage
- **Node Exporter**: Node-level metrics
- **Kube State Metrics**: Kubernetes object state

## Creating Custom Dashboards

To create additional dashboards for specific tenants:

1. In Grafana, click **+** → **Dashboard**
2. Add panels with queries like:
   ```promql
   # CPU usage for specific tenant
   sum(rate(container_cpu_usage_seconds_total{namespace="tenant-name"}[5m])) by (pod)

   # Memory usage for specific tenant
   sum(container_memory_working_set_bytes{namespace="tenant-name"}) by (pod)

   # Pod status
   kube_pod_status_phase{namespace="tenant-name"}
   ```

## Useful Prometheus Queries

### Tenant-Specific Queries

```promql
# Total pods in a namespace
count(kube_pod_info{namespace="your-tenant-name"})

# Running pods in a namespace
sum(kube_pod_status_phase{namespace="your-tenant-name", phase="Running"})

# CPU usage for educationelly-graphql-server
rate(container_cpu_usage_seconds_total{namespace="your-tenant-name", pod=~"educationelly-graphql-server.*"}[5m])

# Memory usage for educationelly-graphql-server
container_memory_working_set_bytes{namespace="your-tenant-name", pod=~"educationelly-graphql-server.*"}

# Database connection pods
kube_pod_status_phase{namespace="your-tenant-name", pod=~".*mongodb.*"}

# Pod restart count
kube_pod_container_status_restarts_total{namespace="your-tenant-name"}
```

### Platform-Wide Queries

```promql
# All tenant namespaces
kube_namespace_labels{label_app_kubernetes_io_managed_by="multi-tenant-platform"}

# Total resource usage across all tenants
sum(rate(container_cpu_usage_seconds_total{namespace!~"kube-.*|monitoring|default"}[5m]))

# Memory usage across all tenants
sum(container_memory_working_set_bytes{namespace!~"kube-.*|monitoring|default"})
```

## Alerting

To set up alerts for your tenants:

1. Go to **Alerting** → **Alert rules**
2. Create new alert rules like:
   - Pod is not running for > 5 minutes
   - CPU usage > 80% for > 10 minutes
   - Memory usage > 90% for > 5 minutes
   - Pod restart count > 5

## Troubleshooting

### Check Prometheus is collecting metrics

```bash
# Port-forward Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Open http://localhost:9090 and query metrics
```

### Check Grafana logs

```bash
kubectl logs -n monitoring deployment/prometheus-grafana -f
```

### Check Prometheus targets

1. Access Prometheus UI: https://prometheus.el-jefe.me
2. Go to **Status** → **Targets**
3. Verify all targets are **UP**

## Security Notes

- The admin password is stored in a Kubernetes secret
- Change the default password after initial login:
  - Click profile icon → **Preferences** → **Change Password**
- Consider setting up RBAC for team members
- Enable HTTPS in production environments

## Next Steps

1. Import the dashboard
2. Customize panels based on your needs
3. Set up alerting rules
4. Create tenant-specific dashboards
5. Configure notification channels (email, Slack, etc.)

## Additional Resources

- [Grafana Documentation](https://grafana.com/docs/)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
- [Kubernetes Monitoring Guide](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
