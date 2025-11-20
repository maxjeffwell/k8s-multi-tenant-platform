import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();

// Load from default kubeconfig or in-cluster config
try {
  kc.loadFromDefault();
} catch (error) {
  console.error('Failed to load Kubernetes config:', error.message);
  process.exit(1);
}

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sNetworkingApi = kc.makeApiClient(k8s.NetworkingV1Api);

export {
  kc,
  k8sApi,
  k8sAppsApi,
  k8sNetworkingApi
};
