import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { isLiveConfigured, getEnv } from './env.js';
import { payInvoice, revokeAgentGrant, auditTail } from './t3n.js';

const server = new McpServer({ name: 'latch', version: '1.0.0' });

/** Local sandbox rows, used only when the live T3N path is not configured. */
const sandboxRows: Array<{ at: string; functionName: string; result: string; reason?: string }> = [];

/**
 * Authorises a protected payment. Live mode invokes the Latch TEE contract
 * (`pay-invoice`) through T3N; the payee IBAN is never an argument — the
 * contract emits the `{{vendor.iban}}` marker and the T3N host resolves it
 * inside the enclave. Sandbox mode returns the deterministic
 * `payee_mismatch` deny for the poisoned demo invoice.
 */
server.tool(
  'ap.pay',
  { invoiceId: z.string(), vendor: z.string(), amount: z.number().positive(), currency: z.string().length(3), memo: z.string().optional(), payeeRef: z.literal('{{vendor.iban}}').optional() },
  async ({ invoiceId, vendor, amount, currency, memo }) => {
    if (!isLiveConfigured()) {
      const row = { at: new Date().toISOString(), functionName: 'pay-invoice', result: 'deny', reason: 'payee_mismatch' };
      sandboxRows.unshift(row);
      return { content: [{ type: 'text', text: JSON.stringify({ ...row, invoiceId, vendor, amount, currency, mode: 'sandbox' }) }] };
    }
    try {
      const decision = await payInvoice({ invoiceId, vendor, amount, currency: currency.toUpperCase(), memo });
      return { content: [{ type: 'text', text: JSON.stringify(decision) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ result: 'error', reason: 't3n_unreachable', detail: error instanceof Error ? error.message : String(error) }) }], isError: true };
    }
  },
);

/**
 * Revokes the agent's delegated `pay-invoice` access with a surgical
 * subtractive write; every other grant survives. Sandbox mode clears the
 * local grant flag.
 */
server.tool('grants.revoke', { grantee: z.string().optional() }, async ({ grantee }) => {
  if (!isLiveConfigured()) {
    return { content: [{ type: 'text', text: JSON.stringify({ result: 'revoked', grants: [], mode: 'sandbox' }) }] };
  }
  try {
    const outcome = await revokeAgentGrant(grantee);
    return { content: [{ type: 'text', text: JSON.stringify({ result: outcome.revoked ? 'revoked' : 'nothing_to_revoke', ...outcome }) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ result: 'error', reason: 't3n_unreachable', detail: error instanceof Error ? error.message : String(error) }) }], isError: true };
  }
});

/**
 * Returns the most recent protected action rows. Live mode tails the tenant
 * activity log reconstructed from the node's append-only ledger.
 */
server.tool('audit.tail', { limit: z.number().int().positive().max(50).default(10) }, async ({ limit }) => {
  if (!isLiveConfigured()) {
    return { content: [{ type: 'text', text: JSON.stringify(sandboxRows.slice(0, limit)) }] };
  }
  try {
    const rows = await auditTail(limit);
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ result: 'error', reason: 't3n_unreachable', detail: error instanceof Error ? error.message : String(error) }) }], isError: true };
  }
});

/** Starts the Latch MCP server over stdio for an MCP-compatible agent. */
async function main() {
  const env = getEnv();
  console.error(`latch mcp starting — t3n env: ${env.t3nEnv}, live: ${isLiveConfigured()}, rail: ${env.paymentRail}`);
  await server.connect(new StdioServerTransport());
}
main().catch((error) => { console.error(error); process.exit(1); });
