#!/bin/bash

# Script to check available metrics for tenants in Prometheus

PROMETHEUS_URL="http://192.168.50.119:30090"

echo "Checking available tenant metrics in Prometheus..."
echo "=================================================="
echo ""

# Get all tenant namespaces
echo "1. Available Tenant Namespaces:"
echo "--------------------------------"
TENANT_NAMESPACES=$(kubectl get namespaces -l app.kubernetes.io/managed-by=multi-tenant-platform -o jsonpath='{.items[*].metadata.name}')

if [ -z "$TENANT_NAMESPACES" ]; then
  echo "No tenant namespaces found."
else
  for ns in $TENANT_NAMESPACES; do
    echo "  - $ns"
  done
fi
echo ""

# Query Prometheus for tenant metrics
echo "2. Checking Prometheus Metrics:"
echo "--------------------------------"

# Check if Prometheus has data for tenants
if [ -n "$TENANT_NAMESPACES" ]; then
  FIRST_NS=$(echo $TENANT_NAMESPACES | awk '{print $1}')

  echo "  Checking metrics for namespace: $FIRST_NS"
  echo ""

  # Pod count
  POD_COUNT=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=count(kube_pod_info{namespace=\"$FIRST_NS\"})" | jq -r '.data.result[0].value[1]' 2>/dev/null)
  if [ -n "$POD_COUNT" ] && [ "$POD_COUNT" != "null" ]; then
    echo "  ✓ Pod metrics available (Current pods: $POD_COUNT)"
  else
    echo "  ✗ No pod metrics found"
  fi

  # CPU metrics
  CPU_CHECK=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=rate(container_cpu_usage_seconds_total{namespace=\"$FIRST_NS\"}[5m])" | jq -r '.data.result | length' 2>/dev/null)
  if [ -n "$CPU_CHECK" ] && [ "$CPU_CHECK" != "null" ] && [ "$CPU_CHECK" -gt 0 ]; then
    echo "  ✓ CPU metrics available"
  else
    echo "  ✗ No CPU metrics found (might take a few minutes after pod creation)"
  fi

  # Memory metrics
  MEM_CHECK=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=container_memory_working_set_bytes{namespace=\"$FIRST_NS\"}" | jq -r '.data.result | length' 2>/dev/null)
  if [ -n "$MEM_CHECK" ] && [ "$MEM_CHECK" != "null" ] && [ "$MEM_CHECK" -gt 0 ]; then
    echo "  ✓ Memory metrics available"
  else
    echo "  ✗ No memory metrics found"
  fi
fi

echo ""
echo "3. Prometheus Health:"
echo "---------------------"
PROM_HEALTH=$(curl -s "$PROMETHEUS_URL/-/healthy")
if [[ "$PROM_HEALTH" == *"Healthy"* ]]; then
  echo "  ✓ Prometheus is healthy"
else
  echo "  ✗ Prometheus might be unhealthy"
fi

echo ""
echo "4. Grafana Access:"
echo "------------------"
echo "  URL: http://192.168.50.119:30300"
echo "  Username: admin"
echo "  Password: hmUFxoqh4QlU1uyoXj4MBRwYNRuEswutCkr1Y6sc"
echo ""
echo "  Dashboard: http://192.168.50.119:30300/d/bc27880e-cd38-407c-9ac9-124c7b6a2ca2/multi-tenant-platform-overview"
echo ""

echo "5. Quick Test Queries:"
echo "----------------------"
echo "  You can test these queries in Prometheus ($PROMETHEUS_URL):"
echo ""
echo "  Total tenants:"
echo "    count(kube_namespace_labels{label_app_kubernetes_io_managed_by=\"multi-tenant-platform\"})"
echo ""
echo "  Pods per namespace:"
echo "    sum(kube_pod_info{namespace!~\"kube-.*|monitoring|default\"}) by (namespace)"
echo ""
echo "  CPU usage by namespace:"
echo "    sum(rate(container_cpu_usage_seconds_total{namespace!~\"kube-.*|monitoring|default\"}[5m])) by (namespace)"
echo ""

echo "Done!"
