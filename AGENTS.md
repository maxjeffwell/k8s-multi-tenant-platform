# AGENTS.md - Multi-Tenant Kubernetes Platform

# Project Overview

## Purpose
The Multi-Tenant Kubernetes Platform is a production-ready solution for deploying and managing isolated instances of the educationelly-graphql application across multiple tenants. Each tenant (school or educational district) receives their own dedicated, isolated environment with resource quotas, network isolation, and per-tenant databases.

## Target Audience
- Educational institutions (schools and districts)
- Organizations requiring isolated application deployments
- SaaS providers in the educational technology sector

## Key Objectives
- Provide complete namespace isolation between tenants
- Enforce resource quota management per tenant
- Implement network policy enforcement for security
- Maintain per-tenant database isolation
- Offer a web-based management dashboard
- Provide a RESTful API for programmatic management

## Core Features
- **One-click tenant provisioning**: Rapidly create isolated tenant environments
- **Dynamic deployment**: Deploy application instances with customizable configurations
- **Real-time monitoring**: Track resource usage and pod status per tenant
- **Automated network isolation**: Default-deny network policies with explicit allow rules
- **Scalable replica management**: Configure 1-10+ replicas per deployment
- **RESTful API**: Automate tenant and deployment operations programmatically

## Business Domain
**Domain**: Educational Technology
**Use Case**: SaaS platform providing isolated GraphQL application instances per tenant

## Deployment Model

### Control Plane
- **Express API Backend**: Handles tenant lifecycle management, Kubernetes orchestration, and monitoring
- **React Dashboard Frontend**: Provides web-based UI for platform administration

### Tenant Resources (Per Tenant)
- Dedicated Kubernetes namespace
- educationelly-graphql application pods
- MongoDB StatefulSet with persistent storage
- Service resources for load balancing
- Network policies for traffic isolation
- Resource quotas for CPU/memory limits

---

# Technology Stack

## Languages
- **JavaScript** (ES2020+)
  - Module System: ES Modules (ESM)
  - Used throughout backend and frontend

## Runtimes
- **Node.js** (v18+)
  - Required for both backend and frontend development

## Backend Framework
- **Express** (v5.1.0)
  - Purpose: RESTful API server
  - Handles all backend operations and Kubernetes orchestration

## Frontend Framework
- **React** (v19.2.0)
  - Purpose: Web-based management dashboard
  - Modern component-based UI

## Core Libraries

### Backend
- **@kubernetes/client-node** (v1.4.0) - Kubernetes API client for cluster management
- **axios** (v1.13.2) - HTTP client for API requests
- **cors** (v2.8.5) - CORS middleware for cross-origin requests
- **jsonwebtoken** (v9.0.2) - JWT authentication support
- **dotenv** (v17.2.3) - Environment variable management
- **digest-fetch** (v3.1.1) - HTTP digest authentication

### Frontend
- **react-router-dom** (v7.9.6) - Client-side routing
- **chart.js** (v4.5.1) - Data visualization and metrics display
- **react-chartjs-2** (v5.3.1) - React wrapper for Chart.js
- **axios** (v1.13.2) - HTTP client for API communication

## Build Tools
- **Vite** (v7.2.4) - Fast frontend build tool with HMR
- **ESLint** (v9.39.1) - Code linting and quality assurance

## Containerization
- **Docker** - Container images for backend and frontend
- **Docker Compose** - Local development orchestration

## Orchestration
- **Kubernetes (MicroK8s)** - Container orchestration and multi-tenant isolation
  - Provides namespace isolation, resource quotas, and network policies

## Databases
- **MongoDB (MongoDB Atlas)**
  - Per-tenant database isolation
  - Managed database service
  - Persistent storage via StatefulSets

## Monitoring
- **Prometheus** - Metrics collection and monitoring
- **Grafana** - Metrics visualization and custom dashboards

## Development Dependencies
- **nodemon** (v3.1.11) - Development hot-reload for backend

---

# Coding Standards

## Syntax Rules

### Modules
- **Use ES Modules (ESM) throughout the project**
  - All files use `import/export` syntax
  - `package.json` includes `"type": "module"`
  - Never use CommonJS `require()`

### Asynchronous Operations
- **Use async/await for asynchronous operations**
  - Prefer `async/await` over callbacks or raw promises
  - Handle errors with try/catch blocks

## Style Guidelines

### Architecture
- **Backend: Follow MVC pattern**
  - Controllers: Handle HTTP requests and responses
  - Services: Contain business logic and Kubernetes operations
  - Routes: Define API endpoints and route handlers
  - Config: Store configuration and initialization logic

- **Frontend: Component-based architecture**
  - Components: Reusable UI elements in `components/` directory
  - Pages: Full page components in `pages/` directory
  - Services: API client logic in `services/` directory

### Naming Conventions
- **camelCase**: Variables and functions
  - Example: `getTenantList`, `resourceQuota`
- **PascalCase**: React components and classes
  - Example: `TenantCard`, `DeploymentForm`
- **kebab-case**: Kubernetes resource names
  - Example: `school-a`, `tenant-namespace`

## Architecture Principles

### Separation of Concerns
- **Clear separation between presentation and business logic**
  - Controllers handle HTTP protocol concerns
  - Services handle Kubernetes operations and business logic
  - Components handle UI rendering
  - Never mix Kubernetes operations in controllers

### API Design
- **RESTful API design principles**
  - Use appropriate HTTP methods: GET, POST, PATCH, DELETE
  - Use plural nouns for resource endpoints: `/api/tenants`, `/api/deployments`
  - Include resource identifiers in URLs: `/api/tenants/:tenantName`
  - Return appropriate HTTP status codes: 200, 201, 400, 404, 500

### Configuration Management
- **Environment-based configuration**
  - Use `.env` files for environment-specific settings
  - Never commit secrets or credentials
  - Provide `.env.example` templates for all configuration
  - Access environment variables via `process.env`

## Security Rules

### Secrets Management
- **Never commit sensitive data**
  - Use `.env` files for local development
  - Add `.env` to `.gitignore`
  - Use Kubernetes Secrets for production deployments
  - Provide `.env.example` with placeholder values

### Input Validation
- **Validate all user inputs**
  - Validate tenant names (lowercase alphanumeric with hyphens)
  - Validate resource quotas (numeric values with units)
  - Validate deployment parameters (replica counts, image names)
  - Sanitize all inputs before passing to Kubernetes API

### Kubernetes Isolation
- **Enforce namespace isolation**
  - Each tenant must have a separate namespace
  - Apply network policies to every tenant namespace
  - Never allow cross-tenant communication by default
  - Implement RBAC with least privilege

## Kubernetes Best Practices

### Resource Management
- **Always set resource quotas for tenants**
  - Define CPU limits: `requests` and `limits`
  - Define memory limits: `requests` and `limits`
  - Set pod count limits
  - Set PVC count and storage limits

### Network Security
- **Apply network policies for tenant isolation**
  - Default-deny all ingress traffic
  - Explicitly allow necessary ingress rules
  - Allow egress to DNS (kube-dns/CoreDNS)
  - Restrict external API access as needed

### RBAC
- **Use service accounts with minimal permissions**
  - Create namespace-scoped roles for tenants
  - Use cluster-scoped roles only for control plane
  - Follow principle of least privilege
  - Regularly audit RBAC permissions

## Documentation

### Code Comments
- **Document complex Kubernetes operations**
  - Explain non-obvious API calls
  - Document resource quota calculations
  - Clarify network policy rules

### Project Documentation
- **Maintain comprehensive documentation**
  - Keep README.md current with setup instructions
  - Update ARCHITECTURE.md with design changes
  - Maintain API_EXAMPLES.md with working examples
  - Document all environment variables in .env.example

---

# Project Structure

```
.
|-- backend
|   |-- Dockerfile
|   |-- package.json
|   |-- package-lock.json
|   |-- restart.sh
|   `-- src
|       |-- config
|       |-- controllers
|       |   |-- databaseController.js
|       |   |-- deploymentController.js
|       |   |-- metricsController.js
|       |   `-- tenantController.js
|       |-- dashboards
|       |-- routes
|       |   |-- databaseRoutes.js
|       |   |-- deploymentRoutes.js
|       |   |-- grafanaRoutes.js
|       |   |-- metrics.js
|       |   |-- prometheusRoutes.js
|       |   `-- tenantRoutes.js
|       |-- server.js
|       `-- services
|           |-- atlasService.js
|           |-- ingressService.js
|           |-- k8sService.js
|           `-- prometheusService.js
|-- build-and-push.sh
|-- CONTAINERIZATION.md
|-- convert-to-esm.sh
|-- deploy-platform.sh
|-- docker-compose.yml
|-- DOCKER_HUB_UPDATE.md
|-- docs
|   |-- API_EXAMPLES.md
|   |-- ARCHITECTURE.md
|   |-- DOCKER_HUB_SETUP.md
|   `-- SETUP_GUIDE.md
|-- frontend
|   |-- Dockerfile
|   |-- eslint.config.js
|   |-- index.html
|   |-- nginx-compose.conf
|   |-- nginx.conf
|   |-- package.json
|   |-- package-lock.json
|   |-- public
|   |   |-- test.html
|   |   `-- vite.svg
|   |-- README.md
|   |-- src
|   |   |-- App.css
|   |   |-- App.jsx
|   |   |-- assets
|   |   |-- components
|   |   |-- index.css
|   |   |-- main.jsx
|   |   |-- pages
|   |   |-- services
|   |   `-- styles
|   `-- vite.config.js
|-- k8s-manifests
|   |-- base
|   |   |-- network-policy.yaml
|   |   `-- rbac.yaml
|   |-- platform
|   |   |-- backend-deployment.yaml
|   |   |-- frontend-deployment.yaml
|   |   |-- ingress.yaml
|   |   |-- namespace.yaml
|   |   `-- serviceaccount.yaml
|   `-- tenants
|       `-- example-tenant.yaml
|-- MONGODB_ATLAS_SETUP.md
|-- monitoring
|   |-- check-metrics.sh
|   |-- dashboards
|   |   `-- multi-tenant-overview.json
|   |-- import-dashboard.sh
|   |-- INGRESS-SETUP.md
|   |-- QUICKSTART.md
|   `-- README.md
|-- QUICKSTART_KUBECTL.md
`-- README.md
```

## Directory Structure Explanation

### Backend (`/backend`)
- **src/config**: Kubernetes client configuration and initialization
- **src/controllers**: Request handlers for API endpoints
  - `tenantController.js`: Tenant CRUD operations
  - `deploymentController.js`: Deployment management
  - `metricsController.js`: Resource metrics aggregation
  - `databaseController.js`: Database management operations
- **src/routes**: API route definitions
  - Maps HTTP endpoints to controller functions
  - Organized by resource type (tenants, deployments, metrics)
- **src/services**: Business logic and Kubernetes operations
  - `k8sService.js`: Core Kubernetes API interactions
  - `atlasService.js`: MongoDB Atlas API integration
  - `ingressService.js`: Ingress resource management
  - `prometheusService.js`: Metrics collection integration
- **src/dashboards**: Grafana dashboard configurations
- **server.js**: Express application entry point

### Frontend (`/frontend`)
- **src/components**: Reusable React components
- **src/pages**: Full page components
- **src/services**: API client for backend communication
- **src/styles**: CSS and styling files
- **public**: Static assets

### Kubernetes Manifests (`/k8s-manifests`)
- **base**: Cluster-wide resources (RBAC, network policies)
- **platform**: Control plane deployments (backend, frontend)
- **tenants**: Example tenant configurations

### Documentation (`/docs`)
- Architecture diagrams and explanations
- API usage examples
- Setup and configuration guides
- Docker Hub integration instructions

### Monitoring (`/monitoring`)
- Prometheus and Grafana setup scripts
- Dashboard configurations
- Metrics collection utilities

---

# External Resources

## Official Documentation

### Platform Documentation
- **Kubernetes Official Documentation**
  - URL: https://kubernetes.io/docs/
  - Category: Platform
  - Purpose: Core Kubernetes concepts, API reference, best practices

- **MicroK8s Documentation**
  - URL: https://microk8s.io/docs
  - Category: Platform
  - Purpose: Installation, configuration, and management of MicroK8s

### Framework Documentation
- **Express.js Documentation**
  - URL: https://expressjs.com/
  - Category: Framework
  - Purpose: Backend API development, middleware, routing

- **React Documentation**
  - URL: https://react.dev/
  - Category: Framework
  - Purpose: Frontend component development, hooks, best practices

- **Vite Documentation**
  - URL: https://vite.dev/
  - Category: Build Tool
  - Purpose: Frontend build configuration, optimization, plugins

### Library Documentation
- **Kubernetes JavaScript Client**
  - URL: https://github.com/kubernetes-client/javascript
  - Category: Library
  - Purpose: Kubernetes API interactions from Node.js

- **MongoDB Atlas Documentation**
  - URL: https://www.mongodb.com/docs/atlas/
  - Category: Database
  - Purpose: Database provisioning, management, connection strings

## Container Images

### Tenant Application Images
- **educationelly-graphql-server**
  - Registry: Docker Hub
  - Reference: `maxjeffwell/educationelly-graphql-server:latest`
  - Purpose: Backend GraphQL server for tenant applications

- **educationelly-graphql-client**
  - Registry: Docker Hub
  - Reference: `maxjeffwell/educationelly-graphql-client:latest`
  - Purpose: Frontend client for tenant applications

## External Services

### Cloud Services
- **MongoDB Atlas**
  - URL: https://cloud.mongodb.com/
  - Purpose: Managed MongoDB database service for tenants
  - Authentication: API key pair (public/private keys)

- **Docker Hub**
  - URL: https://hub.docker.com/u/maxjeffwell
  - Purpose: Container image registry for application images

## Required Tools

### Command-Line Tools
- **kubectl**
  - Purpose: Kubernetes command-line interface
  - Requirement: Must be configured to access MicroK8s cluster
  - Installation: Included with MicroK8s or standalone

- **Prometheus**
  - Purpose: Metrics collection and time-series database
  - Integration: Optional monitoring enhancement

- **Grafana**
  - Purpose: Metrics visualization and custom dashboards
  - Integration: Optional monitoring enhancement

## APIs

### Kubernetes API
- **Version**: v1
- **Purpose**: Cluster management and resource orchestration
- **Authentication**: Service account tokens, kubeconfig
- **Key Operations**: Create/read/update/delete namespaces, deployments, services, pods

### MongoDB Atlas API
- **Purpose**: Database provisioning and management
- **Authentication**: API key pair (public/private)
- **Key Operations**: Cluster management, user provisioning, connection string retrieval

---

# Additional Context

## Architectural Decisions

### Namespace-Based Isolation
**Rationale**: Kubernetes namespaces provide native, strong isolation with built-in RBAC and network policy support. This approach leverages Kubernetes' native multi-tenancy capabilities without requiring external tools or complex configurations.

### MicroK8s for Orchestration
**Rationale**: MicroK8s offers a lightweight, easy-to-setup Kubernetes distribution suitable for development environments and small-to-medium production deployments. It provides the full Kubernetes experience with minimal resource overhead.

### Per-Tenant MongoDB Instances
**Rationale**: Dedicated database instances per tenant ensure complete data isolation, enable independent scaling, support per-tenant backup/restore operations, and meet compliance requirements (GDPR, FERPA, HIPAA).

### Express.js Backend
**Rationale**: Express.js is fast, lightweight, has an extensive ecosystem, and benefits from excellent Kubernetes client library support. Its middleware-based architecture allows for flexible request handling and easy integration with authentication systems.

### React + Vite Frontend
**Rationale**: React 19 with Vite provides a modern development experience with fast build times, hot module replacement, and a component-based architecture that scales well for complex UIs.

### Docker Hub for Container Images
**Rationale**: Pre-built images on Docker Hub eliminate build requirements for end users, enabling immediate deployment without local build environments or CI/CD pipelines.

## Design Patterns

### MVC (Model-View-Controller)
- **Location**: Backend architecture
- **Implementation**: Controllers handle HTTP, Services contain business logic, Routes define endpoints

### Component-Based Architecture
- **Location**: Frontend React application
- **Implementation**: Reusable UI components, page-level components, separation of concerns

### Service Layer Pattern
- **Location**: Kubernetes operations abstraction
- **Implementation**: Services encapsulate all Kubernetes API interactions, providing clean interfaces for controllers

### Repository Pattern
- **Location**: Database and Kubernetes API interactions
- **Implementation**: Abstracted data access layer for both databases and Kubernetes resources

## Operational Considerations

### Security
- **RBAC Configuration**: Must be applied before platform deployment
- **Secrets Management**: Use Kubernetes Secrets or environment variables, never commit to version control
- **Network Isolation**: Default-deny network policies with explicit allow rules
- **Input Validation**: All user inputs must be validated before Kubernetes API calls

### Scalability
- **Horizontal Scaling**: Scale application pods (1-10+ replicas per tenant)
- **Vertical Scaling**: Adjust resource quotas per namespace
- **Tenant Scaling**: Add namespaces as needed (limited only by cluster capacity)
- **Cluster Scaling**: Add nodes to increase overall capacity

### Monitoring and Observability
- **Real-Time Monitoring**: Available through web dashboard
- **Prometheus Integration**: Optional advanced metrics collection
- **Grafana Dashboards**: Optional custom visualization and alerting
- **Resource Tracking**: Per-tenant CPU, memory, storage usage

### High Availability
- **Current State**: Single-instance architecture suitable for development
- **Production Recommendations**:
  - Deploy multiple API replicas (3+ instances)
  - Implement MongoDB ReplicaSets (3 nodes minimum)
  - Configure multi-node Kubernetes clusters
  - Add load balancer for API endpoints
  - Implement session affinity or stateless design

### Data Isolation and Compliance
- **Per-Tenant Namespaces**: Logical isolation boundary
- **Dedicated Databases**: Complete data separation
- **Network Policies**: Prevent cross-tenant communication
- **Compliance Ready**: Architecture supports GDPR, FERPA, HIPAA requirements
- **Audit Trail**: Kubernetes audit logs track all operations

### Disaster Recovery
- **Backup Strategy**:
  - MongoDB: Regular database backups per tenant
  - Kubernetes Configs: GitOps approach with version control
  - Persistent Volumes: Snapshot-based backups
- **Recovery Procedures**:
  - Namespace recovery from version-controlled manifests
  - Database restoration from backups
  - Full cluster recovery using Infrastructure as Code

## Future Roadmap

### Phase 2 Enhancements
- Service mesh integration (Istio) for advanced traffic management
- MongoDB Operator for automated database lifecycle management
- Automatic TLS with cert-manager and Let's Encrypt
- Enhanced Prometheus + Grafana monitoring stack

### Phase 3 Enhancements
- Multi-cluster federation for geographic distribution
- Automated backup and restore workflows
- Tenant usage metering and billing integration
- Self-service tenant portal
- GitOps-based deployment automation (ArgoCD/Flux)

### Phase 4 Enhancements
- AI-powered resource optimization
- Predictive auto-scaling based on usage patterns
- Automated incident response and self-healing
- Cost optimization recommendations

---

# Testing Instructions

## Backend Testing

### Prerequisites
```bash
# Ensure MicroK8s is running
microk8s status

# Verify kubectl access
kubectl cluster-info

# Apply RBAC permissions
kubectl apply -f k8s-manifests/base/rbac.yaml
```

### Run Backend Tests
```bash
cd backend
npm install
npm test
```

### Manual API Testing
```bash
# Start backend server
npm run dev

# Test health endpoint
curl http://localhost:3000/health

# Test tenant creation
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{"tenantName": "test-tenant", "resourceQuota": {"cpu": "2", "memory": "4Gi"}}'

# List tenants
curl http://localhost:3000/api/tenants
```

## Frontend Testing

### Prerequisites
```bash
# Ensure backend is running on localhost:3000
cd frontend
npm install
```

### Run Frontend Tests
```bash
npm test
```

### Manual UI Testing
```bash
# Start development server
npm run dev

# Access dashboard at http://localhost:5173
# Test tenant creation workflow
# Test deployment workflows
# Verify metrics display
```

## Integration Testing

### End-to-End Workflow Test
1. Start backend API
2. Start frontend dashboard
3. Create a test tenant via UI
4. Verify namespace creation: `kubectl get namespace`
5. Deploy application to tenant
6. Verify pods running: `kubectl get pods -n test-tenant`
7. Check resource quotas: `kubectl describe resourcequota -n test-tenant`
8. Verify network policies: `kubectl get networkpolicy -n test-tenant`
9. Delete tenant via UI
10. Verify namespace removal: `kubectl get namespace`

---

# Build Steps

## Development Environment Setup

### Prerequisites
- Ubuntu/Linux system with MicroK8s installed
- Node.js 18+ and npm installed
- kubectl configured for MicroK8s access
- MongoDB Atlas account (optional, for database features)

### Initial Setup

#### 1. Clone Repository
```bash
git clone <repository-url>
cd k8s-multi-tenant-platform
```

#### 2. Set Up Kubernetes RBAC
```bash
cd k8s-manifests/base
kubectl apply -f rbac.yaml
```

#### 3. Configure Backend
```bash
cd ../../backend
npm install
cp .env.example .env

# Edit .env file with your configuration
# Set MongoDB Atlas credentials if using database features
# Set Prometheus/Grafana URLs if using monitoring
```

#### 4. Configure Frontend
```bash
cd ../frontend
npm install
cp .env.example .env

# Edit .env file
# Set VITE_API_URL=http://localhost:3000 (or your backend URL)
```

### Running Development Servers

#### Start Backend
```bash
cd backend
npm run dev
# Backend will start on http://localhost:3000
```

#### Start Frontend (in separate terminal)
```bash
cd frontend
npm run dev
# Frontend will start on http://localhost:5173
```

### Access the Platform
- Dashboard: http://localhost:5173
- API: http://localhost:3000
- API Health Check: http://localhost:3000/health

## Production Build

### Build Docker Images

#### Build Backend Image
```bash
cd backend
docker build -t your-registry/platform-backend:latest .
docker push your-registry/platform-backend:latest
```

#### Build Frontend Image
```bash
cd frontend
docker build -t your-registry/platform-frontend:latest .
docker push your-registry/platform-frontend:latest
```

### Deploy to Kubernetes

#### Update Image References
Edit manifests in `k8s-manifests/platform/`:
- `backend-deployment.yaml`: Update image reference
- `frontend-deployment.yaml`: Update image reference

#### Deploy Platform
```bash
# Create platform namespace
kubectl apply -f k8s-manifests/platform/namespace.yaml

# Deploy backend
kubectl apply -f k8s-manifests/platform/backend-deployment.yaml

# Deploy frontend
kubectl apply -f k8s-manifests/platform/frontend-deployment.yaml

# Set up ingress (optional)
kubectl apply -f k8s-manifests/platform/ingress.yaml
```

### Verify Deployment
```bash
# Check pod status
kubectl get pods -n multi-tenant-platform

# Check services
kubectl get svc -n multi-tenant-platform

# Check logs
kubectl logs -f deployment/backend -n multi-tenant-platform
kubectl logs -f deployment/frontend -n multi-tenant-platform
```

## Docker Compose (Alternative for Development)

### Using Docker Compose
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

# API Reference Quick Guide

## Tenant Management

### Create Tenant
```http
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

### List All Tenants
```http
GET /api/tenants
```

### Get Tenant Details
```http
GET /api/tenants/:tenantName
```

### Get Tenant Metrics
```http
GET /api/tenants/:tenantName/metrics
```

### Delete Tenant
```http
DELETE /api/tenants/:tenantName
```

## Deployment Management

### Deploy Application
```http
POST /api/deployments/:tenantName/deploy
Content-Type: application/json

{
  "replicas": 2,
  "image": "maxjeffwell/educationelly-graphql-server:latest",
  "env": [
    {
      "name": "MONGO_URI",
      "value": "mongodb://..."
    }
  ]
}
```

### Scale Deployment
```http
PATCH /api/deployments/:tenantName/:deploymentName/scale
Content-Type: application/json

{
  "replicas": 3
}
```

---

# Troubleshooting Guide

## Common Issues

### Backend Cannot Connect to Kubernetes
- Verify kubeconfig: `kubectl config view`
- Check MicroK8s status: `microk8s status`
- Verify RBAC permissions are applied
- Check service account exists: `kubectl get sa multi-tenant-platform -n multi-tenant-platform`

### Pods Stuck in Pending
- Check resource quotas: `kubectl describe resourcequota -n <tenant-name>`
- View pod events: `kubectl describe pod <pod-name> -n <tenant-name>`
- Ensure sufficient cluster resources: `kubectl top nodes`
- Verify storage class exists: `kubectl get storageclass`

### Network Isolation Issues
- Verify network policies: `kubectl get networkpolicy -n <tenant-name>`
- Check if CoreDNS is running: `kubectl get pods -n kube-system`
- Test DNS resolution from pod: `kubectl exec -it <pod-name> -n <tenant-name> -- nslookup kubernetes.default`

### Frontend Cannot Reach API
- Verify backend is running: `curl http://localhost:3000/health`
- Check CORS configuration in backend
- Ensure `.env` has correct API URL
- Check browser console for errors
- Verify no firewall blocking requests

### Database Connection Issues
- Verify MongoDB Atlas credentials in `.env`
- Check connection string format
- Ensure IP whitelist includes your cluster IPs
- Test connection manually using mongo shell

---

# Contributing Guidelines

## Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes following coding standards
4. Test your changes locally
5. Commit with descriptive messages
6. Push to your fork
7. Submit a pull request

## Code Review Criteria
- Follows established coding standards
- Includes appropriate error handling
- Does not expose sensitive information
- Maintains separation of concerns
- Includes documentation for complex operations

## Commit Message Format
```
<type>: <subject>

<body>

<footer>
```

Types: feat, fix, docs, style, refactor, test, chore

---

# Security Considerations

## Production Deployment Security Checklist
- [ ] Change all default passwords
- [ ] Enable TLS for API communication
- [ ] Implement authentication middleware (JWT/OAuth)
- [ ] Use Kubernetes Secrets for sensitive data
- [ ] Review and customize network policies
- [ ] Enable Kubernetes audit logging
- [ ] Implement rate limiting on API endpoints
- [ ] Set up automated security scanning
- [ ] Configure pod security policies
- [ ] Enable RBAC audit logging
- [ ] Implement secret rotation
- [ ] Set up vulnerability scanning for container images

---

# Performance Optimization

## Backend Optimization
- Implement caching for frequently accessed Kubernetes resources
- Use connection pooling for MongoDB
- Batch Kubernetes API calls where possible
- Implement pagination for large result sets
- Use async/await efficiently to avoid blocking

## Frontend Optimization
- Lazy load components and routes
- Implement virtual scrolling for long lists
- Optimize bundle size with code splitting
- Cache API responses where appropriate
- Use React.memo for expensive components

## Kubernetes Optimization
- Set appropriate resource requests and limits
- Use horizontal pod autoscaling
- Implement pod disruption budgets
- Use node affinity for optimal placement
- Configure readiness and liveness probes

---

# Support and Resources

## Getting Help
- Check existing documentation in `/docs` directory
- Review Kubernetes logs: `kubectl logs <pod-name> -n <namespace>`
- Check API logs in backend console
- Review GitHub issues for similar problems

## Useful Commands

### Kubernetes Diagnostics
```bash
# View all resources in namespace
kubectl get all -n <namespace>

# Describe resource for details
kubectl describe <resource-type> <resource-name> -n <namespace>

# View logs
kubectl logs -f <pod-name> -n <namespace>

# Execute command in pod
kubectl exec -it <pod-name> -n <namespace> -- /bin/sh

# Check resource usage
kubectl top pods -n <namespace>
kubectl top nodes
```

### Platform Management
```bash
# Restart backend
cd backend && npm run dev

# Rebuild frontend
cd frontend && npm run build

# Check platform status
kubectl get pods -n multi-tenant-platform
```

---

**Last Updated**: 2025-12-08
**Platform Version**: 1.0.0
**Kubernetes API Version**: v1
**Minimum Node.js Version**: 18+
