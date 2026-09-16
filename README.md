# Latch

## Let the agent pay. Never let it see.

Latch is an MCP sidecar for Terminal 3. It wraps outbound agent actions so an
enterprise agent can issue a payment without ever seeing the account secrets:
the model only ever reads a `{{vendor.iban}}` placeholder, a Terminal 3 TEE
contract resolves the real payee and rails the money, and every decision lands
in an audit row before anything leaves.

The public demo is intentionally safe. It runs the live deny against the real
testnet TEE contract, and the approve path is gated until a payment rail key is
configured)Skip. No real money is ever at risk during judging.

## The deny is the proof

The same poisoned invoice, two outcomes. A naive agent is told to pay
`acme-cloud`, but the hidden text inside the invoice retargets the money to
`shadow-logic-ai`. Latch resolves the placeholders inside the enclave, checks
the payee against the data owner's allowlist, and refuses **before** any egress.

Live testnet run against the registered contract:

```text
POST /pay  { invoiceId:"northwind-042", vendor:"shadow-logic-ai", amount:4250, currency:"EUR" }
→ 200 { "result":"deny", "reason":"payee_mismatch", "mode":"live",
        "vendor":"shadow-logic-ai", "invoice_id":"northwind-042", ... }
```

`shadow-logic-ai` is not in the `latch-policy` allowlist, so the enclave denies
with `payee_mismatch`. When the vendor *is* allowlisted but no rail key exists,
the contract runs to the rail and returns a clean `rail_unconfigured` error.
The check happens on-chain, not in the model.

## Architecture

```text
Browser / MCP client
   │
   ├── Next.js app (Vercel) ── /api/demo/* routes (rate limited)
   │        │
   │        └── Latch bridge (plain Node, 127.0.0.1:8787)
   │                 │   POST /pay   GET /audit   POST /revoke   GET /health
   │                 │   the T3N SDK runs here, away from bundlers
   ▼                 ▼
   Terminal 3 TEE contract  z:<tenant>:latch-pay   (version 0.1.2, numeric id 1050)
      ├─ pay-invoice     resolve {{vendor.iban}} in-enclave, allowlist check, egress
      ├─ latch-policy    private KV map: data owner's vendor allowlist + payee IBAN
      └─ secrets         private KV map: payment_rail, payment_api_key (rail-agnostic)
```

The T3N SDK loads a WASM component that Next.js bundlers can break, so the SDK
lives in a tiny plain-Node bridge and the web routes proxy to it. The MCP
stdlib server (`ap.pay`, `grants.revoke`, `audit.tail`) calls the same live
functions.

## Quickstart

Requirements: Node 18 or newer, and Rust with the `wasm32-wasip2` target when
you want to rebuild the contract yourself (the built `.wasm` is already in the
repo).

1. **Claim a tenant key.** Visit the Terminal 3 test-token page, sign in with
   Google SSO and a work email, and copy the data owner key into `T3N_API_KEY`.
   If you want the agent path, claim a separate agent key and set
   `T3N_AGENT_KEY` too. Keys are server-side only; never use `NEXT_PUBLIC_`.
2. **Copy the environment.**

   ```bash
   cp .env.example .env
   ```

   Fill in `T3N_API_KEY`. `PAYMENT_RAIL=lemonsqueezy` is the default rail; add
   `PAYMENT_API_KEY` and `LEMONSQUEEZY_VARIANT_ID` only when you want the
   approve path to actually open a checkout.
3. **Install and register.**

   ```bash
   npm install
   npm run register        # registers the TEE contract, creates the KV maps, seeds allowlist
   ```

   Registration is idempotent. It reads `contracts/.registered.json` and skips
   re-registration when the live version already matches, so rerunning never
   bumps the contract version.
4. **Start the bridge, then the app.**

   ```bash
   npm run bridge          # plain Node surface on 127.0.0.1:8787
   # in a second terminal
   npm run dev             # Next.js on http://localhost:3000
   ```

   Open `http://localhost:3000/app`, press Run the invoice. The console shows
   the live decision. Health is at `GET /api/health`. When the bridge is not
   reachable the demo routes fall back to a clearly labelled sandbox with a
   visible caption, so judges never mistake a simulation for a payment.

## Configuration

| Variable | Purpose |
| --- | --- |
| `T3N_ENV` | `testnet` (default), `sandbox`, or `production`. |
| `T3N_API_KEY` | Tenant (data owner) key from the Terminal 3 test-token page. |
| `T3N_AGENT_KEY` | Optional agent key. When absent, the agent grant is skipped and the tenant self-call drives the demo. |
| `PAYMENT_RAIL` | `lemonsqueezy` (default) or `stripe`. The contract egress is rail-agnostic and reads the rail from `secrets`. |
| `PAYMENT_API_KEY` | Rail API key seeded into the tenant `secrets` map. |
| `LEMONSQUEEZY_VARIANT_ID` | Required by Lemonsqueezy to build a checkout. |
| `DEMO_IBAN` | Testnet IBAN used as the policy-entry fallback payee. |
| `LATCH_BRIDGE_URL` | Base URL of the bridge (`http://127.0.0.1:8787` in dev). |

## The contract

`contracts/src/pay.rs` implements `pay-invoice`. Given a vendor, amount and
currency it:

1. reads the rail and API key from the tenant `secrets` map;
2. builds the egress request, substituting `{{profile.vendor.iban}}` when no
   explicit payee is supplied, and falls back to the allowlist entry's `iban`
   when the host profile schema refuses the placeholder (`payee_via: "explicit"`);
3. rejects with `payee_mismatch` when the vendor is absent from `latch-policy`;
4. refuses with a contract-level error when no rail key is configured;
5. records the outcome row on the live ledger.

Build and test:

```bash
cd contracts
cargo test --lib --target x86_64-pc-windows-gnu     # 8/8 pass
cargo build --release --target wasm32-wasip2
```

Note that plain `cargo test` fails on Windows because the pinned
`wasm32-wasip2` target cannot execute natively; pass the GNU host target
explicitly as above.

## Web routes

| Route | Method | Limit | Body | Returns |
| --- | --- | --- | --- | --- |
| `/api/demo/invoice` | POST | 10/min/IP | `{ invoiceId }` | `{ result, reason, mode, ... }` |
| `/api/demo/status` | GET | 30/min/IP | - | live audit rows |
| `/api/health` | GET | - | - | `{ ok, live, rail, tenantDid, ... }` |

## MCP tools

| Tool | Description |
| --- | --- |
| `ap.pay` | Authorises an invoice, deny on `payee_mismatch` / `egress_denied` / placeholder-not-permitted. |
| `grants.revoke` | Clears a delegated function grant in one write. |
| `audit.tail` | Returns the recent activity rows for the contract. |

## SDK note

`BUILD_GUIDE.md` refers to the T3N SDK as "sdk 52". This repo pins
`@terminal3/t3n-sdk@^5.17.0` in `mcp/package.json`, which is the version that
was current and verified against the live testnet for this build. The proof of
life is the registered contract version `0.1.2` (numeric id `1050`) at
`z:c2822885992d966ae9d8e027223a8e7dee806909:latch-pay`.

## Handover

Latch is small by design so Terminal 3 can host it after judging. Provide a
testnet tenant and agent key to the Node MCP process, run `npm run register`
once to place the contract and maps, and keep the web app on Vercel with the
bridge beside the T3N workload. The deny path works with just the tenant key;
the approve path needs a real rail key and is intentionally unconfigured until
an operator seeds it. New contract versions issue a fresh numeric id, and the
registration script re-pins the map ACLs to it automatically (see BUGS.md).

## Submission

**Title:** Latch
**Tagline:** Let the agent pay. Never let it see.
**Listing:** https://superteam.fun/earn/listing/t3n-agent-build-challenge

Latch is an MCP sidecar for Terminal 3. Existing agents keep thinking; Latch
wraps the action, resolves placeholders inside a TEE, and writes an audit row
before anything leaves. PayLock is the reference skill: accounts payable that
cannot be retargeted by hidden invoice text. Policy is allowlist-based, revoke
is one grant write, and the repo includes handover notes if Terminal 3 wants to
host it. The deny is the proof: the same poisoned invoice that a naive agent
would pay is refused on-chain with `payee_mismatch`.