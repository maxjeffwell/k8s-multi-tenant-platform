# Grafana Monitoring - Quick Start Guide

## What's Already Set Up

Your Kubernetes cluster has a complete monitoring stack pre-installed:

✓ **Grafana** - Visualization and dashboards
✓ **Prometheus** - Metrics collection and storage
✓ **AlertManager** - Alert management
✓ **Node Exporter** - Node-level metrics
✓ **Kube State Metrics** - Kubernetes object metrics

## Access Your Monitoring Tools

### Grafana Dashboard
**URL:** http://192.168.50.119:30300
**Username:** `admin`
**Password:** `hmUFxoqh4QlU1uyoXj4MBRwYNRuEswutCkr1Y6sc`

**Direct Dashboard Link:**
http://192.168.50.119:30300/d/bc27880e-cd38-407c-9ac9-124c7b6a2ca2/multi-tenant-platform-overview

### Prometheus Query UI
**URL:** http://192.168.50.119:30090

---

## Step-by-Step: Getting Started

### 1. Access Grafana

Open your browser and go to: http://192.168.50.119:30300

Log in with:
- Username: `admin`
- Password: `hmUFxoqh4QlU1uyoXj4MBRwYNRuEswutCkr1Y6sc`

### 2. View the Multi-Tenant Platform Dashboard

The dashboard has been automatically imported and is ready to use!

**Option A - Direct Link:**
http://192.168.50.119:30300/d/bc27880e-cd38-407c-9ac9-124c7b6a2ca2/multi-tenant-platform-overview

**Option B - Navigate in UI:**
1. Click the **☰** menu (top-left)
2. Go to **Dashboards**
3. Click **Multi-Tenant Platform Overview**

### 3. What You'll See

The dashboard provides real-time monitoring of:

#### Summary Metrics (Top Row)
- **Total Tenants** - Count of active tenant namespaces
- **Total Pods** - All pods across tenant namespaces
- **Running Pods** - Healthy running pods
- **Failed/Pending Pods** - Pods requiring attention

#### Resource Usage (Middle Section)
- **CPU Usage by Tenant** - Real-time CPU consumption per namespace
- **Memory Usage by Tenant** - Memory utilization per namespace
- **Pods per Tenant** - Bar chart showing pod distribution
- **Pod Restarts** - Track container restart counts

#### Network Monitoring (Bottom)
- **Network I/O** - Incoming/outgoing traffic per tenant

### 4. Deploy a Tenant to See Metrics

Metrics will appear once you have deployed applications to tenants.

**Using the Frontend:**
1. Open http://localhost:5175
2. Create a new tenant
3. Deploy the educationelly-graphql application
4. Wait 1-2 minutes for metrics to populate

**Within 2-3 minutes** you'll see:
- Pod metrics appear
- CPU and memory graphs populate
- Network traffic data show up

### 5. Refresh the Dashboard

The dashboard auto-refreshes every 30 seconds. You can also:
- Click the **Refresh** icon (top-right)
- Change the time range using the time picker
- Set a custom refresh interval

---

## Monitoring Individual Tenants

### Create a Tenant-Specific Dashboard

1. In Grafana, click **+** → **Dashboard** → **Add visualization**
2. Select **Prometheus** as the data source
3. Use queries like these (replace `your-tenant-name`):

#### Pod Status
```promql
kube_pod_status_phase{namespace="your-tenant-name"}
```

#### CPU Usage
```promql
sum(rate(container_cpu_usage_seconds_total{namespace="your-tenant-name"}[5m])) by (pod)
```

#### Memory Usage
```promql
sum(container_memory_working_set_bytes{namespace="your-tenant-name"}) by (pod)
```

#### Network Traffic
```promql
# Received
rate(container_network_receive_bytes_total{namespace="your-tenant-name"}[5m])

# Transmitted
rate(container_network_transmit_bytes_total{namespace="your-tenant-name"}[5m])
```

#### Pod Restart Count
```promql
kube_pod_container_status_restarts_total{namespace="your-tenant-name"}
```

---

## Testing Prometheus Queries

Before creating dashboards, test queries in Prometheus:

1. Open http://192.168.50.119:30090
2. Click **Graph** at the top
3. Enter a query in the expression box
4. Click **Execute**

**Example Test Queries:**

```promql
# See all tenant namespaces
kube_namespace_labels{label_app_kubernetes_io_managed_by="multi-tenant-platform"}

# Count all pods
sum(kube_pod_info)

# CPU usage across cluster
sum(rate(container_cpu_usage_seconds_total[5m]))

# Memory usage across cluster
sum(container_memory_working_set_bytes)
```

---

## Setting Up Alerts

### Create an Alert Rule

1. In Grafana, go to **Alerting** → **Alert rules**
2. Click **Create alert rule**
3. Configure the alert:

**Example: Pod Not Running Alert**
- **Query:** `kube_pod_status_phase{namespace="your-tenant-name", phase!="Running"}`
- **Threshold:** Alert when value > 0
- **Duration:** For 5 minutes
- **Action:** Send notification

**Example: High CPU Alert**
- **Query:** `sum(rate(container_cpu_usage_seconds_total{namespace="your-tenant-name"}[5m]))`
- **Threshold:** Alert when value > 0.8 (80% of 1 core)
- **Duration:** For 10 minutes

**Example: High Memory Alert**
- **Query:** `sum(container_memory_working_set_bytes{namespace="your-tenant-name"})`
- **Threshold:** Alert when value > 536870912 (512MB)
- **Duration:** For 5 minutes

### Configure Notification Channels

1. Go to **Alerting** → **Contact points**
2. Click **Add contact point**
3. Choose your notification method:
   - Email
   - Slack
   - PagerDuty
   - Webhook
   - Discord
   - Telegram

---

## Useful Commands

### Re-import Dashboard
```bash
cd /home/maxjeffwell/GitHub_Projects/k8s-multi-tenant-platform/monitoring
./import-dashboard.sh
```

### Check Metrics Availability
```bash
cd /home/maxjeffwell/GitHub_Projects/k8s-multi-tenant-platform/monitoring
./check-metrics.sh
```

### View Grafana Logs
```bash
kubectl logs -n monitoring deployment/prometheus-grafana -f
```

### View Prometheus Logs
```bash
kubectl logs -n monitoring statefulset/prometheus-prometheus-kube-prometheus-prometheus -f
```

### Check Prometheus Targets
```bash
# Port-forward Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Open http://localhost:9090/targets in browser
```

### Get Grafana Admin Password
```bash
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d && echo
```

---

## Troubleshooting

### Dashboard Shows No Data

**Cause:** No tenants with running pods exist yet.

**Solution:**
1. Create a tenant in the platform frontend
2. Deploy an application to the tenant
3. Wait 2-3 minutes for metrics to populate
4. Refresh the dashboard

### Metrics Not Updating

**Check Prometheus is scraping:**
1. Go to http://192.168.50.119:30090/targets
2. Verify all targets show **UP** status
3. Look for targets with your namespace

**Check pod metrics:**
```bash
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/test-school/pods
```

### Can't Access Grafana

**Check service is running:**
```bash
kubectl get pods -n monitoring | grep grafana
```

**Expected output:** Pod should be `Running` with `3/3` ready

**Check service port:**
```bash
kubectl get svc -n monitoring prometheus-grafana
```

**Expected output:** NodePort should be `30300`

### Queries Return No Data

**Common issues:**
1. Namespace doesn't exist or has no pods
2. Query syntax is incorrect
3. Time range is too narrow (try "Last 1 hour")
4. Pods were recently created (wait 2-3 minutes)

---

## Security Best Practices

### Change Default Password

1. Log in to Grafana
2. Click your profile icon (bottom-left)
3. Click **Change password**
4. Enter current password and new password
5. Click **Change password**

### Create Additional Users

1. Go to **Server Admin** → **Users** (gear icon → Users)
2. Click **New user**
3. Fill in details and assign role:
   - **Viewer** - Can only view dashboards
   - **Editor** - Can edit dashboards
   - **Admin** - Full access

### Enable HTTPS (Production)

For production deployments, enable HTTPS:

```bash
# Install cert-manager for TLS certificates
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Configure Ingress with TLS
# See: https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/
```

---

## What's Next?

1. **Explore the dashboard** - Navigate through different time ranges and panels
2. **Create custom dashboards** - Build dashboards for specific tenants
3. **Set up alerts** - Get notified when issues occur
4. **Add integrations** - Connect Slack, email, or other notification channels
5. **Explore Prometheus** - Learn PromQL for advanced queries

## Additional Resources

- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Kubernetes Monitoring Best Practices](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Alert Rule Examples](https://awesome-prometheus-alerts.grep.to/rules)

---

**Need Help?**

Check the full documentation: `monitoring/README.md`
