#!/bin/bash

# Kill all node server processes
pkill -9 -f "node.*server.js"
sleep 2

# Start the backend
cd /home/maxjeffwell/GitHub_Projects/k8s-multi-tenant-platform/backend
PORT=3001 node src/server.js
