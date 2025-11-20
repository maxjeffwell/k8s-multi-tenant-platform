# Using Docker Hub Images

The platform is now configured to use your pre-built Docker Hub images for educationelly-graphql.

## Images

Your educationelly-graphql application uses a client-server architecture:

- **Server (GraphQL API)**: `maxjeffwell/educationelly-graphql-server:latest`
- **Client (Frontend)**: `maxjeffwell/educationelly-graphql-client:latest`

## How It Works

When you deploy to a tenant, the platform creates **two deployments**:

1. **educationelly-graphql-server**: The GraphQL backend API
   - Runs on port 4000
   - Service name: `educationelly-graphql-server`
   - Endpoint: `http://educationelly-graphql-server:4000/graphql` (internal)

2. **educationelly-graphql-client**: The frontend application
   - Runs on port 3000
   - Service name: `educationelly-graphql-client`
   - Connects to server via `GRAPHQL_ENDPOINT` environment variable

## Deployment via UI

1. Navigate to `http://localhost:5173`
2. Create a new tenant (e.g., `school-alpha`)
3. Click on the tenant to expand it
4. Fill in the deployment form:

```
Replicas: 2
Server Image: maxjeffwell/educationelly-graphql-server:latest
Server Port: 4000
Client Image: maxjeffwell/educationelly-graphql-client:latest
Client Port: 3000
Environment Variables:
GRAPHQL_ENDPOINT=http://educationelly-graphql-server:4000/graphql
NODE_ENV=production
```

5. Click "Deploy Application"

## Deployment via API

```bash
curl -X POST http://localhost:3000/api/deployments/school-alpha/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 2,
    "serverImage": "maxjeffwell/educationelly-graphql-server:latest",
    "clientImage": "maxjeffwell/educationelly-graphql-client:latest",
    "serverPort": 4000,
    "clientPort": 3000,
    "env": [
      {
        "name": "GRAPHQL_ENDPOINT",
        "value": "http://educationelly-graphql-server:4000/graphql"
      },
      {
        "name": "NODE_ENV",
        "value": "production"
      }
    ]
  }'
```

## Deployment via kubectl

You can also deploy manually using the example manifest:

```bash
# Copy the example manifest
cp k8s-manifests/tenants/example-tenant.yaml k8s-manifests/tenants/school-alpha.yaml

# Replace TENANT_NAME with your actual tenant name
sed -i 's/TENANT_NAME/school-alpha/g' k8s-manifests/tenants/school-alpha.yaml

# Apply the manifest
kubectl apply -f k8s-manifests/tenants/school-alpha.yaml
```

## Architecture in Each Tenant Namespace

```
Namespace: school-alpha
├── educationelly-graphql-server (Deployment)
│   ├── Pod: educationelly-graphql-server-xxxxx-1
│   ├── Pod: educationelly-graphql-server-xxxxx-2
│   └── Service: educationelly-graphql-server:4000
│
├── educationelly-graphql-client (Deployment)
│   ├── Pod: educationelly-graphql-client-xxxxx-1
│   ├── Pod: educationelly-graphql-client-xxxxx-2
│   └── Service: educationelly-graphql-client:3000
│
└── mongodb (StatefulSet)
    ├── Pod: mongodb-0
    └── Service: mongodb:27017
```

## Network Communication

The client connects to the server using Kubernetes DNS:

```
educationelly-graphql-client → educationelly-graphql-server:4000/graphql
educationelly-graphql-server → mongodb:27017
```

This works because they're in the same namespace and Kubernetes provides built-in DNS service discovery.

## Accessing the Application

### Development (Port Forward)

Access the **client** application:
```bash
kubectl port-forward -n school-alpha service/educationelly-graphql-client 3000:3000
```
Open: http://localhost:3000

Access the **server** GraphQL playground:
```bash
kubectl port-forward -n school-alpha service/educationelly-graphql-server 4000:4000
```
Open: http://localhost:4000/graphql

### Production (Ingress)

For production, you'll want to expose the client via an Ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: educationelly-ingress
  namespace: school-alpha
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: school-alpha.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: educationelly-graphql-client
                port:
                  number: 3000
```

Apply ingress:
```bash
# Enable ingress on MicroK8s
microk8s enable ingress

# Apply the ingress manifest
kubectl apply -f ingress.yaml
```

## Updating Images

### Update to a Specific Tag

To use a specific version instead of `latest`:

```bash
# Update via API
curl -X POST http://localhost:3000/api/deployments/school-alpha/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 2,
    "serverImage": "maxjeffwell/educationelly-graphql-server:v1.2.0",
    "clientImage": "maxjeffwell/educationelly-graphql-client:v1.2.0",
    "serverPort": 4000,
    "clientPort": 3000
  }'
```

### Update Existing Deployment

```bash
# Update server image
kubectl set image deployment/educationelly-graphql-server \
  educationelly-graphql-server=maxjeffwell/educationelly-graphql-server:v1.2.0 \
  -n school-alpha

# Update client image
kubectl set image deployment/educationelly-graphql-client \
  educationelly-graphql-client=maxjeffwell/educationelly-graphql-client:v1.2.0 \
  -n school-alpha
```

## Pulling Private Images

If you ever move to private images, add imagePullSecrets:

```bash
# Create secret
kubectl create secret docker-registry dockerhub-secret \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=maxjeffwell \
  --docker-password=YOUR_PASSWORD \
  --docker-email=your@email.com \
  -n school-alpha

# Reference in deployment
kubectl patch deployment educationelly-graphql-server \
  -n school-alpha \
  -p '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"dockerhub-secret"}]}}}}'
```

## Environment Variables

### Server Environment Variables

Common environment variables for the server:

```bash
NODE_ENV=production
PORT=4000
MONGO_URI=mongodb://admin:password@mongodb:27017/educationelly?authSource=admin
TENANT_ID=school-alpha
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://educationelly-graphql-client:3000
```

### Client Environment Variables

Common environment variables for the client:

```bash
NODE_ENV=production
GRAPHQL_ENDPOINT=http://educationelly-graphql-server:4000/graphql
TENANT_ID=school-alpha
API_URL=http://educationelly-graphql-server:4000
```

## Troubleshooting

### Client Can't Connect to Server

Check if the GRAPHQL_ENDPOINT is correct:
```bash
# Check client environment
kubectl exec -it deployment/educationelly-graphql-client -n school-alpha -- env | grep GRAPHQL

# Test connectivity from client to server
kubectl exec -it deployment/educationelly-graphql-client -n school-alpha -- \
  wget -O- http://educationelly-graphql-server:4000/health
```

### ImagePullBackOff

If pods can't pull the image:
```bash
# Check pod events
kubectl describe pod <pod-name> -n school-alpha

# Verify image exists on Docker Hub
docker pull maxjeffwell/educationelly-graphql-server:latest
docker pull maxjeffwell/educationelly-graphql-client:latest
```

### Check Deployment Status

```bash
# Check all resources
kubectl get all -n school-alpha

# Check deployments
kubectl get deployments -n school-alpha

# Check pods
kubectl get pods -n school-alpha

# View logs
kubectl logs deployment/educationelly-graphql-server -n school-alpha
kubectl logs deployment/educationelly-graphql-client -n school-alpha
```

## Scaling

Scale the deployments independently:

```bash
# Scale server to 3 replicas
kubectl scale deployment educationelly-graphql-server --replicas=3 -n school-alpha

# Scale client to 5 replicas
kubectl scale deployment educationelly-graphql-client --replicas=5 -n school-alpha
```

Or via the API:
```bash
curl -X PATCH http://localhost:3000/api/deployments/school-alpha/educationelly-graphql-server/scale \
  -H "Content-Type: application/json" \
  -d '{"replicas": 3}'
```

## Health Checks

The deployments include health checks:

**Server**:
- Liveness: `GET /health` on port 4000
- Readiness: `GET /health` on port 4000

**Client**:
- Liveness: `GET /` on port 3000
- Readiness: `GET /` on port 3000

Make sure your images respond to these endpoints or update the probes in the deployment configuration.

## Next Steps

1. Test the deployment in a dev tenant
2. Configure ingress for external access
3. Set up monitoring for the containers
4. Implement automated rollback if health checks fail
5. Set up CI/CD to automatically update images when you push to Docker Hub
