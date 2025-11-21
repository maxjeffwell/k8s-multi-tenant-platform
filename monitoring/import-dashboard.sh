#!/bin/bash

# Script to import the Multi-Tenant Platform dashboard into Grafana

GRAFANA_URL="http://192.168.50.119:30300"
GRAFANA_USER="admin"
GRAFANA_PASSWORD="hmUFxoqh4QlU1uyoXj4MBRwYNRuEswutCkr1Y6sc"
DASHBOARD_FILE="dashboards/multi-tenant-overview.json"

echo "Importing Multi-Tenant Platform dashboard to Grafana..."

# Read the dashboard JSON and wrap it in the required API format
DASHBOARD_JSON=$(cat "$DASHBOARD_FILE")

# Create the API payload
API_PAYLOAD=$(cat <<EOF
{
  "dashboard": $(echo "$DASHBOARD_JSON" | jq '.dashboard'),
  "overwrite": true,
  "message": "Imported Multi-Tenant Platform Overview dashboard"
}
EOF
)

# Import the dashboard
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$API_PAYLOAD" \
  -u "$GRAFANA_USER:$GRAFANA_PASSWORD" \
  "$GRAFANA_URL/api/dashboards/db")

# Check if successful
if echo "$RESPONSE" | jq -e '.status == "success"' > /dev/null 2>&1; then
  DASHBOARD_URL=$(echo "$RESPONSE" | jq -r '.url')
  echo "✓ Dashboard imported successfully!"
  echo "✓ Dashboard URL: $GRAFANA_URL$DASHBOARD_URL"
  echo ""
  echo "You can now access the dashboard at:"
  echo "$GRAFANA_URL$DASHBOARD_URL"
else
  echo "✗ Failed to import dashboard"
  echo "Response: $RESPONSE"
  exit 1
fi
