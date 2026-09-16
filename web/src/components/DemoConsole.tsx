'use client';
import { useState } from 'react';
import PrimaryButton from './PrimaryButton';

type DemoState = {
  decision: string;
  mode: 'live' | 'sandbox';
  caption?: string;
};

const initialState: DemoState = {
  decision: 'waiting',
  mode: 'sandbox',
};

/** Displays the protected invoice decision and its execution mode. */
export default function DemoConsole({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<DemoState>(initialState);

  const run = async () => {
    setState({ decision: 'checking', mode: 'sandbox' });
    try {
      const response = await fetch('/api/demo/invoice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invoiceId: 'northwind-042' }),
      });
      const data = (await response.json()) as {
        reason?: string;
        result?: string;
        mode?: 'live' | 'sandbox';
        caption?: string;
      };
      setState({
        decision: data.reason || data.result || 'sandbox',
        mode: data.mode || 'sandbox',
        caption: data.caption,
      });
    } catch {
      setState({
        decision: 'sandbox',
        mode: 'sandbox',
        caption: 'sandbox: the live bridge is unavailable',
      });
    }
  };

  return (
    <div className="p-2 rounded-[1rem] bg-[var(--bg-secondary)] ring-1 ring-[var(--border-default)]">
      <div className="rounded-[calc(1rem-0.5rem)] bg-[var(--bg-surface)] p-5 md:p-6 liquid-glass-light">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[11px] uppercase tracking-[.18em] text-[var(--text-muted)]">
            Latch · pay.lock
          </span>
          <span className={`inline-flex items-center gap-2 font-mono text-[11px] ${state.mode === 'live' ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${state.mode === 'live' ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--text-muted)]'}`} />
            {state.mode}
          </span>
        </div>
        <div>
          {[
            ['Payee', '{{vendor.iban}}'],
            ['Amount', '4,250.00 EUR'],
            ['Decision', state.decision],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 py-3 border-t border-[var(--border-subtle)] first:border-t-0 first:pt-0">
              <span className="font-mono text-[11px] uppercase tracking-[.14em] text-[var(--text-muted)]">{label}</span>
              <span className={`font-mono text-sm text-right ${value === 'payee_mismatch' ? 'text-[var(--error)]' : 'text-[var(--text-primary)]'}`}>{value}</span>
            </div>
          ))}
        </div>
        {state.caption && <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">{state.caption}</p>}
        {!compact && <PrimaryButton onClick={run} />}
      </div>
    </div>
  );
}
