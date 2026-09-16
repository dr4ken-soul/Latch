/**
 * Bridge client for the Latch plain-Node T3N process. The T3N SDK loads a
 * WASM component that Next.js bundling can break, so all live calls proxy
 * to the bridge (LATCH_BRIDGE_URL) instead of importing the SDK here.
 * When the bridge is not configured or unreachable, callers fall back to
 * the visible sandbox mode.
 */

/** One live decision row from the bridge audit log. */
export interface BridgeAuditRow {
  at: string;
  actor: string;
  functionName: string;
  contract: string;
  outcome: string;
  seq: number;
}

/** Live pay-invoice decision from the TEE contract. */
export interface BridgePayResult {
  result: 'approve' | 'deny' | 'error';
  reason?: string;
  detail?: string;
  invoice_id?: string;
  vendor?: string;
  amount?: number;
  currency?: string;
  mode?: 'live';
  rail?: string;
  payment_ref?: string | null;
  checkout_url?: string | null;
}

const bridgeUrl = process.env.LATCH_BRIDGE_URL || '';

/** True when a bridge URL is configured. */
export function bridgeConfigured(): boolean {
  return bridgeUrl !== '';
}

/** Absolute URL for a bridge path. */
function url(path: string): string {
  return `${bridgeUrl.replace(/\/$/, '')}${path}`;
}

/** POST a JSON payload to the bridge; returns null on any failure. */
async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Run a live invoice payment through the bridge. */
export function bridgePay(params: {
  invoiceId: string;
  vendor: string;
  amount: number;
  currency: string;
  memo?: string;
}): Promise<BridgePayResult | null> {
  return post<BridgePayResult>('/pay', params);
}

/** Revoke the agent grant through the bridge. */
export function bridgeRevoke(grantee?: string): Promise<{ revoked: boolean } | null> {
  return post<{ revoked: boolean }>('/revoke', grantee ? { grantee } : {});
}

/** Tail the live audit log through the bridge. */
export async function bridgeAudit(limit = 10): Promise<BridgeAuditRow[] | null> {
  try {
    const response = await fetch(url(`/audit?limit=${encodeURIComponent(String(limit))}`), {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { rows: BridgeAuditRow[] };
    return data.rows;
  } catch {
    return null;
  }
}

/** Check bridge health; returns null when unreachable. */
export async function bridgeHealth(): Promise<{
  ok: boolean;
  live: boolean;
  t3nEnv: string;
  rail: string;
} | null> {
  try {
    const response = await fetch(url('/health'), { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return (await response.json()) as { ok: boolean; live: boolean; t3nEnv: string; rail: string };
  } catch {
    return null;
  }
}
