#!/bin/bash

# Deploy the multi-tenant platform to Kubernetes
# Usage: ./deploy-platform.sh

set -e

echo "Deploying Multi-Tenant Platform to Kubernetes..."
echo ""

# Create namespace
echo "Creating namespace..."
kubectl apply -f k8s-manifests/platform/namespace.yaml

# Create RBAC resources
echo "Creating service account and RBAC..."
kubectl apply -f k8s-manifests/platform/serviceaccount.yaml

# Deploy backend
echo "Deploying backend API..."
kubectl apply -f k8s-manifests/platform/backend-deployment.yaml

# Deploy frontend
echo "Deploying frontend UI..."
kubectl apply -f k8s-manifests/platform/frontend-deployment.yaml

# Optional: Deploy ingress (comment out if not using)
echo "Creating ingress (optional)..."
kubectl apply -f k8s-manifests/platform/ingress.yaml 2>/dev/null || echo "Ingress skipped (ingress controller may not be installed)"

echo ""
echo "Platform deployed successfully!"
echo ""
echo "Checking deployment status..."
kubectl get all -n multi-tenant-platform
echo ""
echo "To access the platform locally, run:"
echo "  kubectl port-forward -n multi-tenant-platform svc/platform-frontend 8080:80"
echo "  kubectl port-forward -n multi-tenant-platform svc/platform-backend 3000:3000"
echo ""
echo "Then access the UI at: http://localhost:8080"
