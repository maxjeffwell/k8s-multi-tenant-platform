#!/bin/bash
set -e

echo "TenantFlow Deployment Script"
echo "============================="
echo ""

# Check if running on VPS
if [ ! -f /etc/rancher/k3s/k3s.yaml ]; then
    echo "Error: This script must be run on the VPS with K3s installed"
    exit 1
fi

echo "Step 1: Applying database secrets..."
kubectl apply -f k8s-db-secrets.yaml

echo ""
echo "Step 2: Checking if backend image tar file exists..."
if [ -f "/tmp/tenantflow-backend.tar" ]; then
    echo "Importing backend image to K3s..."
    sudo k3s ctr images import /tmp/tenantflow-backend.tar
    echo "Backend image imported successfully"
else
    echo "Warning: /tmp/tenantflow-backend.tar not found. Skipping image import."
    echo "Please transfer the image file to /tmp/ and run:"
    echo "  sudo k3s ctr images import /tmp/tenantflow-backend.tar"
fi

echo ""
echo "Step 3: Applying deployment manifests..."
kubectl apply -f k8s-deployment.yaml

echo ""
echo "Step 4: Waiting for deployments to be ready..."
kubectl rollout status deployment/tenantflow-backend -n default --timeout=300s
kubectl rollout status deployment/tenantflow-frontend -n default --timeout=300s

echo ""
echo "Step 5: Checking deployment status..."
kubectl get pods -n default -l app=tenantflow
kubectl get svc -n default -l app=tenantflow
kubectl get ingress -n default -l app=tenantflow

echo ""
echo "============================="
echo "Deployment completed successfully!"
echo ""
echo "Access TenantFlow at: https://tenantflow.el-jefe.me"
echo ""
echo "To check logs:"
echo "  kubectl logs -f deployment/tenantflow-backend -n default"
echo "  kubectl logs -f deployment/tenantflow-frontend -n default"
echo ""
echo "To verify database options API:"
echo "  curl https://tenantflow.el-jefe.me/api/database/options"
