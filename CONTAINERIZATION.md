# Platform Containerization Guide

This guide explains how to containerize and deploy the Multi-Tenant Kubernetes Platform itself.

## Overview

The platform consists of two main components:
- **Backend API**: Node.js/Express server that manages tenant operations
- **Frontend UI**: React application for the management dashboard

Both components can be run as Docker containers or deployed to Kubernetes.

## Quick Start

### Option 1: Docker Compose (Local Development)

```bash
# Build and start all services
docker-compose up -d

# Access the platform
# Frontend: http://localhost:8080
# Backend API: http://localhost:3000
```

### Option 2: Kubernetes Deployment

```bash
# 1. Build and push images to Docker Hub
./build-and-push.sh v1.0.0

# 2. Deploy to Kubernetes
./deploy-platform.sh

# 3. Port forward to access locally
kubectl port-forward -n multi-tenant-platform svc/platform-frontend 8080:80
kubectl port-forward -n multi-tenant-platform svc/platform-backend 3000:3000
```

## Building Docker Images

### Backend Image

```bash
cd backend
docker build -t maxjeffwell/k8s-platform-backend:latest .
docker push maxjeffwell/k8s-platform-backend:latest
```

**Image Details:**
- Base: `node:18-alpine`
- Size: ~100MB
- Port: 3000
- Health check: `/health` endpoint

### Frontend Image

```bash
cd frontend
docker build -t maxjeffwell/k8s-platform-frontend:latest .
docker push maxjeffwell/k8s-platform-frontend:latest
```

**Image Details:**
- Base: `nginx:alpine`
- Size: ~25MB
- Port: 8080
- Health check: `/health` endpoint

## Docker Compose Configuration

The `docker-compose.yml` file provides a complete local development environment:

```yaml
services:
  backend:
    - Exposes port 3000
    - Mounts kubeconfig for K8s API access
    - Health checks enabled

  frontend:
    - Exposes port 8080
    - Proxies API requests to backend
    - Serves static React build
```

**Environment Variables:**

Backend:
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)

Frontend:
- `VITE_API_URL`: Backend API URL (default: http://localhost:3000/api)

## Kubernetes Deployment

### Architecture

```
multi-tenant-platform namespace
├── ServiceAccount (platform-backend-sa)
├── ClusterRole & ClusterRoleBinding (RBAC)
├── Deployment: platform-backend (2 replicas)
│   └── Service: platform-backend (ClusterIP, port 3000)
├── Deployment: platform-frontend (2 replicas)
│   └── Service: platform-frontend (ClusterIP, port 80)
└── Ingress: platform-ingress (optional)
```

### Deployment Steps

1. **Create Namespace**
   ```bash
   kubectl apply -f k8s-manifests/platform/namespace.yaml
   ```

2. **Configure RBAC**
   ```bash
   kubectl apply -f k8s-manifests/platform/serviceaccount.yaml
   ```

   The backend requires cluster-level permissions to:
   - Create/manage namespaces
   - Deploy applications
   - Manage resource quotas
   - Configure network policies

3. **Deploy Backend**
   ```bash
   kubectl apply -f k8s-manifests/platform/backend-deployment.yaml
   ```

4. **Deploy Frontend**
   ```bash
   kubectl apply -f k8s-manifests/platform/frontend-deployment.yaml
   ```

5. **Configure Ingress (Optional)**
   ```bash
   kubectl apply -f k8s-manifests/platform/ingress.yaml
   ```

### Accessing the Platform

**Port Forwarding (Development):**
```bash
# Frontend
kubectl port-forward -n multi-tenant-platform svc/platform-frontend 8080:80

# Backend
kubectl port-forward -n multi-tenant-platform svc/platform-backend 3000:3000
```

**Via Ingress (Production):**
Configure DNS to point to your ingress controller, then access:
- UI: `https://k8s-platform.yourdomain.com`
- API: `https://k8s-platform.yourdomain.com/api`

## Resource Requirements

### Backend
- **Requests**: 100m CPU, 128Mi memory
- **Limits**: 500m CPU, 512Mi memory
- **Replicas**: 2 (for high availability)

### Frontend
- **Requests**: 50m CPU, 64Mi memory
- **Limits**: 200m CPU, 256Mi memory
- **Replicas**: 2 (for high availability)

## Security Considerations

### Docker Images
- Multi-stage builds for smaller image sizes
- Non-root users in containers
- No unnecessary packages or tools
- Health checks enabled

### Kubernetes
- Service account with minimal required permissions
- ClusterRole with specific resource access
- Network policies (recommended)
- TLS termination at ingress
- Resource limits to prevent DoS

## Monitoring & Observability

### Health Checks

**Backend:**
```bash
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"..."}
```

**Frontend:**
```bash
curl http://localhost:8080/health
# Response: OK
```

### Kubernetes Probes

Both deployments include:
- **Liveness Probe**: Restarts unhealthy containers
- **Readiness Probe**: Controls traffic routing
- **Startup Probe**: Allows time for initialization

### Logging

View logs:
```bash
# Backend logs
kubectl logs -f deployment/platform-backend -n multi-tenant-platform

# Frontend logs
kubectl logs -f deployment/platform-frontend -n multi-tenant-platform
```

## Scaling

### Horizontal Scaling

Scale deployments:
```bash
# Scale backend
kubectl scale deployment/platform-backend -n multi-tenant-platform --replicas=3

# Scale frontend
kubectl scale deployment/platform-frontend -n multi-tenant-platform --replicas=3
```

### Auto-scaling (HPA)

```bash
# Backend auto-scaling
kubectl autoscale deployment platform-backend \
  -n multi-tenant-platform \
  --cpu-percent=70 \
  --min=2 \
  --max=10

# Frontend auto-scaling
kubectl autoscale deployment platform-frontend \
  -n multi-tenant-platform \
  --cpu-percent=70 \
  --min=2 \
  --max=10
```

## Troubleshooting

### Backend Can't Access Kubernetes API

**Issue**: Backend pods can't create/manage tenants

**Solution**: Verify RBAC configuration
```bash
kubectl get clusterrole platform-backend-role
kubectl get clusterrolebinding platform-backend-binding
kubectl describe sa platform-backend-sa -n multi-tenant-platform
```

### Frontend Can't Reach Backend

**Issue**: API requests fail with network errors

**Solution**: Check service connectivity
```bash
# Test from frontend pod
kubectl exec -it deployment/platform-frontend -n multi-tenant-platform -- \
  wget -O- http://platform-backend:3000/health
```

### Images Not Pulling

**Issue**: `ImagePullBackOff` errors

**Solution**:
1. Verify images exist: `docker pull maxjeffwell/k8s-platform-backend:latest`
2. Check image pull secrets if using private registry
3. Update image pull policy in deployments

### Health Checks Failing

**Issue**: Pods constantly restarting

**Solution**: Check logs and increase probe timeouts
```bash
kubectl logs deployment/platform-backend -n multi-tenant-platform
kubectl describe pod -l app=platform-backend -n multi-tenant-platform
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build and push images
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          ./build-and-push.sh ${{ github.sha }}

      - name: Deploy to Kubernetes
        run: |
          kubectl config use-context production
          ./deploy-platform.sh
```

## Backup and Recovery

### Backend State
The backend is stateless - all state is in Kubernetes resources.

### Configuration Backup
```bash
# Export all platform resources
kubectl get all,sa,clusterrole,clusterrolebinding \
  -n multi-tenant-platform \
  -o yaml > platform-backup.yaml
```

### Restore
```bash
kubectl apply -f platform-backup.yaml
```

## Production Checklist

- [ ] Build and push production images with version tags
- [ ] Configure proper resource limits
- [ ] Set up monitoring and alerting
- [ ] Enable TLS with valid certificates
- [ ] Configure ingress with proper domain
- [ ] Set up log aggregation
- [ ] Implement backup strategy
- [ ] Configure horizontal pod autoscaling
- [ ] Test disaster recovery procedures
- [ ] Document runbooks for operations team
- [ ] Set up CI/CD pipelines
- [ ] Enable network policies for isolation

## Next Steps

- Set up Prometheus/Grafana for metrics
- Configure distributed tracing
- Implement authentication (OAuth2/JWT)
- Add rate limiting
- Set up disaster recovery
- Configure multi-cluster deployment
