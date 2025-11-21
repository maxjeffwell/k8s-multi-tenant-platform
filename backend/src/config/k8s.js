import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();

// Load from default kubeconfig or in-cluster config
let k8sConfigLoaded = false;
try {
  kc.loadFromDefault();
  k8sConfigLoaded = true;
  console.log('✓ Kubernetes config loaded successfully');
} catch (error) {
  console.warn('⚠ Kubernetes config not available:', error.message);
  console.warn('  Running in limited mode - K8s operations will fail');
}

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sNetworkingApi = kc.makeApiClient(k8s.NetworkingV1Api);

export {
  kc,
  k8sApi,
  k8sAppsApi,
  k8sNetworkingApi,
  k8sConfigLoaded
};
