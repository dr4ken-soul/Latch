# Latch — Build Guide

Read APP_BLUEPRINT.md and FRONTEND_SPEC.md in full before creating files. This guide only sequences work. When a step says as specified in X, open that section. Do not guess classes, copy, or contract shapes.

Do not write application code until the user approves FRONTEND_SPEC.md.

---

## Prerequisites

```bash
node --version    # 18 or higher
npm --version     # 9 or higher
rustc --version   # as required by the T3N contract walkthrough
```

Claim a DID and API key at https://go.terminal3.io/adk-community with Google SSO and a work email. Store the key immediately. It is shown once.

Install `@terminal3/t3n-sdk` at version 52, not latest-by-accident.

Complete the official Quickstart and the TEE contract walkthrough before inventing abstractions.

If credits run out, message the listing contact on Telegram with the DID and the word Superteam.

---

## Repo

```bash
mkdir latch && cd latch
git init
mkdir -p contracts mcp/src/tools web/src/{app/api/demo,components/{layout,sections},hooks,styles}
```

Root `.env` (never commit):

```
T3N_API_KEY=
T3N_AGENT_KEY=
T3N_ENV=testnet
NEXT_PUBLIC_SITE_URL=
STRIPE_TEST_KEY=
```

Copy keys into mcp and the Next.js server env only.

---

## Phase 1 — T3N and contract

### 1.1 Handshake

Reproduce the Quickstart in `mcp/src/t3n.ts` until it prints a `did:t3n:` value. Tenant client and agent client are separate files, separate keys.

Log bugs from the refreshed docs into a running `BUGS.md`. That file becomes part of the Google Doc.

### 1.2 TEE contract

Follow docs: write, build, register, invoke, test.

Implement `pay-invoice` exactly as APP_BLUEPRINT.md describes: placeholders for the payee, allowlist check, Stripe test or a documented sandbox return. Do not inline account numbers in Rust.

Implement a deny path that returns `payee_mismatch` without calling the host payment API.

### 1.3 Delegation

Use `updateMemberDelegation` so sibling grants survive. Grant `pay-invoice` and the Stripe (or sandbox) host only. Confirm a second agent DID without a grant cannot pay.

---

## Phase 2 — MCP

```bash
cd mcp
npm init -y
npm install @modelcontextprotocol/sdk @terminal3/t3n-sdk@52
```

Tools: `ap.pay`, `grants.revoke`, `audit.tail` as specified in APP_BLUEPRINT.md. JSDoc on every handler. Factual logs, no emoji.

---

## Phase 3 — Web

```bash
cd web
npx create-next-app@latest . --typescript --tailwind --app
npm install motion gsap
```

Do not install lucide-react, wagmi, or viem.

Translate FRONTEND_SPEC.md section 1 into `globals.css` and the Tailwind theme. Hide the scrollbar as specified. Add the Material Icons link in `layout.tsx`.

Build in this order:

1. `Nav.tsx` ghost strip
2. `Hero.tsx` off-grid copy + coded console + parallax hooks
3. Statement, Track (GSAP pin), Audit bento, Demo tabs, Close, Footer
4. `/app` console
5. `/api/demo/invoice` and `/api/demo/status` calling the MCP or the SDK on the server

Wire Run the invoice to the real deny path as soon as phase 1.2 works. Until then the button may set local console state only if the caption says sandbox.

Reduced-motion: stack the track, disable tilt, magnetic, and depth.

---

## Phase 4 — Quality

**T3N**

- Authenticate prints a DID
- Calldata and UI never show a real IBAN
- Missing grant → deny, not a timeout
- Revoke stops the next pay
- SDK is 52

**Frontend (plus the spec self-check)**

- Scroll reveals replay on the way back up
- No `once: true`
- No hex in components
- Logo slot still a comment if no file was given
- Ghost nav reveals links on hover at md+
- Mobile hero stacks, no horizontal overflow
- One CTA intent: Run the invoice

**Submission**

- Public GitHub and README
- Google Doc: screenshots, BUGS.md, handover (we prefer Terminal 3 to host)
- Deployed HTTPS URL
- X post tagging @terminal3io
- Submit earlier rather than polishing past usefulness
