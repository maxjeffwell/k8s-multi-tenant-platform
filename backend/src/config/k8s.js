import * as k8s from '@kubernetes/client-node';
import { createLogger } from '../utils/logger.js';

const log = createLogger('k8s-config');

const kc = new k8s.KubeConfig();

// Load from default kubeconfig or in-cluster config
let k8sConfigLoaded = false;
try {
  kc.loadFromDefault();
  k8sConfigLoaded = true;
  log.info('Kubernetes config loaded successfully');
} catch (error) {
  log.warn({ err: error }, 'Kubernetes config not available - running in limited mode');
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
