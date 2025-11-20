# Quick Start - Using kubectl

While we work on the API issue, you can create and manage tenants using kubectl directly. The UI will show all tenants you create this way.

## Create a Tenant

```bash
# Create namespace with proper labels
kubectl create namespace school-alpha
kubectl label namespace school-alpha \
  app.kubernetes.io/managed-by=multi-tenant-platform \
  tenant=school-alpha

# Create resource quota
kubectl apply -f - <<EOF
apiVersion: v1
kind: ResourceQuota
metadata:
  name: school-alpha-quota
  namespace: school-alpha
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 4Gi
    limits.cpu: "2"
    limits.memory: 4Gi
    persistentvolumeclaims: "5"
    pods: "10"
EOF
```

## Deploy educationelly-graphql

```bash
# Deploy the server
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: educationelly-graphql-server
  namespace: school-alpha
spec:
  replicas: 2
  selector:
    matchLabels:
      app: educationelly-graphql-server
  template:
    metadata:
      labels:
        app: educationelly-graphql-server
    spec:
      containers:
      - name: educationelly-graphql-server
        image: maxjeffwell/educationelly-graphql-server:latest
        ports:
        - containerPort: 4000
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: "4000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: educationelly-graphql-server
  namespace: school-alpha
spec:
  selector:
    app: educationelly-graphql-server
  ports:
  - port: 4000
    targetPort: 4000
  type: ClusterIP
EOF

# Deploy the client
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: educationelly-graphql-client
  namespace: school-alpha
spec:
  replicas: 2
  selector:
    matchLabels:
      app: educationelly-graphql-client
  template:
    metadata:
      labels:
        app: educationelly-graphql-client
    spec:
      containers:
      - name: educationelly-graphql-client
        image: maxjeffwell/educationelly-graphql-client:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: GRAPHQL_ENDPOINT
          value: http://educationelly-graphql-server:4000/graphql
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: educationelly-graphql-client
  namespace: school-alpha
spec:
  selector:
    app: educationelly-graphql-client
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
EOF
```

## Check Status

```bash
# View all resources in the tenant
kubectl get all -n school-alpha

# Check pod status
kubectl get pods -n school-alpha

# View logs
kubectl logs -f deployment/educationelly-graphql-server -n school-alpha
kubectl logs -f deployment/educationelly-graphql-client -n school-alpha
```

## Access the Application

```bash
# Port forward to the client
kubectl port-forward -n school-alpha service/educationelly-graphql-client 8080:3000

# Access at http://localhost:8080
```

## View in UI

Refresh http://localhost:5173 and you'll see your tenant with all deployments, services, and pods listed!

## Delete a Tenant

```bash
kubectl delete namespace school-alpha
```

This removes everything including the apps and data.

## Create Multiple Tenants

Just repeat the process with different names:

```bash
for tenant in school-beta school-gamma school-delta; do
  kubectl create namespace $tenant
  kubectl label namespace $tenant \
    app.kubernetes.io/managed-by=multi-tenant-platform \
    tenant=$tenant
done
```

Then deploy apps to each namespace!
