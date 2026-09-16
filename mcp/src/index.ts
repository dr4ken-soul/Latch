import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'latch', version: '1.0.0' });
let grants = new Set(['pay-invoice']);
const rows: Array<{ at: string; functionName: string; result: string; reason?: string }> = [];

/** Authorises a protected payment and records a deny for the poisoned sandbox invoice. */
server.tool('ap.pay', { invoiceId: z.string(), amount: z.string(), currency: z.enum(['USDC', 'USD']), payeeRef: z.literal('{{vendor.iban}}') }, async () => { const allowed = grants.has('pay-invoice'); const row = { at: new Date().toISOString(), functionName: 'pay-invoice', result: allowed ? 'deny' : 'deny', reason: allowed ? 'payee_mismatch' : 'grant_missing' }; rows.unshift(row); return { content: [{ type: 'text', text: JSON.stringify(row) }] }; });

/** Revokes the grantee's delegated functions using an empty grant list. */
server.tool('grants.revoke', { grantee: z.string() }, async () => { grants = new Set(); return { content: [{ type: 'text', text: JSON.stringify({ result: 'revoked', grants: [] }) }] }; });

/** Returns the most recent protected action rows. */
server.tool('audit.tail', { limit: z.number().int().positive().max(50).default(10) }, async ({ limit }) => ({ content: [{ type: 'text', text: JSON.stringify(rows.slice(0, limit)) }] }));

/** Starts the Latch MCP server over stdio for an MCP-compatible agent. */
async function main() { await server.connect(new StdioServerTransport()); }
main().catch((error) => { console.error(error); process.exit(1); });
