# MongoDB Atlas Integration Guide

This guide explains how to configure and use MongoDB Atlas for per-tenant database isolation in the multi-tenant platform.

## Overview

Each tenant gets:
- **Isolated database** in a shared Atlas cluster (e.g., `db-school-a`, `db-school-b`)
- **Dedicated database user** with access only to their database
- **Secure connection string** stored in Kubernetes Secrets
- **Automatic provisioning** when creating tenants

## Architecture

```
MongoDB Atlas Cluster
├── db-school-a (accessible only by user-school-a)
├── db-school-b (accessible only by user-school-b)
└── db-school-c (accessible only by user-school-c)

Kubernetes Cluster
├── Namespace: school-a
│   ├── Secret: school-a-mongodb-secret (MONGO_URI, credentials)
│   └── Deployment: educationelly-graphql-server (uses secret via envFrom)
├── Namespace: school-b
│   ├── Secret: school-b-mongodb-secret
│   └── Deployment: educationelly-graphql-server
└── ...
```

## Prerequisites

1. MongoDB Atlas account (free tier works!)
2. Atlas cluster created and running
3. Network access configured (allow access from your Kubernetes cluster IPs)

## Setup Instructions

### 1. Create MongoDB Atlas Cluster

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a new project (e.g., "educationelly-platform")
3. Create a cluster (M0 Free tier is sufficient for testing)
4. Wait for cluster to deploy (~5-10 minutes)

### 2. Configure Network Access

1. In Atlas, go to **Network Access**
2. Click **Add IP Address**
3. Add your Kubernetes cluster's external IPs or use `0.0.0.0/0` for testing (NOT recommended for production)
4. Click **Confirm**

### 3. Create API Keys

1. Click your organization name (top left)
2. Go to **Access Manager** → **API Keys**
3. Click **Create API Key**
4. Set permissions: **Project Owner** (required for creating database users)
5. **IMPORTANT**: Copy both the **Public Key** and **Private Key** - the private key is only shown once!
6. Add your IP address to the API key access list if prompted

### 4. Get Cluster Information

1. In Atlas, go to **Database** → **Clusters**
2. Click **Connect** on your cluster
3. Choose **Connect your application**
4. Copy the connection string, it looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/
   ```
5. Extract the cluster URL (the part after `@` and before `/`):
   ```
   cluster0.xxxxx.mongodb.net
   ```

### 5. Get Project ID

1. In Atlas, go to **Project Settings** (gear icon)
2. Copy the **Project ID** (looks like: `507f1f77bcf86cd799439011`)

### 6. Configure Backend Environment

Edit `/backend/.env` and add:

```bash
# MongoDB Atlas Configuration
ATLAS_PUBLIC_KEY=your_public_key_here
ATLAS_PRIVATE_KEY=your_private_key_here
ATLAS_PROJECT_ID=your_project_id_here
ATLAS_CLUSTER_NAME=Cluster0
ATLAS_CLUSTER_URL=cluster0.xxxxx.mongodb.net
```

**Example:**
```bash
ATLAS_PUBLIC_KEY=abcdefgh
ATLAS_PRIVATE_KEY=12345678-90ab-cdef-1234-567890abcdef
ATLAS_PROJECT_ID=507f1f77bcf86cd799439011
ATLAS_CLUSTER_NAME=Cluster0
ATLAS_CLUSTER_URL=cluster0.ab1cd.mongodb.net
```

### 7. Test the Configuration

Start the backend:
```bash
cd backend
npm run dev
```

Test Atlas connection:
```bash
curl http://localhost:3000/api/database/test
```

Expected response:
```json
{
  "success": true,
  "message": "Successfully connected to MongoDB Atlas",
  "project": "educationelly-platform"
}
```

## Usage

### Automatic Database Provisioning

When you create a tenant, a database is automatically provisioned:

```bash
POST http://localhost:3000/api/tenants
Content-Type: application/json

{
  "tenantName": "school-a",
  "resourceQuota": {
    "cpu": "2",
    "memory": "4Gi"
  }
}
```

Response:
```json
{
  "message": "Tenant and database created successfully",
  "tenant": {
    "name": "school-a",
    "createdAt": "2025-11-20T12:00:00Z"
  },
  "database": {
    "created": true,
    "name": "db-school-a",
    "username": "user-school-a",
    "secretName": "school-a-mongodb-secret"
  }
}
```

### Manual Database Management

#### Create Database Manually
```bash
POST http://localhost:3000/api/database/school-a/database
```

#### Check Database Status
```bash
GET http://localhost:3000/api/database/school-a/database/status
```

#### Delete Database
```bash
DELETE http://localhost:3000/api/database/school-a/database
```

### Deploy Application with Database

Once a tenant has a database, deploy the application:

```bash
POST http://localhost:3000/api/deployments/school-a/deploy
Content-Type: application/json

{
  "replicas": 2,
  "serverImage": "maxjeffwell/educationelly-graphql-server:latest",
  "clientImage": "maxjeffwell/educationelly-graphql-client:latest"
}
```

The server deployment automatically receives these environment variables from the Kubernetes Secret:
- `MONGO_URI` - Full connection string
- `MONGO_USERNAME` - Database username
- `MONGO_PASSWORD` - Database password
- `MONGO_DATABASE` - Database name

### Disable Auto-Database Creation

To create a tenant without a database:

```bash
POST http://localhost:3000/api/tenants
Content-Type: application/json

{
  "tenantName": "school-b",
  "createDatabase": false
}
```

## API Reference

### Test Atlas Connection
```
GET /api/database/test
```

### Create Database for Tenant
```
POST /api/database/:tenantName/database
```

### Get Database Status
```
GET /api/database/:tenantName/database/status
```

### Delete Database
```
DELETE /api/database/:tenantName/database
```

## Security Best Practices

### 1. Secure API Keys
- Store API keys in environment variables, never commit to Git
- Use separate API keys for development and production
- Rotate keys regularly

### 2. Network Security
- In production, whitelist only your Kubernetes cluster IPs
- Never use `0.0.0.0/0` in production
- Consider using VPC Peering or Private Endpoints

### 3. Database User Permissions
- Each tenant user has access ONLY to their database
- Users cannot access other tenants' databases
- Consider read-only replicas for reporting

### 4. Connection String Security
- Connection strings are stored in Kubernetes Secrets
- Secrets are base64-encoded (NOT encrypted by default)
- Enable Kubernetes encryption at rest for production
- Never log connection strings

### 5. Backup Strategy
- Enable automatic backups in Atlas
- Atlas Free tier includes basic snapshots
- Paid tiers offer point-in-time recovery

## Troubleshooting

### "MongoDB Atlas is not configured"
- Check that all 5 Atlas environment variables are set in `.env`
- Restart the backend after updating `.env`

### "Failed to connect to Atlas"
- Verify API keys are correct
- Check that API key has Project Owner permissions
- Ensure your IP is whitelisted in the API key access list

### "Network timeout" or "Connection refused"
- Check Network Access in Atlas
- Verify cluster is running and healthy
- Ensure Kubernetes cluster IPs are whitelisted

### "Unauthorized" or "Authentication failed"
- Verify ATLAS_PROJECT_ID matches your project
- Check ATLAS_CLUSTER_NAME matches your cluster name
- Ensure API key has correct permissions

### Database user creation fails
- Check Atlas user limit (100 users per project in free tier)
- Verify cluster is not in maintenance mode
- Check Atlas status page for outages

### Pods can't connect to database
- Verify secret exists: `kubectl get secret school-a-mongodb-secret -n school-a`
- Check secret contents: `kubectl describe secret school-a-mongodb-secret -n school-a`
- Verify pods have envFrom configured: `kubectl get deployment educationelly-graphql-server -n school-a -o yaml`

## Cost Optimization

### Free Tier Limits (M0)
- 512 MB storage
- Shared RAM
- Shared vCPUs
- 100 database users max
- Perfect for testing and small deployments

### Scaling Up
- M10+ clusters recommended for production
- Dedicated resources
- Auto-scaling available
- Backup and recovery features

### Multi-Region Deployment
- Atlas supports global clusters
- Automatic failover
- Geo-distributed reads

## Monitoring

### Atlas Metrics
- View cluster metrics in Atlas dashboard
- Set up alerts for CPU, memory, connections
- Monitor slow queries

### Application-Level Monitoring
- Log connection errors in your application
- Monitor query performance
- Track database connection pool usage

## Migration from Local MongoDB

If you're migrating from local MongoDB StatefulSets:

1. Export existing data: `mongodump --uri="mongodb://..."`
2. Create tenant database in Atlas
3. Import data: `mongorestore --uri="mongodb+srv://..."`
4. Update deployment to use new connection string
5. Delete StatefulSet and PVC

## Support

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Atlas Admin API Reference](https://www.mongodb.com/docs/atlas/reference/api-resources-spec/)
- [MongoDB Community Forums](https://www.mongodb.com/community/forums/)

## Next Steps

- ✅ Configure Atlas and test connection
- ✅ Create a test tenant with database
- ✅ Deploy application and verify database access
- 🔄 Update frontend to show database status
- 🔄 Set up monitoring and alerts
- 🔄 Configure backup strategy
