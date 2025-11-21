# Tenant Ingress Setup

Automatic ingress creation has been implemented for the multi-tenant platform. Each tenant automatically gets their own URLs when applications are deployed.

## How It Works

When you deploy an application to a tenant, the system automatically creates:

1. **Client Ingress** - For the frontend application
   - URL Pattern: `http://[tenant-name].192.168.50.119.nip.io`
   - Example: `http://test-school.192.168.50.119.nip.io`

2. **Server Ingress** - For the GraphQL API
   - URL Pattern: `http://[tenant-name]-api.192.168.50.119.nip.io`
   - Example: `http://test-school-api.192.168.50.119.nip.io`

## nip.io DNS

We're using **nip.io** for automatic DNS resolution. This is a free wildcard DNS service that:
- Resolves `*.192.168.50.119.nip.io` to `192.168.50.119`
- Works without any DNS configuration
- Perfect for local development and testing

## Configuration

The ingress domain is configured in `/backend/.env`:

```env
INGRESS_DOMAIN=192.168.50.119.nip.io
INGRESS_CLASS=nginx
```

### Change the Domain

To use a custom domain (for production):

1. Update `INGRESS_DOMAIN` in `/backend/.env`:
   ```env
   INGRESS_DOMAIN=yourdomain.com
   ```

2. Set up DNS records:
   - Create a wildcard A record: `*.yourdomain.com` → Your cluster IP
   - Or create individual A records for each tenant

3. For SSL/TLS, install cert-manager and configure Let's Encrypt

## Tenant Workflow

### 1. Create a Tenant
```bash
POST /api/tenants
{
  "tenantName": "my-school",
  "resourceQuota": {
    "cpu": "2",
    "memory": "4Gi"
  }
}
```

### 2. Deploy Application
```bash
POST /api/deployments/my-school/deploy
{
  "replicas": 1
}
```

This automatically creates:
- Deployments (server & client)
- Services (server & client)
- **Ingress resources** (new!)

### 3. Access URLs

The tenant details will now include ingress information:

```json
{
  "ingresses": [
    {
      "name": "my-school-client-ingress",
      "type": "client",
      "host": "my-school.192.168.50.119.nip.io",
      "url": "http://my-school.192.168.50.119.nip.io",
      "createdAt": "2025-11-21T..."
    },
    {
      "name": "my-school-server-ingress",
      "type": "server",
      "host": "my-school-api.192.168.50.119.nip.io",
      "url": "http://my-school-api.192.168.50.119.nip.io",
      "createdAt": "2025-11-21T..."
    }
  ]
}
```

### 4. View in UI

In the tenant card, click to expand and you'll see an **"Access URLs"** section with:
- 🌐 Frontend - Clickable link to the client application
- ⚡ API - Clickable link to the GraphQL server

## Testing

### Check Ingress Creation

```bash
# List all ingresses for a tenant
kubectl get ingress -n my-school

# Check ingress details
kubectl describe ingress my-school-client-ingress -n my-school
```

### Test URL Access

```bash
# Test client URL
curl http://my-school.192.168.50.119.nip.io

# Test server URL
curl http://my-school-api.192.168.50.119.nip.io
```

### Verify in Browser

Open the tenant URLs in your browser:
- Frontend: `http://[tenant-name].192.168.50.119.nip.io`
- API: `http://[tenant-name]-api.192.168.50.119.nip.io`

## Ingress Controller

Your cluster is using **nginx** as the ingress controller. The controller is configured to:
- Listen on all interfaces
- Route traffic based on hostname
- Handle HTTP traffic (port 80)

### Check Ingress Controller

```bash
# Check ingress controller pods
kubectl get pods -n ingress-nginx

# Check ingress class
kubectl get ingressclass
```

## Deletion

When you delete a tenant, the ingresses are automatically cleaned up along with all other resources.

```bash
DELETE /api/tenants/my-school
```

This removes:
- Namespace
- Deployments & Services
- **Ingress resources**
- Database user (if configured)

## Production Considerations

### 1. SSL/TLS Certificates

For production, enable HTTPS with cert-manager:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

Then update the ingress service to add TLS annotations.

### 2. Custom Domain

Set up DNS for your domain:

**Option A - Wildcard DNS:**
```
*.yourdomain.com    A    your-cluster-ip
```

**Option B - Individual Records:**
```
tenant1.yourdomain.com    A    your-cluster-ip
tenant2.yourdomain.com    A    your-cluster-ip
```

### 3. Rate Limiting

Add rate limiting to prevent abuse:

```yaml
annotations:
  nginx.ingress.kubernetes.io/rate-limit: "100"
  nginx.ingress.kubernetes.io/rate-limit-burst: "200"
```

### 4. Authentication

Add basic auth or OAuth to ingresses:

```yaml
annotations:
  nginx.ingress.kubernetes.io/auth-type: basic
  nginx.ingress.kubernetes.io/auth-secret: basic-auth
  nginx.ingress.kubernetes.io/auth-realm: 'Authentication Required'
```

## Troubleshooting

### Ingress Not Working

**Check if ingress was created:**
```bash
kubectl get ingress -n <tenant-name>
```

**Check ingress status:**
```bash
kubectl describe ingress <ingress-name> -n <tenant-name>
```

**Expected output should include:**
- Rules with correct host and paths
- Backend service configured
- Address assigned (may take a minute)

### DNS Not Resolving

**Test nip.io resolution:**
```bash
nslookup test.192.168.50.119.nip.io
```

**Should return:**
```
Server:		8.8.8.8
Address:	8.8.8.8#53

Non-authoritative answer:
Name:	test.192.168.50.119.nip.io
Address: 192.168.50.119
```

### 502 Bad Gateway

This usually means the backend service isn't ready:

1. Check pods are running:
   ```bash
   kubectl get pods -n <tenant-name>
   ```

2. Check service endpoints:
   ```bash
   kubectl get endpoints -n <tenant-name>
   ```

3. Check pod logs:
   ```bash
   kubectl logs <pod-name> -n <tenant-name>
   ```

### Wrong IP Address

If your node IP changed, update the .env file:

```bash
# Get current node IP
kubectl get nodes -o wide

# Update backend/.env
INGRESS_DOMAIN=<new-ip>.nip.io
```

Then restart the backend server.

## API Reference

### Get Tenant Ingresses

```bash
GET /api/tenants/:tenantName

Response includes:
{
  "ingresses": [
    {
      "name": "tenant-client-ingress",
      "type": "client",
      "host": "tenant.192.168.50.119.nip.io",
      "url": "http://tenant.192.168.50.119.nip.io",
      "createdAt": "2025-11-21T..."
    }
  ]
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Ingress Controller                  │
│                     (nginx)                          │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
    ┌──────────┴────────┐  ┌──────┴──────────┐
    │  Client Ingress   │  │  Server Ingress │
    │  tenant.nip.io    │  │ tenant-api.nip.io│
    └──────────┬────────┘  └──────┬───────────┘
               │                  │
    ┌──────────┴────────┐  ┌──────┴───────────┐
    │  Client Service   │  │  Server Service  │
    │  (port 3000)      │  │  (port 4000)     │
    └──────────┬────────┘  └──────┬───────────┘
               │                  │
    ┌──────────┴────────┐  ┌──────┴───────────┐
    │   Client Pods     │  │   Server Pods    │
    │  (educationelly)  │  │  (educationelly) │
    └───────────────────┘  └──────────────────┘
```

## Next Steps

1. Deploy an application to a tenant
2. View the ingress URLs in the tenant card
3. Click the URLs to access the applications
4. Test the GraphQL API endpoint
5. Consider setting up SSL/TLS for production

## Additional Resources

- [nip.io Documentation](https://nip.io/)
- [Kubernetes Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
