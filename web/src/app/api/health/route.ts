import { NextResponse } from 'next/server';
import { bridgeConfigured, bridgeHealth } from '@/lib/bridge';

/**
 * Public deployment health check. Reports the web app's own liveness plus
 * the optional live bridge status (bridge reachable, T3N configured, rail).
 */
export async function GET() {
  const bridge = bridgeConfigured() ? await bridgeHealth() : null;
  return NextResponse.json({
    ok: true,
    live: bridge?.live ?? false,
    bridge: bridge ? { ok: bridge.ok, t3nEnv: bridge.t3nEnv, rail: bridge.rail } : null,
  });
}
