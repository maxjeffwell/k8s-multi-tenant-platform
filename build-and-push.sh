#!/bin/bash

# Build and push Docker images for the multi-tenant platform
# Usage: ./build-and-push.sh [version]

set -e

VERSION=${1:-latest}
DOCKER_REGISTRY=${DOCKER_REGISTRY:-maxjeffwell}

echo "Building and pushing version: $VERSION"
echo "Registry: $DOCKER_REGISTRY"
echo ""

# Build backend
echo "Building backend image..."
docker build -t ${DOCKER_REGISTRY}/tenantflow-backend:${VERSION} ./backend
docker tag ${DOCKER_REGISTRY}/tenantflow-backend:${VERSION} ${DOCKER_REGISTRY}/tenantflow-backend:latest

# Build frontend
echo "Building frontend image..."
docker build -t ${DOCKER_REGISTRY}/tenantflow-frontend:${VERSION} ./frontend
docker tag ${DOCKER_REGISTRY}/tenantflow-frontend:${VERSION} ${DOCKER_REGISTRY}/tenantflow-frontend:latest

# Push images
echo "Pushing images to registry..."
docker push ${DOCKER_REGISTRY}/tenantflow-backend:${VERSION}
docker push ${DOCKER_REGISTRY}/tenantflow-backend:latest
docker push ${DOCKER_REGISTRY}/tenantflow-frontend:${VERSION}
docker push ${DOCKER_REGISTRY}/tenantflow-frontend:latest

echo ""
echo "Images built and pushed successfully!"
echo "Backend: ${DOCKER_REGISTRY}/tenantflow-backend:${VERSION}"
echo "Frontend: ${DOCKER_REGISTRY}/tenantflow-frontend:${VERSION}"
