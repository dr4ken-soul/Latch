import { NextResponse } from 'next/server';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { bridgeAudit, bridgeConfigured } from '@/lib/bridge';

/**
 * Returns the current demo status and the most recent protected action rows.
 * Live mode tails the tenant activity log reconstructed from the node's
 * append-only ledger; the empty state instructs the visitor to run the
 * invoice first. Rate limited to 30 requests / minute / IP.
 */
export async function GET(request: Request) {
  if (!rateLimit(`status:${clientKey(request)}`, 30, 60_000)) {
    return NextResponse.json({ decision: 'rate_limited', lastRows: [] }, { status: 429 });
  }

  if (bridgeConfigured()) {
    const rows = await bridgeAudit(10);
    if (rows) {
      return NextResponse.json({
        decision: rows.length > 0 ? 'decided' : 'waiting',
        mode: 'live',
        lastRows: rows.map((row) => ({
          at: row.at,
          functionName: row.functionName,
          result: row.outcome,
        })),
      });
    }
    return NextResponse.json({
      decision: 'waiting',
      mode: 'sandbox',
      caption: 'live bridge unreachable — sandbox status shown',
      lastRows: [],
    });
  }

  return NextResponse.json({
    decision: 'waiting',
    mode: 'sandbox',
    caption: 'sandbox — run the bridge with T3N_API_KEY for the live ledger',
    lastRows: [],
  });
}
