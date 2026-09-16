/**
 * Latch bridge — a tiny plain-Node HTTP surface over the live T3N calls.
 *
 * The T3N SDK loads a WASM component that bundlers (Next.js/Turbopack/Vite)
 * can break, so the SDK runs here in plain Node (tsx) and the Next.js routes
 * proxy to this bridge instead of importing the SDK directly.
 *
 * Endpoints (loopback-only by default; bind via LATCH_BRIDGE_HOST):
 *   POST /pay    { invoiceId, vendor, amount, currency, memo? }
 *   GET  /audit?limit=10
 *   POST /revoke { grantee? }
 *   GET  /health
 *
 * Run: npm run bridge --workspace mcp
 */
import { createServer } from 'node:http';
import { isLiveConfigured, getEnv } from './env.js';
import { payInvoice, revokeAgentGrant, auditTail, getAgentSession, getTenantSession } from './t3n.js';

const PORT = Number(process.env.LATCH_BRIDGE_PORT || 8787);
const HOST = process.env.LATCH_BRIDGE_HOST || '127.0.0.1';

/** Parse a JSON request body, rejecting oversized payloads. */
function readJson(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response. */
function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const env = getEnv();
      let agentDid: string | null = null;
      let tenantDid: string | null = null;
      if (isLiveConfigured()) {
        try {
          tenantDid = (await getTenantSession()).did;
          agentDid = (await getAgentSession())?.did ?? null;
        } catch {
          tenantDid = null;
        }
      }
      return send(res, 200, {
        ok: true,
        live: isLiveConfigured(),
        t3nEnv: env.t3nEnv,
        rail: env.paymentRail,
        tenantDid,
        agentDid,
      });
    }

    if (!isLiveConfigured()) {
      return send(res, 503, { error: 't3n_not_configured', detail: 'T3N_API_KEY missing on the bridge' });
    }

    if (req.method === 'POST' && url.pathname === '/pay') {
      const body = await readJson(req);
      const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : '';
      const vendor = typeof body.vendor === 'string' ? body.vendor : '';
      const amount = Number(body.amount);
      const currency = typeof body.currency === 'string' ? body.currency : '';
      if (!invoiceId || !vendor || !Number.isFinite(amount) || amount <= 0 || currency.length !== 3) {
        return send(res, 400, { error: 'bad_request', detail: 'invoiceId, vendor, amount, currency (ISO 4217) are required' });
      }
      const decision = await payInvoice({
        invoiceId,
        vendor,
        amount,
        currency,
        memo: typeof body.memo === 'string' ? body.memo : undefined,
      });
      return send(res, 200, decision);
    }

    if (req.method === 'GET' && url.pathname === '/audit') {
      const limitParam = Number(url.searchParams.get('limit') || '10');
      const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 50) : 10;
      const rows = await auditTail(limit);
      return send(res, 200, { rows });
    }

    if (req.method === 'POST' && url.pathname === '/revoke') {
      const body = await readJson(req);
      const outcome = await revokeAgentGrant(typeof body.grantee === 'string' ? body.grantee : undefined);
      return send(res, 200, outcome);
    }

    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    return send(res, 502, {
      error: 't3n_error',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.error(`latch bridge listening on http://${HOST}:${PORT} — live: ${isLiveConfigured()}`);
});
