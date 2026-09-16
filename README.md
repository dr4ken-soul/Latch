# Latch

## Let the agent pay. Never let it see.

Latch is an MCP sidecar for Terminal 3. It wraps outbound agent actions, keeps account secrets out of model context, applies the PayLock allowlist, and records the decision. The public demo is intentionally safe: it runs a sandbox deny and never sends money.

## Features

- `ap.pay` requires the `{{vendor.iban}}` placeholder and records `payee_mismatch` for the poisoned invoice.
- `grants.revoke` clears delegated functions.
- `audit.tail` returns the recent activity rows.
- Next.js landing page and public `/app` console.
- Server-only environment variables for future T3N and Stripe test integrations.

## Run locally

Requirements: Node 18 or newer. Rust is only required when building the T3N contract walkthrough.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The demo is labelled sandbox and the health check is available at `/api/health`.

Run the MCP sidecar separately:

```bash
npm run mcp
```

Required server environment variables are documented in `.env.example`. Never put T3N keys in `NEXT_PUBLIC_` variables.

## Handover

Latch is designed for Terminal 3 to host after judging. The handover is deliberately small: provide a testnet tenant and agent key to the Node MCP process, register the Rust/WASM placeholder contract, merge the `pay-invoice` delegation with `updateMemberDelegation`, and configure the tenant KV allowlist. Keep the web app on Vercel and the MCP process beside the T3N workload. The sandbox route remains available for judges when T3N credentials are absent.

## Submission

Title: Latch

Tagline: Let the agent pay. Never let it see.

The deny is the proof. A poisoned invoice cannot retarget an allowed vendor because the model only receives a placeholder and the enclave checks the payee before egress.
