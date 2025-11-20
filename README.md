# Multi-Tenant Kubernetes Platform

A production-ready platform for deploying and managing isolated instances of educationelly-graphql across multiple tenants (schools/districts). Each tenant gets their own namespace with dedicated resources, database, and network isolation.

**Ready to use!** The platform is pre-configured with Docker Hub images:
- Server: `maxjeffwell/educationelly-graphql-server:latest`
- Client: `maxjeffwell/educationelly-graphql-client:latest`

No container building required - just start the platform and begin creating tenants!

## Features

- **Namespace Isolation**: Each tenant runs in a separate Kubernetes namespace
- **Resource Quotas**: CPU and memory limits per tenant to prevent resource hogging
- **Per-Tenant Databases**: Each tenant gets their own MongoDB instance
- **Network Policies**: Traffic isolation between tenants
- **Tenant Management API**: RESTful API for provisioning and managing tenants
- **Web Dashboard**: React-based UI for managing tenants and deployments
- **Real-time Monitoring**: View resource usage and pod status per tenant
- **Easy Deployment**: One-click deployment of educationelly-graphql instances

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MicroK8s Cluster                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Namespace  │  │   Namespace  │  │   Namespace  │     │
│  │  school-a    │  │  school-b    │  │  school-c    │     │
│  │              │  │              │  │              │     │
│  │  ┌────────┐  │  │  ┌────────┐  │  │  ┌────────┐  │     │
│  │  │GraphQL │  │  │  │GraphQL │  │  │  │GraphQL │  │     │
│  │  │ App    │  │  │  │ App    │  │  │  │ App    │  │     │
│  │  └────────┘  │  │  └────────┘  │  │  └────────┘  │     │
│  │  ┌────────┐  │  │  ┌────────┐  │  │  ┌────────┐  │     │
│  │  │MongoDB │  │  │  │MongoDB │  │  │  │MongoDB │  │     │
│  │  └────────┘  │  │  └────────┘  │  │  └────────┘  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Control Plane (Express API + React UI)        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: React + Vite
- **Orchestration**: Kubernetes (MicroK8s)
- **Database**: MongoDB (per tenant)
- **API Client**: Kubernetes JavaScript Client
- **Network**: Kubernetes Network Policies

## Prerequisites

- MicroK8s installed and running
- Node.js 18+ and npm
- kubectl configured to access your MicroK8s cluster
- educationelly-graphql container image available

## Quick Start

### 1. Set up RBAC permissions

```bash
cd k8s-manifests/base
kubectl apply -f rbac.yaml
```

### 2. Configure Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env if needed
```

### 3. Start Backend API

```bash
npm run dev
# API will start on http://localhost:3000
```

### 4. Configure Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env if needed (default points to localhost:3000)
```

### 5. Start Frontend

```bash
npm run dev
# UI will start on http://localhost:5173
```

### 6. Access the Dashboard

Open your browser to `http://localhost:5173` and start creating tenants!

## API Reference

### Tenant Management

#### Create Tenant
```bash
POST /api/tenants
Content-Type: application/json

{
  "tenantName": "school-a",
  "resourceQuota": {
    "cpu": "2",
    "memory": "4Gi"
  }
}
```

#### List Tenants
```bash
GET /api/tenants
```

#### Get Tenant Details
```bash
GET /api/tenants/:tenantName
```

#### Get Tenant Metrics
```bash
GET /api/tenants/:tenantName/metrics
```

#### Delete Tenant
```bash
DELETE /api/tenants/:tenantName
```

### Deployment Management

#### Deploy Application
```bash
POST /api/deployments/:tenantName/deploy
Content-Type: application/json

{
  "replicas": 2,
  "image": "your-registry/educationelly-graphql:latest",
  "env": [
    {
      "name": "MONGO_URI",
      "value": "mongodb://..."
    }
  ]
}
```

#### Scale Deployment
```bash
PATCH /api/deployments/:tenantName/:deploymentName/scale
Content-Type: application/json

{
  "replicas": 3
}
```

## Usage Guide

### Creating a New Tenant

1. Click "Create New Tenant" in the dashboard
2. Enter a tenant name (e.g., `school-a`)
   - Must be lowercase alphanumeric with hyphens
   - Will be used as the Kubernetes namespace name
3. Set resource quotas (CPU and memory limits)
4. Click "Create Tenant"

The system will:
- Create a new Kubernetes namespace
- Apply resource quotas
- Set up network policies for isolation

### Deploying educationelly-graphql

1. Click on a tenant card to expand details
2. Fill in the deployment form:
   - Replicas: Number of pod replicas (1-10)
   - Container Image: Your educationelly-graphql image
   - Environment Variables: One per line (KEY=value)
3. Click "Deploy Application"

The system will:
- Create a Deployment with specified replicas
- Create a Service for internal load balancing
- Deploy MongoDB if specified in the manifest

### Monitoring Tenants

Each tenant card shows:
- Deployment status and replica count
- Running services
- Pod status (running/pending/failed)
- Resource usage metrics

Click "Refresh" to update the data.

### Deleting a Tenant

1. Expand a tenant card
2. Click "Delete Tenant" at the bottom
3. Confirm deletion

**Warning**: This will delete the namespace and all resources within it, including databases!

## Production Deployment

### Security Considerations

1. **Change Default Passwords**: Update MongoDB passwords in tenant manifests
2. **Enable TLS**: Configure TLS for API and app communication
3. **Implement Authentication**: Add auth middleware to the Express API
4. **Use Secrets**: Store sensitive data in Kubernetes Secrets, not environment variables
5. **Network Policies**: Review and customize network policies for your use case

### Recommended Enhancements

1. **Ingress Controller**: Set up NGINX or Traefik for external access
2. **Monitoring Stack**: Deploy Prometheus + Grafana for metrics
3. **Logging**: Set up EFK (Elasticsearch, Fluentd, Kibana) stack
4. **Backup Strategy**: Implement automated MongoDB backups
5. **Service Mesh**: Consider Istio for advanced traffic management
6. **MongoDB Operator**: Use a Kubernetes operator for managed MongoDB

### Example Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: educationelly-ingress
  namespace: school-a
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - school-a.yourdomain.com
      secretName: school-a-tls
  rules:
    - host: school-a.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: educationelly-graphql
                port:
                  number: 4000
```

## Troubleshooting

### Backend can't connect to Kubernetes

- Ensure kubeconfig is properly set up: `kubectl config view`
- Check MicroK8s status: `microk8s status`
- Verify RBAC permissions are applied

### Pods stuck in Pending

- Check resource quotas: `kubectl describe resourcequota -n <tenant-name>`
- View pod events: `kubectl describe pod <pod-name> -n <tenant-name>`
- Ensure sufficient cluster resources

### Network isolation issues

- Verify network policies: `kubectl get networkpolicy -n <tenant-name>`
- Check if CoreDNS is running: `kubectl get pods -n kube-system`

### Frontend can't reach API

- Verify backend is running: `curl http://localhost:3000/health`
- Check CORS configuration in backend
- Ensure `.env` has correct API URL

## Development

### Backend Structure

```
backend/
├── src/
│   ├── config/          # Kubernetes client configuration
│   ├── controllers/     # Request handlers
│   ├── routes/          # API routes
│   ├── services/        # Business logic & K8s operations
│   └── server.js        # Express app entry point
└── package.json
```

### Frontend Structure

```
frontend/
├── src/
│   ├── components/      # React components
│   ├── pages/           # Page components
│   ├── services/        # API client
│   └── styles/          # CSS files
└── package.json
```

### Running Tests

```bash
# Backend tests (to be implemented)
cd backend
npm test

# Frontend tests (to be implemented)
cd frontend
npm test
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - feel free to use this for your projects!

## Support

For issues or questions:
- Check the troubleshooting section
- Review Kubernetes logs: `kubectl logs <pod-name> -n <namespace>`
- Check API logs in the backend console

## Roadmap

- [ ] Authentication and authorization (JWT, OAuth)
- [ ] MongoDB Operator integration
- [ ] Istio service mesh support
- [ ] Advanced monitoring with Prometheus
- [ ] Automated backup and restore
- [ ] Multi-cluster support
- [ ] Tenant usage billing and reporting
- [ ] Database migration tools
- [ ] CI/CD pipeline templates
