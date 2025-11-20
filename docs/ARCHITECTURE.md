# Architecture Documentation

## System Overview

The Multi-Tenant Kubernetes Platform is designed to provide isolated, scalable hosting for multiple instances of the educationelly-graphql application. Each tenant (school/district) receives their own dedicated namespace with resource quotas, network isolation, and per-tenant databases.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         External Users/Clients                           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   Ingress Controller    │
                    │  (Tenant Routing)       │
                    └────────────┬────────────┘
                                 │
┌────────────────────────────────┴────────────────────────────────────────┐
│                         Kubernetes Cluster                               │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    Control Plane Namespace                      │    │
│  │  ┌──────────────────┐         ┌──────────────────┐            │    │
│  │  │  Express API     │◄────────┤   React UI       │            │    │
│  │  │  (Backend)       │         │   (Frontend)     │            │    │
│  │  └────────┬─────────┘         └──────────────────┘            │    │
│  │           │                                                     │    │
│  │           │ Kubernetes API Client                              │    │
│  └───────────┼─────────────────────────────────────────────────────┘    │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                    Kubernetes API Server                       │     │
│  └───────────────────────────────────────────────────────────────┘     │
│              │                                                           │
│  ┌───────────┴──────────────┬──────────────────┬──────────────────┐   │
│  │                          │                  │                   │   │
│  │  Tenant Namespace A      │  Tenant NS B     │  Tenant NS C      │   │
│  │  ┌─────────────────┐     │  ┌────────────┐  │  ┌────────────┐  │   │
│  │  │ educationelly   │     │  │educationelly│  │  │educationelly│  │   │
│  │  │ -graphql        │     │  │-graphql     │  │  │-graphql     │  │   │
│  │  │ Deployment      │     │  │Deployment   │  │  │Deployment   │  │   │
│  │  │ (Pods 1-N)      │     │  │(Pods 1-N)   │  │  │(Pods 1-N)   │  │   │
│  │  └────────┬────────┘     │  └──────┬──────┘  │  └──────┬──────┘  │   │
│  │           │              │         │         │         │         │   │
│  │  ┌────────▼────────┐     │  ┌──────▼──────┐  │  ┌──────▼──────┐  │   │
│  │  │ MongoDB         │     │  │MongoDB      │  │  │MongoDB      │  │   │
│  │  │ StatefulSet     │     │  │StatefulSet  │  │  │StatefulSet  │  │   │
│  │  │ (Persistent)    │     │  │(Persistent) │  │  │(Persistent) │  │   │
│  │  └─────────────────┘     │  └─────────────┘  │  └─────────────┘  │   │
│  │                          │                  │                   │   │
│  │  Resource Quotas         │  Resource Quotas │  Resource Quotas  │   │
│  │  Network Policies        │  Network Policies│  Network Policies │   │
│  └──────────────────────────┴──────────────────┴──────────────────────┘   │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │               Shared Cluster Services                          │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │      │
│  │  │ CoreDNS  │  │ Storage  │  │ Metrics  │  │ Logging  │     │      │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │      │
│  └───────────────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Control Plane

#### Backend API (Express.js)
- **Purpose**: RESTful API for tenant management and Kubernetes orchestration
- **Key Responsibilities**:
  - Tenant lifecycle management (create, read, delete)
  - Deployment orchestration
  - Resource monitoring and metrics
  - Kubernetes API interaction
- **Technology**: Node.js, Express, @kubernetes/client-node
- **Port**: 3000 (configurable)

#### Frontend Dashboard (React + Vite)
- **Purpose**: Web-based UI for platform administration
- **Key Features**:
  - Tenant creation and management
  - Deployment configuration
  - Real-time resource monitoring
  - Pod status visualization
- **Technology**: React 18, Vite, Axios
- **Port**: 5173 (development), configurable for production

### 2. Tenant Namespaces

Each tenant namespace is completely isolated and contains:

#### Application Layer
- **educationelly-graphql Deployment**
  - Configurable replica count (1-10)
  - Resource limits (CPU/Memory)
  - Environment variables per tenant
  - Health checks (liveness/readiness)
  - Rolling update strategy

#### Data Layer
- **MongoDB StatefulSet**
  - Persistent storage (PVC)
  - Per-tenant database isolation
  - Configurable storage size
  - Automatic pod identity
  - Data persistence across restarts

#### Network Layer
- **Service Resources**
  - ClusterIP services for internal communication
  - Load balancing across pods
  - DNS-based service discovery
  - Port mapping

#### Security & Isolation
- **Network Policies**
  - Namespace-level traffic isolation
  - Controlled ingress/egress rules
  - DNS access allowed
  - External API access configurable

- **Resource Quotas**
  - CPU limits per namespace
  - Memory limits per namespace
  - PVC count limits
  - Pod count limits

### 3. Kubernetes Infrastructure

#### API Server
- Central control point
- Authentication and authorization
- RBAC enforcement
- API endpoint for all operations

#### Scheduler
- Pod placement decisions
- Resource availability checks
- Node selection

#### Controller Manager
- Deployment controller
- ReplicaSet controller
- Service controller
- Namespace controller

#### etcd
- Cluster state storage
- Configuration data
- Service discovery data

## Data Flow

### Tenant Creation Flow

```
User (UI) → Frontend → Backend API → K8s API Server
                                        ↓
                                    Create Namespace
                                        ↓
                                   Apply ResourceQuota
                                        ↓
                                  Apply NetworkPolicy
                                        ↓
                                   Return Success
                                        ↓
Backend API → Frontend → User (Updated List)
```

### Deployment Flow

```
User (UI) → Frontend → Backend API
                         ↓
                   Validate Config
                         ↓
                   K8s API Server
                         ↓
               Create Deployment Object
                         ↓
               Create Service Object
                         ↓
            Scheduler Assigns Pods to Nodes
                         ↓
                Kubelet Pulls Images
                         ↓
                  Start Containers
                         ↓
              Health Checks Pass
                         ↓
          Service Endpoints Updated
                         ↓
Backend API → Frontend → User (Deployment Status)
```

### Monitoring Flow

```
Frontend (Polling) → Backend API
                         ↓
                   K8s API Server
                         ↓
          Query Namespace Resources
                         ↓
          Query Pod Status
                         ↓
          Query ResourceQuota Usage
                         ↓
          Aggregate Metrics
                         ↓
Backend API → Frontend → User (Dashboard Update)
```

## Security Architecture

### Multi-Layer Security

1. **Namespace Isolation**
   - Logical boundary per tenant
   - Resource separation
   - RBAC scoped to namespaces

2. **Network Policies**
   - Default deny all traffic
   - Explicit allow rules
   - Namespace-scoped policies
   - Prevents cross-tenant communication

3. **Resource Quotas**
   - CPU limits prevent resource hogging
   - Memory limits prevent OOM
   - Storage quotas prevent disk exhaustion
   - Pod limits prevent fork bombs

4. **RBAC (Role-Based Access Control)**
   - Service accounts per component
   - Least privilege principle
   - Namespace-scoped roles
   - Cluster-scoped roles for control plane

5. **Pod Security**
   - Non-root user execution (recommended)
   - Read-only root filesystem (recommended)
   - No privilege escalation
   - Seccomp profiles

## Scalability

### Horizontal Scaling

- **Application Pods**: Scale replicas per deployment (1-10+)
- **Tenants**: Add namespaces as needed (limited by cluster capacity)
- **Cluster**: Add nodes to increase capacity

### Vertical Scaling

- **Resource Quotas**: Adjust per-tenant limits
- **Pod Resources**: Increase CPU/memory requests/limits
- **Database**: Scale MongoDB replicas or use sharding

### Performance Considerations

- **API Rate Limiting**: Protect control plane from abuse
- **Caching**: Frontend caches tenant list
- **Batch Operations**: Group K8s API calls where possible
- **Async Processing**: Long-running operations handled asynchronously

## High Availability

### Current Architecture
- Single control plane instance
- Single MongoDB instance per tenant
- No redundancy

### Recommended HA Setup

1. **Control Plane HA**
   - Multiple API replicas (3+)
   - Load balancer for API
   - Session affinity or stateless design

2. **Database HA**
   - MongoDB ReplicaSets (3 nodes)
   - Automatic failover
   - Data replication

3. **Application HA**
   - Multiple pod replicas (2+)
   - Anti-affinity rules (spread across nodes)
   - Health checks for automatic recovery

4. **Cluster HA**
   - Multiple master nodes
   - Multiple worker nodes
   - Distributed etcd cluster

## Monitoring and Observability

### Current Capabilities
- Real-time pod status
- Resource quota usage
- Basic metrics per tenant

### Recommended Additions

1. **Metrics**
   - Prometheus for metrics collection
   - Grafana for visualization
   - Custom metrics from apps
   - Resource usage trends

2. **Logging**
   - Centralized log aggregation (ELK/EFK)
   - Per-tenant log segregation
   - Log retention policies
   - Search and alerting

3. **Tracing**
   - Distributed tracing (Jaeger)
   - Request flow visualization
   - Performance bottleneck identification

4. **Alerting**
   - Resource threshold alerts
   - Pod crash alerts
   - Quota exhaustion warnings
   - Automated remediation

## Disaster Recovery

### Backup Strategy
- **MongoDB**: Regular database backups per tenant
- **Kubernetes Configs**: GitOps approach, version controlled
- **Persistent Volumes**: Snapshot-based backups

### Recovery Procedures
- **Namespace Recovery**: Recreate from manifests
- **Database Recovery**: Restore from backups
- **Full Cluster Recovery**: Infrastructure as Code (Terraform/Ansible)

## Future Enhancements

### Phase 2
- Service mesh (Istio) for advanced traffic management
- MongoDB Operator for automated database management
- Ingress with automatic TLS (cert-manager)
- Prometheus + Grafana monitoring stack

### Phase 3
- Multi-cluster federation
- Automated backup and restore
- Tenant usage metering and billing
- Self-service tenant portal
- GitOps deployment automation

### Phase 4
- AI-powered resource optimization
- Predictive scaling
- Automated incident response
- Cost optimization recommendations

## Technology Decisions

### Why MicroK8s?
- Lightweight and easy to set up
- Perfect for development and small deployments
- Can scale to production
- Minimal resource overhead

### Why Namespace Isolation?
- Native Kubernetes construct
- Strong isolation guarantees
- RBAC and network policy support
- Easy to manage and monitor

### Why Per-Tenant Databases?
- Data isolation and privacy
- Independent scaling
- Backup/restore per tenant
- Compliance requirements

### Why Express.js?
- Fast and lightweight
- Extensive ecosystem
- Good K8s client libraries
- Easy to maintain

### Why React + Vite?
- Modern development experience
- Fast build times
- Component-based architecture
- Rich ecosystem

## Compliance and Governance

### Data Residency
- All data stored in cluster
- Per-tenant data isolation
- No cross-tenant data access

### Audit Logging
- Kubernetes audit logs
- API access logs
- Deployment change tracking

### Compliance Frameworks
- Suitable for: SOC 2, ISO 27001
- Data isolation supports: GDPR, FERPA, HIPAA
- Audit trail for compliance

## Glossary

- **Tenant**: A customer (school/district) with isolated resources
- **Namespace**: Kubernetes logical isolation boundary
- **ResourceQuota**: Hard limits on resource consumption
- **NetworkPolicy**: Rules controlling network traffic
- **StatefulSet**: For stateful applications like databases
- **Deployment**: For stateless applications
- **Service**: Internal load balancer and DNS entry
- **Ingress**: External HTTP(S) access configuration
- **PVC**: Persistent Volume Claim for storage
