/**
 * Live Terminal 3 (T3N) integration for Latch.
 *
 * Two sessions, two keys, one tenant:
 *   - Tenant session (T3N_API_KEY): the data owner. Registers the Latch TEE
 *     contract, seeds the `secrets` / `latch-policy` KV maps, and holds the
 *     member delegation policy (the revocation surface).
 *   - Agent session (T3N_AGENT_KEY): the AI assistant. Executes `pay-invoice`
 *     as a delegated call with `pii_did` bound to the tenant, which is what
 *     lets the host resolve `{{profile.vendor.iban}}` inside the TEE.
 *
 * When no agent key is configured the tenant self-calls the contract, which
 * is still a real dispatch through the node (same policy, same audit trail).
 */
import {
  T3nClient,
  TenantClient,
  loadWasmComponent,
  fetchTrustedManifest,
  setEnvironment,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  getContractVersion,
  getNodeUrl,
  readOnlyScopes,
} from '@terminal3/t3n-sdk';
import { getEnv, type LatchEnv } from './env.js';

/** Contract tail registered for this tenant; canonical id is `z:<tid>:latch-pay`. */
export const CONTRACT_TAIL = 'latch-pay';
export const CONTRACT_VERSION = '0.1.0';

/** One authenticated session against the T3N node. */
export interface Session {
  t3n: T3nClient;
  did: string;
}

/** Tenant session with the control-plane client attached. */
export interface TenantSession extends Session {
  tenant: TenantClient;
}

let tenantSessionPromise: Promise<TenantSession> | null = null;
let agentSessionPromise: Promise<Session> | null = null;

/** Build an authenticated client from a raw API key (quickstart pattern). */
async function buildSession(env: LatchEnv, apiKey: string): Promise<Session> {
  setEnvironment(env.t3nEnv);
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(apiKey);
  const t3n = new T3nClient({
    trustAnchor: await fetchTrustedManifest(env.t3nEnv),
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, apiKey) },
  });
  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  return { t3n, did: did.value };
}

/** Get (and cache) the tenant session. Throws when T3N_API_KEY is missing. */
export async function getTenantSession(): Promise<TenantSession> {
  const env = getEnv();
  if (!env.tenantKey) throw new Error('T3N_API_KEY is not configured');
  if (!tenantSessionPromise) {
    tenantSessionPromise = (async () => {
      const session = await buildSession(env, env.tenantKey!);
      const nodeUrl = getNodeUrl();
      const tenant = new TenantClient({
        t3n: session.t3n,
        tenantDid: session.did,
        baseUrl: nodeUrl,
        endpoint: nodeUrl,
      });
      return { ...session, tenant };
    })().catch((error) => {
      tenantSessionPromise = null;
      throw error;
    });
  }
  return tenantSessionPromise;
}

/** Get (and cache) the agent session. Returns null when T3N_AGENT_KEY is unset. */
export async function getAgentSession(): Promise<Session | null> {
  const env = getEnv();
  if (!env.agentKey) return null;
  if (!agentSessionPromise) {
    agentSessionPromise = buildSession(env, env.agentKey).catch((error) => {
      agentSessionPromise = null;
      throw error;
    });
  }
  return agentSessionPromise;
}

/** Canonical contract id for a tenant: `z:<tid>:latch-pay`. */
export function contractId(tenantDid: string): string {
  return `z:${tenantDid.replace(/^did:t3n:/, '')}:${CONTRACT_TAIL}`;
}

/**
 * Resolve the live semver for the registered contract version. The node is
 * strict: `contract_version` must be a real SemVer string, never "latest".
 */
export async function resolveContractVersion(tenantDid: string): Promise<string> {
  try {
    return await getContractVersion(getNodeUrl(), contractId(tenantDid));
  } catch {
    return CONTRACT_VERSION;
  }
}

/** Parameters for a live invoice payment. */
export interface PayInvoiceParams {
  invoiceId: string;
  vendor: string;
  amount: number;
  currency: string;
  memo?: string;
}

/** Live decision returned by the TEE contract. */
export interface PayInvoiceResult {
  result: 'approve' | 'deny' | 'error';
  reason?: string;
  detail?: string;
  invoice_id: string;
  vendor: string;
  amount: number;
  currency: string;
  mode: 'live';
  rail?: string;
  payment_ref?: string | null;
  checkout_url?: string | null;
}

/**
 * Execute `pay-invoice` on the Latch TEE contract. Prefers the delegated
 * agent call (pii_did bound to the tenant) and falls back to a tenant
 * self-call when no agent key is configured.
 */
export async function payInvoice(params: PayInvoiceParams): Promise<PayInvoiceResult> {
  const tenant = await getTenantSession();
  const version = await resolveContractVersion(tenant.did);
  const request = {
    contract_id: contractId(tenant.did),
    contract_version: version,
    function_name: 'pay-invoice',
    input: {
      invoice_id: params.invoiceId,
      vendor: params.vendor,
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      ...(params.memo ? { memo: params.memo } : {}),
    },
  };

  const agent = await getAgentSession();
  if (agent) {
    const response = await agent.t3n.executeAndDecode<PayInvoiceResult>({
      ...request,
      pii_did: tenant.did,
    });
    return response;
  }
  return tenant.t3n.executeAndDecode<PayInvoiceResult>(request);
}

/** One audit row projected from the tenant activity log. */
export interface AuditRow {
  at: string;
  actor: string;
  functionName: string;
  contract: string;
  outcome: string;
  seq: number;
}

/**
 * Tail the tenant activity log — one row per audited contract dispatch,
 * straight off the node's append-only ledger.
 */
export async function auditTail(limit = 10): Promise<AuditRow[]> {
  const tenant = await getTenantSession();
  const page = await tenant.t3n.getActivityLog({ limit });
  return page.entries.map((entry) => ({
    at: new Date(entry.timestamp_ms).toISOString(),
    actor: entry.actor,
    functionName: entry.function,
    contract: entry.contract,
    outcome: entry.outcome,
    seq: entry.seq_no,
  }));
}

/**
 * Revoke the agent's delegated access to the Latch contract with a
 * surgical subtractive write: only the `(agent, z:<tid>:latch-pay)` edge is
 * removed; every other contract's grants survive untouched.
 */
export async function revokeAgentGrant(granteeDid?: string): Promise<{ revoked: boolean; grantee?: string }> {
  const tenant = await getTenantSession();
  const agent = await getAgentSession();
  const target = granteeDid ?? agent?.did;
  if (!target) return { revoked: false };
  await tenant.t3n.removeMemberDelegationGrants([
    { grantee: target, contract_id: contractId(tenant.did) },
  ]);
  return { revoked: true, grantee: target };
}

/**
 * Grant the agent the single `pay-invoice` edge on the Latch contract.
 * Surgical add with union semantics: other grants survive untouched.
 */
export async function grantAgentPay(agentDid: string, hosts: string[]): Promise<{ granted: boolean }> {
  const tenant = await getTenantSession();
  await tenant.t3n.addMemberDelegationGrants([
    {
      grantee: agentDid,
      contract_id: contractId(tenant.did),
      function: 'pay-invoice',
      scopes: readOnlyScopes(['vendor.iban']),
      version_req: `>=${CONTRACT_VERSION}`,
      allowed_hosts: hosts,
    },
  ]);
  return { granted: true };
}
