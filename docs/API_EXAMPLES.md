# API Examples

This document provides curl examples for interacting with the Multi-Tenant Platform API.

## Base URL

All API endpoints use the base URL: `http://localhost:3000/api`

## Tenant Management

### 1. Create a New Tenant

Create a new tenant namespace with resource quotas.

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

**Response:**
```json
{
  "message": "Tenant created successfully",
  "tenant": {
    "name": "demo-school-a",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### 2. List All Tenants

Get a list of all tenant namespaces.

```bash
curl http://localhost:3000/api/tenants
```

**Response:**
```json
{
  "tenants": [
    {
      "name": "demo-school-a",
      "status": "Active",
      "createdAt": "2024-01-15T10:30:00Z",
      "labels": {
        "app.kubernetes.io/managed-by": "multi-tenant-platform",
        "tenant": "demo-school-a"
      }
    },
    {
      "name": "demo-school-b",
      "status": "Active",
      "createdAt": "2024-01-15T11:00:00Z",
      "labels": {
        "app.kubernetes.io/managed-by": "multi-tenant-platform",
        "tenant": "demo-school-b"
      }
    }
  ]
}
```

### 3. Get Tenant Details

Retrieve detailed information about a specific tenant.

```bash
curl http://localhost:3000/api/tenants/demo-school-a
```

**Response:**
```json
{
  "tenant": {
    "name": "demo-school-a",
    "status": "Active",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "deployments": [
    {
      "name": "educationelly-graphql",
      "replicas": 2,
      "availableReplicas": 2,
      "image": "localhost:32000/educationelly-graphql:latest"
    }
  ],
  "services": [
    {
      "name": "educationelly-graphql",
      "type": "ClusterIP",
      "ports": [
        {
          "port": 4000,
          "targetPort": 4000,
          "protocol": "TCP"
        }
      ]
    }
  ],
  "pods": [
    {
      "name": "educationelly-graphql-7d8f9b5c4d-abc12",
      "status": "Running",
      "restarts": 0
    },
    {
      "name": "educationelly-graphql-7d8f9b5c4d-def34",
      "status": "Running",
      "restarts": 0
    }
  ]
}
```

### 4. Get Tenant Metrics

Get resource usage metrics for a tenant.

```bash
curl http://localhost:3000/api/tenants/demo-school-a/metrics
```

**Response:**
```json
{
  "metrics": {
    "pods": {
      "total": 2,
      "running": 2,
      "pending": 0,
      "failed": 0
    },
    "quota": {
      "metadata": {
        "name": "demo-school-a-quota",
        "namespace": "demo-school-a"
      },
      "spec": {
        "hard": {
          "requests.cpu": "2",
          "requests.memory": "4Gi",
          "limits.cpu": "2",
          "limits.memory": "4Gi",
          "pods": "10"
        }
      },
      "status": {
        "used": {
          "requests.cpu": "500m",
          "requests.memory": "512Mi",
          "pods": "2"
        }
      }
    }
  }
}
```

### 5. Delete a Tenant

Delete a tenant namespace and all its resources.

```bash
curl -X DELETE http://localhost:3000/api/tenants/demo-school-a
```

**Response:**
```json
{
  "message": "Namespace demo-school-a deleted successfully"
}
```

## Deployment Management

### 1. Deploy Application to Tenant

Deploy educationelly-graphql to a tenant namespace.

```bash
curl -X POST http://localhost:3000/api/deployments/demo-school-a/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 2,
    "image": "localhost:32000/educationelly-graphql:latest",
    "env": [
      {
        "name": "NODE_ENV",
        "value": "production"
      },
      {
        "name": "PORT",
        "value": "4000"
      },
      {
        "name": "MONGO_URI",
        "value": "mongodb://admin:password@mongodb:27017/educationelly?authSource=admin"
      },
      {
        "name": "TENANT_ID",
        "value": "demo-school-a"
      }
    ]
  }'
```

**Response:**
```json
{
  "message": "Application deployed successfully",
  "deployment": {
    "name": "educationelly-graphql",
    "namespace": "demo-school-a",
    "replicas": 2,
    "image": "localhost:32000/educationelly-graphql:latest"
  }
}
```

### 2. Scale a Deployment

Change the number of replicas for a deployment.

```bash
curl -X PATCH http://localhost:3000/api/deployments/demo-school-a/educationelly-graphql/scale \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 5
  }'
```

**Response:**
```json
{
  "message": "Deployment scaled to 5 replicas"
}
```

## Health Check

Check if the API is running.

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00Z"
}
```

## Complete Workflow Example

Here's a complete example of creating a tenant and deploying an application:

```bash
# 1. Create tenant
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "school-alpha",
    "resourceQuota": {
      "cpu": "2",
      "memory": "4Gi"
    }
  }'

# Wait a moment for namespace to be ready
sleep 2

# 2. Deploy application
curl -X POST http://localhost:3000/api/deployments/school-alpha/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "replicas": 2,
    "image": "localhost:32000/educationelly-graphql:latest",
    "env": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "PORT", "value": "4000"},
      {"name": "TENANT_ID", "value": "school-alpha"}
    ]
  }'

# Wait for deployment to roll out
sleep 10

# 3. Check status
curl http://localhost:3000/api/tenants/school-alpha

# 4. Get metrics
curl http://localhost:3000/api/tenants/school-alpha/metrics

# 5. Scale up
curl -X PATCH http://localhost:3000/api/deployments/school-alpha/educationelly-graphql/scale \
  -H "Content-Type: application/json" \
  -d '{"replicas": 3}'

# 6. Verify scaling
curl http://localhost:3000/api/tenants/school-alpha
```

## Error Responses

### Invalid Tenant Name

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{"tenantName": "Invalid_Name"}'
```

**Response (400):**
```json
{
  "error": "Invalid tenant name. Must be lowercase alphanumeric with hyphens only"
}
```

### Tenant Not Found

```bash
curl http://localhost:3000/api/tenants/non-existent-tenant
```

**Response (500):**
```json
{
  "error": "Failed to get tenant details: namespaces \"non-existent-tenant\" not found"
}
```

### Missing Required Fields

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response (400):**
```json
{
  "error": "Tenant name is required"
}
```

## Testing with HTTPie

If you prefer HTTPie over curl:

```bash
# List tenants
http GET localhost:3000/api/tenants

# Create tenant
http POST localhost:3000/api/tenants \
  tenantName=demo-school-c \
  resourceQuota:='{"cpu":"2","memory":"4Gi"}'

# Deploy app
http POST localhost:3000/api/deployments/demo-school-c/deploy \
  replicas:=2 \
  image=localhost:32000/educationelly-graphql:latest \
  env:='[{"name":"NODE_ENV","value":"production"}]'
```

## Using Postman

Import these endpoints into Postman:

1. Create a new collection: "Multi-Tenant Platform"
2. Add requests for each endpoint above
3. Set base URL as environment variable: `{{baseUrl}}` = `http://localhost:3000/api`
4. Use the JSON bodies provided above

## Rate Limiting

Currently, there are no rate limits. For production, consider implementing:
- Rate limiting middleware (express-rate-limit)
- Authentication tokens
- Per-tenant API quotas

## Authentication

The current API has no authentication. For production, add:
- JWT tokens
- API keys per tenant
- OAuth2/OIDC integration
- RBAC for different user roles
