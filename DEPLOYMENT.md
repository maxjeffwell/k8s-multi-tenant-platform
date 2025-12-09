# TenantFlow Deployment Guide

## Overview

TenantFlow has been updated with multi-database support. Users can now choose from 5 different database backends when creating tenants:

1. **Test Database** - MongoDB development/testing environment
2. **Educationelly DB** - MongoDB Atlas production database
3. **Spaced Repetition DB** - MongoDB Atlas cluster
4. **PostgreSQL AWS RDS** - PostgreSQL production database on AWS
5. **Neon PostgreSQL** - Serverless PostgreSQL on Neon

## What Changed

### Backend Changes
- **File**: `backend/src/config/databases.js`
- Added 3 new database configurations: spaced-repetition, postgres-aws, and neondb
- All databases now load credentials from environment variables

### Docker Images
- **Backend Image**: Rebuilt with updated database configuration
- **File**: `/tmp/tenantflow-backend.tar` (needs to be transferred to VPS)

### Kubernetes Manifests
- **k8s-db-secrets.yaml**: Contains all database credentials as Kubernetes secret
- **k8s-deployment.yaml**: Updated deployment with all database environment variables
- All environment variables are now sourced from the `tenantflow-db-credentials` secret

## Deployment Steps

### Option 1: Using the Deployment Script (Recommended)

1. Transfer the backend image to the VPS:
   ```bash
   scp /tmp/tenantflow-backend.tar root@86.48.29.183:/tmp/
   ```

2. Transfer the deployment files to the VPS:
   ```bash
   scp k8s-db-secrets.yaml k8s-deployment.yaml deploy-to-vps.sh root@86.48.29.183:~/
   ```

3. SSH to the VPS and run the deployment script:
   ```bash
   ssh root@86.48.29.183
   cd ~
   ./deploy-to-vps.sh
   ```

### Option 2: Manual Deployment

1. Transfer files to VPS:
   ```bash
   scp /tmp/tenantflow-backend.tar k8s-db-secrets.yaml k8s-deployment.yaml root@86.48.29.183:~/
   ```

2. SSH to VPS:
   ```bash
   ssh root@86.48.29.183
   ```

3. Apply database secrets:
   ```bash
   kubectl apply -f ~/k8s-db-secrets.yaml
   ```

4. Import backend image:
   ```bash
   sudo k3s ctr images import /tmp/tenantflow-backend.tar
   ```

5. Apply deployment:
   ```bash
   kubectl apply -f ~/k8s-deployment.yaml
   ```

6. Wait for rollout:
   ```bash
   kubectl rollout status deployment/tenantflow-backend -n default
   kubectl rollout status deployment/tenantflow-frontend -n default
   ```

## Verification

### Check Pods
```bash
kubectl get pods -n default -l app=tenantflow
```

Expected output:
```
NAME                                  READY   STATUS    RESTARTS   AGE
tenantflow-backend-xxxxxxxxxx-xxxxx  1/1     Running   0          1m
tenantflow-backend-xxxxxxxxxx-xxxxx  1/1     Running   0          1m
tenantflow-frontend-xxxxxxxxxx-xxxxx 1/1     Running   0          1m
tenantflow-frontend-xxxxxxxxxx-xxxxx 1/1     Running   0          1m
```

### Check Services
```bash
kubectl get svc -n default -l app=tenantflow
```

### Check Ingress
```bash
kubectl get ingress -n default -l app=tenantflow
```

### Test Database Options API
```bash
curl https://tenantflow.el-jefe.me/api/database/options
```

Expected output:
```json
[
  {
    "key": "test",
    "displayName": "Test Database",
    "description": "Development/testing environment"
  },
  {
    "key": "educationelly-db",
    "displayName": "Educationelly DB",
    "description": "Production database"
  },
  {
    "key": "spaced-repetition",
    "displayName": "Spaced Repetition DB",
    "description": "Spaced repetition application database"
  },
  {
    "key": "postgres-aws",
    "displayName": "PostgreSQL AWS RDS",
    "description": "PostgreSQL production database on AWS"
  },
  {
    "key": "neondb",
    "displayName": "Neon PostgreSQL",
    "description": "Serverless PostgreSQL on Neon"
  }
]
```

## Troubleshooting

### Pods not starting
```bash
kubectl describe pod -l app=tenantflow -n default
kubectl logs -f deployment/tenantflow-backend -n default
```

### Secret not found error
Make sure the secret was created:
```bash
kubectl get secret tenantflow-db-credentials -n default
```

If missing, apply it:
```bash
kubectl apply -f k8s-db-secrets.yaml
```

### Image pull errors
Verify the image was imported:
```bash
sudo k3s crictl images | grep tenantflow-backend
```

If not found, import it:
```bash
sudo k3s ctr images import /tmp/tenantflow-backend.tar
```

### Ingress not working
Check Traefik status:
```bash
kubectl get pods -n kube-system | grep traefik
```

Check ingress configuration:
```bash
kubectl describe ingress tenantflow-ingress -n default
```

## Database Configuration Notes

### MongoDB Databases
- **test**: Placeholder credentials (update in secret)
- **educationelly-db**: Uses MongoDB Atlas API for provisioning
- **spaced-repetition**: Uses MongoDB Atlas API for provisioning

### PostgreSQL Databases
- **postgres-aws**: AWS RDS PostgreSQL instance
- **neondb**: Neon serverless PostgreSQL

### Security Notes
- All credentials are stored in Kubernetes secrets
- Secrets are base64 encoded (not encrypted)
- For production, consider using external secret management (e.g., Sealed Secrets, External Secrets Operator)
- MongoDB Atlas IP access list should include VPS IP: `86.48.29.183`

## Next Steps

1. Update MongoDB credentials in `k8s-db-secrets.yaml` for test and educationelly-db if needed
2. Test tenant creation with each database backend
3. Verify MongoDB Atlas IP allowlist includes VPS IP
4. Set up monitoring alerts for database connection failures
5. Configure backup strategies for each database

## Integration with Portfolio Platforms

TenantFlow is labeled with `portfolio: "true"` and will be automatically discovered by:
- **Portfolio Orchestration Platform**: Real-time monitoring dashboard
- **Podrick (DevOps Manager)**: GitOps CI/CD platform

No additional configuration needed for integration.
