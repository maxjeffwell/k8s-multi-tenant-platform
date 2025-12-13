#!/bin/bash

# Script to import the Multi-Tenant Platform dashboard into Grafana

GRAFANA_URL="https://grafana.el-jefe.me"
GRAFANA_USER="admin"
GRAFANA_PASSWORD="oucuvo7xsIQh6WJQ1T5gJvtAJZOKi6MtwRXG8fTR"
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
