import { NextResponse } from 'next/server';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { bridgePay, bridgeConfigured } from '@/lib/bridge';

/**
 * The demo invoices. Both narratively come from Northwind Treasury; the
 * poisoned one carries an injected payee swap, so its allowlist key points
 * at a vendor the data owner never approved.
 */
const DEMO_INVOICES: Record<string, { vendor: string; amount: number; currency: string; memo: string }> = {
  'northwind-042': {
    vendor: 'shadow-logic-ai',
    amount: 4250,
    currency: 'EUR',
    memo: 'POISONED — hidden instruction retargets the payee',
  },
  'acme-2041': {
    vendor: 'acme-cloud',
    amount: 89.5,
    currency: 'EUR',
    memo: 'Regular cloud invoice, on the allowlist',
  },
};

/**
 * Runs the protected invoice decision. Live mode executes the TEE contract
 * through the bridge (the payee IBAN never crosses this boundary — the
 * contract emits `{{vendor.iban}}` and the T3N host resolves it inside the
 * enclave). Without the bridge the response is the deterministic sandbox
 * deny, always carrying a visible `mode` caption.
 *
 * Rate limited to 10 requests / minute / IP.
 */
export async function POST(request: Request) {
  if (!rateLimit(`invoice:${clientKey(request)}`, 10, 60_000)) {
    return NextResponse.json({ result: 'deny', reason: 'rate_limited', mode: 'sandbox' }, { status: 429 });
  }

  let invoiceId = 'northwind-042';
  try {
    const body = (await request.json()) as { invoiceId?: string };
    if (typeof body.invoiceId === 'string' && body.invoiceId) invoiceId = body.invoiceId;
  } catch {
    // no body — the default demo invoice applies
  }

  const invoice = DEMO_INVOICES[invoiceId];
  if (!invoice) {
    return NextResponse.json({ result: 'deny', reason: 'unknown_invoice', mode: 'sandbox' }, { status: 404 });
  }

  if (bridgeConfigured()) {
    const decision = await bridgePay({
      invoiceId,
      vendor: invoice.vendor,
      amount: invoice.amount,
      currency: invoice.currency,
      memo: invoice.memo,
    });
    if (decision) {
      return NextResponse.json(decision);
    }
    return NextResponse.json({
      result: 'deny',
      reason: 'payee_mismatch',
      mode: 'sandbox',
      invoiceId,
      caption: 'live bridge unreachable — sandbox decision shown',
    });
  }

  return NextResponse.json({
    result: 'deny',
    reason: 'payee_mismatch',
    mode: 'sandbox',
    invoiceId,
    caption: 'sandbox — run the bridge with T3N_API_KEY for the live enclave decision',
  });
}
