# Setup Guide

This guide will walk you through setting up the Multi-Tenant Kubernetes Platform from scratch.

## Prerequisites Check

Before starting, ensure you have:

- [ ] MicroK8s installed and running
- [ ] kubectl configured
- [ ] Node.js 18+ installed
- [ ] npm or yarn installed
- [ ] Your educationelly-graphql application containerized

## Step-by-Step Setup

### 1. Verify MicroK8s Installation

```bash
# Check MicroK8s status
microk8s status

# If not running, start it
microk8s start

# Enable required addons
microk8s enable dns storage

# Configure kubectl alias (optional but recommended)
alias kubectl='microk8s kubectl'

# Test kubectl access
kubectl get nodes
```

### 2. Configure Kubernetes Access

The backend needs access to your Kubernetes cluster. By default, it will use your kubeconfig.

```bash
# For MicroK8s, export the config
microk8s config > ~/.kube/config

# Verify access
kubectl cluster-info
```

### 3. Set Up RBAC Permissions

Apply the RBAC configuration to grant the control plane necessary permissions:

```bash
cd k8s-manifests/base
kubectl apply -f rbac.yaml

# Verify the service account was created
kubectl get serviceaccount multi-tenant-controller
kubectl get clusterrole multi-tenant-controller
kubectl get clusterrolebinding multi-tenant-controller
```

### 4. Prepare Your Container Registry

You have several options for hosting your educationelly-graphql image:

#### Option A: Use MicroK8s Built-in Registry

```bash
# Enable the registry addon
microk8s enable registry

# Tag your image
docker tag educationelly-graphql:latest localhost:32000/educationelly-graphql:latest

# Push to local registry
docker push localhost:32000/educationelly-graphql:latest

# Use this image URL in deployments: localhost:32000/educationelly-graphql:latest
```

#### Option B: Use Docker Hub

```bash
# Login to Docker Hub
docker login

# Tag and push
docker tag educationelly-graphql:latest yourusername/educationelly-graphql:latest
docker push yourusername/educationelly-graphql:latest

# Use this image URL: yourusername/educationelly-graphql:latest
```

#### Option C: Use a Private Registry

Configure imagePullSecrets in the deployment manifests.

### 5. Install Backend Dependencies

```bash
cd backend
npm install

# Create environment file
cp .env.example .env

# Edit .env if you need to change the port
# Default is PORT=3000
```

### 6. Start the Backend API

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The API should start on http://localhost:3000. Test it:

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}
```

### 7. Install Frontend Dependencies

Open a new terminal:

```bash
cd frontend
npm install

# Create environment file
cp .env.example .env

# Edit .env to point to your backend API
# Default: VITE_API_URL=http://localhost:3000/api
```

### 8. Start the Frontend

```bash
# Development mode
npm run dev

# The UI will be available at http://localhost:5173
```

### 9. Access the Dashboard

Open your browser and navigate to: http://localhost:5173

You should see the Multi-Tenant Portfolio Hosting dashboard!

## Creating Your First Tenant

### Via the UI

1. Click "Create New Tenant"
2. Enter tenant name: `demo-school-a`
3. Set CPU quota: `2`
4. Set Memory quota: `4Gi`
5. Click "Create Tenant"

### Via API

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "demo-school-a",
    "resourceQuota": {
      "cpu": "2",
      "memory": "4Gi"
    }
  }'
```

### Verify Creation

```bash
# Check namespace was created
kubectl get namespace demo-school-a

# Check resource quota
kubectl get resourcequota -n demo-school-a

# View namespace details
kubectl describe namespace demo-school-a
```

## Deploying educationelly-graphql

### Via the UI

1. Click on the "demo-school-a" tenant card to expand it
2. Fill in the deployment form:
   - Replicas: `2`
   - Image: `localhost:32000/educationelly-graphql:latest` (or your image)
   - Environment Variables (example):
     ```
     MONGO_URI=mongodb://admin:password@mongodb:27017/educationelly?authSource=admin
     NODE_ENV=production
     PORT=4000
     TENANT_ID=demo-school-a
     ```
3. Click "Deploy Application"

### Via API

```bash
curl -X POST http://localhost:3000/api/deployments/demo-school-a/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 2,
    "image": "localhost:32000/educationelly-graphql:latest",
    "env": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "PORT", "value": "4000"},
      {"name": "TENANT_ID", "value": "demo-school-a"}
    ]
  }'
```

### Verify Deployment

```bash
# Check deployment
kubectl get deployments -n demo-school-a

# Check pods
kubectl get pods -n demo-school-a

# View deployment details
kubectl describe deployment educationelly-graphql -n demo-school-a

# Check logs
kubectl logs -f deployment/educationelly-graphql -n demo-school-a
```

## Deploying MongoDB Per Tenant

If you need a database per tenant, you can deploy MongoDB:

```bash
# Create PVC for MongoDB
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongodb-pvc
  namespace: demo-school-a
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
EOF

# Deploy MongoDB
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
  namespace: demo-school-a
spec:
  serviceName: mongodb
  replicas: 1
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
        - name: mongodb
          image: mongo:7.0
          ports:
            - containerPort: 27017
          env:
            - name: MONGO_INITDB_ROOT_USERNAME
              value: admin
            - name: MONGO_INITDB_ROOT_PASSWORD
              value: SecurePassword123
            - name: MONGO_INITDB_DATABASE
              value: educationelly
          volumeMounts:
            - name: mongodb-storage
              mountPath: /data/db
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
      volumes:
        - name: mongodb-storage
          persistentVolumeClaim:
            claimName: mongodb-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: demo-school-a
spec:
  selector:
    app: mongodb
  ports:
    - port: 27017
      targetPort: 27017
  type: ClusterIP
EOF

# Wait for MongoDB to be ready
kubectl wait --for=condition=ready pod -l app=mongodb -n demo-school-a --timeout=120s

# Now redeploy educationelly-graphql with MongoDB URI
# MONGO_URI=mongodb://admin:SecurePassword123@mongodb:27017/educationelly?authSource=admin
```

## Network Isolation

Apply network policies to isolate tenant traffic:

```bash
kubectl apply -f k8s-manifests/base/network-policy.yaml

# Replace TENANT_NAMESPACE in the file with your tenant name first
sed 's/TENANT_NAMESPACE/demo-school-a/g' k8s-manifests/base/network-policy.yaml | kubectl apply -f -
```

## Exposing Services Externally

### Using Port Forwarding (Development)

```bash
# Forward educationelly-graphql port
kubectl port-forward -n demo-school-a service/educationelly-graphql 4000:4000

# Access at http://localhost:4000
```

### Using NodePort (Simple)

```bash
# Change service type to NodePort
kubectl patch service educationelly-graphql -n demo-school-a -p '{"spec":{"type":"NodePort"}}'

# Get the assigned port
kubectl get service educationelly-graphql -n demo-school-a

# Access via http://NODE_IP:NODE_PORT
```

### Using Ingress (Production)

1. Enable ingress addon:
```bash
microk8s enable ingress
```

2. Create ingress resource:
```bash
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: educationelly-ingress
  namespace: demo-school-a
spec:
  rules:
    - host: demo-school-a.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: educationelly-graphql
                port:
                  number: 4000
EOF
```

3. Add to /etc/hosts:
```bash
echo "127.0.0.1 demo-school-a.local" | sudo tee -a /etc/hosts
```

4. Access at http://demo-school-a.local

## Monitoring and Debugging

### View Tenant Details

```bash
# Get all resources in a namespace
kubectl get all -n demo-school-a

# Describe a pod
kubectl describe pod <pod-name> -n demo-school-a

# View logs
kubectl logs <pod-name> -n demo-school-a

# Execute commands in a pod
kubectl exec -it <pod-name> -n demo-school-a -- /bin/sh
```

### Check Resource Usage

```bash
# View resource quota usage
kubectl describe resourcequota -n demo-school-a

# View pod resource usage (requires metrics-server)
microk8s enable metrics-server
kubectl top pods -n demo-school-a
kubectl top nodes
```

### Debug Network Issues

```bash
# Check network policies
kubectl get networkpolicy -n demo-school-a

# Test connectivity from a pod
kubectl run -it --rm debug --image=busybox -n demo-school-a -- sh
# Inside the pod:
# wget -O- http://educationelly-graphql:4000/health
```

## Next Steps

- Set up monitoring with Prometheus and Grafana
- Implement authentication and authorization
- Configure automated backups
- Set up CI/CD pipelines
- Plan for high availability
- Implement logging aggregation

## Troubleshooting

### Pod ImagePullBackOff

Check if the image is accessible:
```bash
kubectl describe pod <pod-name> -n demo-school-a
```

Solution: Verify image name and registry access.

### CrashLoopBackOff

Check pod logs:
```bash
kubectl logs <pod-name> -n demo-school-a
```

Solution: Fix application errors or configuration.

### Backend Connection Refused

Check if backend is running and accessible:
```bash
curl http://localhost:3000/health
```

### Frontend CORS Errors

Ensure backend CORS is configured to allow frontend origin.

## Getting Help

- Check the main README.md for common issues
- Review Kubernetes pod events: `kubectl get events -n <namespace>`
- View API logs in the backend terminal
- Check browser console for frontend errors
