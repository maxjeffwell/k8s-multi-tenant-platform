# Docker Hub Configuration - Summary of Changes

The platform has been updated to use your Docker Hub images for educationelly-graphql.

## What Changed

### 1. Backend Service (`backend/src/services/k8sService.js`)
- ✅ Updated to deploy **two separate deployments** per tenant:
  - `educationelly-graphql-server` (GraphQL API) - port 4000
  - `educationelly-graphql-client` (Frontend) - port 3000
- ✅ Default images set to:
  - `maxjeffwell/educationelly-graphql-server:latest`
  - `maxjeffwell/educationelly-graphql-client:latest`
- ✅ Added helper method `createDeployment()` for reusability

### 2. Frontend UI (`frontend/src/components/DeploymentControls.jsx`)
- ✅ Updated form to show separate inputs for:
  - Server image and port
  - Client image and port
- ✅ Pre-filled with your Docker Hub images
- ✅ Default environment variable includes GraphQL endpoint configuration
- ✅ Both containers receive the same environment variables

### 3. Kubernetes Manifests (`k8s-manifests/tenants/example-tenant.yaml`)
- ✅ Updated example manifest to show:
  - Separate `educationelly-graphql-server` deployment
  - Separate `educationelly-graphql-client` deployment
  - Both services with proper internal DNS
  - Client configured to connect to server via `GRAPHQL_ENDPOINT`

### 4. Documentation
- ✅ Created `docs/DOCKER_HUB_SETUP.md` - Complete guide for using your images
- ✅ Updated main `README.md` to highlight Docker Hub integration
- ✅ All API examples updated to reflect server/client architecture

## How to Use

### Quick Start

```bash
# Start the platform
./start.sh

# Or manually:
cd backend && npm run dev
cd frontend && npm run dev
```

### Create a Tenant and Deploy

**Via UI** (http://localhost:5173):
1. Click "Create New Tenant"
2. Enter name: `school-alpha`
3. Click on the tenant card to expand
4. The form is pre-filled with your Docker Hub images!
5. Click "Deploy Application"

**Via API**:
```bash
# Create tenant
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{"tenantName": "school-alpha", "resourceQuota": {"cpu": "2", "memory": "4Gi"}}'

# Deploy (images are defaults, you can omit them)
curl -X POST http://localhost:3000/api/deployments/school-alpha/deploy \
  -H "Content-Type: application/json" \
  -d '{"replicas": 2}'
```

The deployment will automatically use:
- `maxjeffwell/educationelly-graphql-server:latest`
- `maxjeffwell/educationelly-graphql-client:latest`

### What Gets Created

For each tenant deployment:

```
namespace: school-alpha
├── Deployment: educationelly-graphql-server
│   ├── Image: maxjeffwell/educationelly-graphql-server:latest
│   ├── Port: 4000
│   └── Service: educationelly-graphql-server:4000
│
└── Deployment: educationelly-graphql-client
    ├── Image: maxjeffwell/educationelly-graphql-client:latest
    ├── Port: 3000
    ├── Env: GRAPHQL_ENDPOINT=http://educationelly-graphql-server:4000/graphql
    └── Service: educationelly-graphql-client:3000
```

## Network Communication

The client automatically connects to the server using Kubernetes DNS:

```
Client (educationelly-graphql-client)
    → http://educationelly-graphql-server:4000/graphql
        → Server (educationelly-graphql-server)
            → mongodb:27017
```

This works because:
1. Both are in the same namespace
2. Kubernetes provides built-in DNS (`<service-name>:<port>`)
3. The client is configured with `GRAPHQL_ENDPOINT` environment variable

## Accessing Your Application

### Port Forward to Client (for users)
```bash
kubectl port-forward -n school-alpha service/educationelly-graphql-client 3000:3000
```
Access: http://localhost:3000

### Port Forward to Server (GraphQL API)
```bash
kubectl port-forward -n school-alpha service/educationelly-graphql-server 4000:4000
```
Access: http://localhost:4000/graphql

## Customization

### Use Different Image Tags

```bash
curl -X POST http://localhost:3000/api/deployments/school-alpha/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 2,
    "serverImage": "maxjeffwell/educationelly-graphql-server:v1.0.0",
    "clientImage": "maxjeffwell/educationelly-graphql-client:v1.0.0"
  }'
```

### Add Environment Variables

```bash
curl -X POST http://localhost:3000/api/deployments/school-alpha/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 2,
    "env": [
      {"name": "GRAPHQL_ENDPOINT", "value": "http://educationelly-graphql-server:4000/graphql"},
      {"name": "NODE_ENV", "value": "production"},
      {"name": "TENANT_ID", "value": "school-alpha"}
    ]
  }'
```

## Next Steps

1. **Test the deployment**:
   ```bash
   # Create a test tenant
   curl -X POST http://localhost:3000/api/tenants \
     -H "Content-Type: application/json" \
     -d '{"tenantName": "test-school"}'

   # Deploy your apps
   curl -X POST http://localhost:3000/api/deployments/test-school/deploy \
     -H "Content-Type: application/json" \
     -d '{"replicas": 1}'

   # Check status
   kubectl get all -n test-school
   ```

2. **Access the application**:
   ```bash
   kubectl port-forward -n test-school service/educationelly-graphql-client 3000:3000
   # Open http://localhost:3000
   ```

3. **Monitor**:
   - View in UI: http://localhost:5173
   - Check logs: `kubectl logs -f deployment/educationelly-graphql-server -n test-school`

4. **Production setup**:
   - Configure Ingress for external access
   - Set up monitoring (Prometheus/Grafana)
   - Add authentication
   - Configure TLS/SSL

## Troubleshooting

### Pods not starting?
```bash
kubectl describe pod -n school-alpha
kubectl logs deployment/educationelly-graphql-server -n school-alpha
kubectl logs deployment/educationelly-graphql-client -n school-alpha
```

### Client can't connect to server?
Check the GRAPHQL_ENDPOINT environment variable:
```bash
kubectl exec -it deployment/educationelly-graphql-client -n school-alpha -- env | grep GRAPHQL
```

### Need to update images?
```bash
kubectl set image deployment/educationelly-graphql-server \
  educationelly-graphql-server=maxjeffwell/educationelly-graphql-server:v2.0.0 \
  -n school-alpha
```

## Reference

- Full Docker Hub guide: `docs/DOCKER_HUB_SETUP.md`
- Architecture details: `docs/ARCHITECTURE.md`
- Setup guide: `docs/SETUP_GUIDE.md`
- API examples: `docs/API_EXAMPLES.md`

You're all set! The platform is ready to deploy your educationelly-graphql application to multiple isolated tenants.
