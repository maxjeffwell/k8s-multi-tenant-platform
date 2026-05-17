import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { createLogger } from '../utils/logger.js';

const log = createLogger('neon-service');

/**
 * NeonService — branch lifecycle against the self-hosted KubeBlocks Neon
 * pageserver (replaces the previous Neon Cloud API integration).
 *
 * Model:
 *   tenantflow tenant name  ─┐
 *                            ├── pageserver tenant_id (one per tenantflow tenant)
 *                            └── pageserver timeline_id (the tenant's "main" branch)
 *
 * Tenant_name → (tenant_id, timeline_id) mapping is persisted in a K8s
 * ConfigMap so this service is stateless. Compute-pod provisioning (the
 * thing that produces a usable PostgreSQL connection string for a given
 * timeline) lives in k8sService — see provisionNeonCompute() there.
 *
 * Env:
 *   PAGESERVER_URL              e.g. http://tenantflow-neon-neon-pageserver-headless.neon.svc.cluster.local:9898
 *   NEON_NAMESPACE              defaults to 'neon'
 *   NEON_PG_VERSION             defaults to 14
 */

const TENANT_MAP_CM = 'tenantflow-neon-tenant-map';
const DEFAULT_NEON_NAMESPACE = 'neon';
const DEFAULT_PG_VERSION = 14;

class NeonService {
  constructor() {
    this.pageserverUrl = process.env.PAGESERVER_URL;
    this.neonNamespace = process.env.NEON_NAMESPACE || DEFAULT_NEON_NAMESPACE;
    this.pgVersion = parseInt(process.env.NEON_PG_VERSION || DEFAULT_PG_VERSION, 10);

    const kc = new KubeConfig();
    try {
      kc.loadFromCluster();
    } catch {
      kc.loadFromDefault();
    }
    this.k8s = kc.makeApiClient(CoreV1Api);
  }

  isConfigured() {
    return !!this.pageserverUrl;
  }

  /**
   * Raw pageserver HTTP call. Pageserver returns JSON for most endpoints;
   * `POST /v1/tenant/` returns a bare quoted UUID string (handled below).
   */
  async pageserverRequest(method, path, body = null) {
    if (!this.isConfigured()) {
      throw new Error('PAGESERVER_URL not set; cannot reach Neon pageserver.');
    }
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${this.pageserverUrl}${path}`, opts);
    const text = await resp.text();
    if (!resp.ok) {
      log.error({ status: resp.status, path, body: text }, 'pageserver call failed');
      throw new Error(`pageserver ${method} ${path} → ${resp.status}: ${text}`);
    }
    try { return JSON.parse(text); } catch { return text; }
  }

  // --- Tenant-map ConfigMap I/O ---------------------------------------------

  async _readTenantMap() {
    try {
      const cm = await this.k8s.readNamespacedConfigMap({
        name: TENANT_MAP_CM, namespace: this.neonNamespace,
      });
      return { resourceVersion: cm.metadata?.resourceVersion, data: cm.data || {} };
    } catch (err) {
      if (err.code === 404 || err.statusCode === 404) {
        return { resourceVersion: null, data: {} };
      }
      throw err;
    }
  }

  async _writeTenantMap(data, resourceVersion) {
    const body = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: TENANT_MAP_CM,
        namespace: this.neonNamespace,
        ...(resourceVersion ? { resourceVersion } : {}),
      },
      data,
    };
    if (resourceVersion) {
      await this.k8s.replaceNamespacedConfigMap({
        name: TENANT_MAP_CM, namespace: this.neonNamespace, body,
      });
    } else {
      await this.k8s.createNamespacedConfigMap({ namespace: this.neonNamespace, body });
    }
  }

  // --- Public branch ops ----------------------------------------------------

  /**
   * Idempotent: if the tenant already has an entry, return it; otherwise
   * create tenant + main timeline on the pageserver and persist the mapping.
   *
   * Returns:
   *   {
   *     tenantName, tenantId, timelineId,
   *     branchId: timelineId,           // back-compat with old caller
   *     branchName: tenantName,         // back-compat
   *     databaseName: 'postgres',
   *     pageserverHost, safekeeperHosts,
   *     connectionString: null,         // k8sService.provisionNeonCompute fills this
   *     reused,
   *   }
   */
  async createTenantBranch(tenantName) {
    const map = await this._readTenantMap();
    const existing = map.data[tenantName];
    if (existing) {
      const { tenantId, timelineId } = JSON.parse(existing);
      log.info({ tenantName, tenantId, timelineId }, 'tenant already exists; reusing');
      return this._shapeResult(tenantName, tenantId, timelineId, { reused: true });
    }

    log.info({ tenantName }, 'creating new Neon tenant + timeline');
    const tenantIdRaw = await this.pageserverRequest('POST', '/v1/tenant/', {});
    const tenantId = String(tenantIdRaw).replace(/"/g, '');

    const timeline = await this.pageserverRequest(
      'POST',
      `/v1/tenant/${tenantId}/timeline/`,
      { tenant_id: tenantId, pg_version: this.pgVersion },
    );
    const timelineId = timeline.timeline_id;

    const next = {
      ...map.data,
      [tenantName]: JSON.stringify({
        tenantId, timelineId, createdAt: new Date().toISOString(),
      }),
    };
    await this._writeTenantMap(next, map.resourceVersion);

    log.info({ tenantName, tenantId, timelineId }, 'Neon tenant + timeline created');
    return this._shapeResult(tenantName, tenantId, timelineId, { reused: false });
  }

  /**
   * Delete a branch by tenant name.
   * Removes the pageserver timeline AND the mapping entry. The compute pod
   * teardown is the caller's responsibility (k8sService.tearDownNeonCompute).
   */
  async deleteTenantBranch(tenantName) {
    const map = await this._readTenantMap();
    const raw = map.data[tenantName];
    if (!raw) {
      log.warn({ tenantName }, 'no Neon mapping for tenant; nothing to delete');
      return false;
    }
    const { tenantId, timelineId } = JSON.parse(raw);

    // Best-effort delete of the timeline. Pageserver tenant deletion is a
    // separate, harder operation we leave alone here (keeps the data
    // recoverable if the wrong tenant name was passed in).
    try {
      await this.pageserverRequest(
        'DELETE',
        `/v1/tenant/${tenantId}/timeline/${timelineId}`,
      );
    } catch (err) {
      log.warn({ err: err.message, tenantId, timelineId }, 'timeline delete failed; continuing');
    }

    const next = { ...map.data };
    delete next[tenantName];
    await this._writeTenantMap(next, map.resourceVersion);

    log.info({ tenantName, tenantId, timelineId }, 'tenant mapping removed');
    return true;
  }

  async findBranchByName(tenantName) {
    const map = await this._readTenantMap();
    const raw = map.data[tenantName];
    if (!raw) return null;
    const { tenantId, timelineId } = JSON.parse(raw);
    return this._shapeResult(tenantName, tenantId, timelineId, { reused: true });
  }

  async listBranches() {
    const map = await this._readTenantMap();
    return Object.entries(map.data).map(([name, raw]) => {
      const { tenantId, timelineId, createdAt } = JSON.parse(raw);
      return { tenantName: name, tenantId, timelineId, createdAt };
    });
  }

  // --- Helpers --------------------------------------------------------------

  _shapeResult(tenantName, tenantId, timelineId, { reused }) {
    const ns = this.neonNamespace;
    // Stable DNS names baked in by the KubeBlocks Neon addon.
    const pageserverHost = `tenantflow-neon-neon-pageserver-0.tenantflow-neon-neon-pageserver-headless.${ns}.svc.cluster.local`;
    const safekeeperHosts = [0, 1, 2].map(
      (i) => `tenantflow-neon-neon-safekeeper-${i}.tenantflow-neon-neon-safekeeper-headless.${ns}.svc.cluster.local`,
    );
    return {
      tenantName,
      tenantId,
      timelineId,
      branchId: timelineId,    // back-compat
      branchName: tenantName,  // back-compat
      databaseName: 'postgres',
      pageserverHost,
      safekeeperHosts,
      connectionString: null,  // filled in by k8sService.provisionNeonCompute()
      reused,
    };
  }
}

const neonService = new NeonService();
export default neonService;
export { NeonService };
