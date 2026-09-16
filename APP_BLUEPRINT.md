# Latch — App Blueprint

Latch is an MCP sidecar for Terminal 3. It sits in front of any existing enterprise agent, wraps every outbound action, substitutes secrets inside a TEE, and writes an audit row before the call leaves. PayLock is the reference skill: a prompt-injection-proof accounts payable path that refuses a poisoned payee.

Built for the Terminal 3 Network agent build challenge on Superteam Earn. The listing asks for an enterprise agent they can distribute and host, with usefulness and ease of maintenance scored above everything else. Latch is that product. Remove Terminal 3 and it is a policy proxy with no enclave, no placeholders, and no ledger.

---

## Product summary

A member grants Latch a scoped slice of authority: named functions, named hosts, optional time window. The agent never receives standing access. When the agent tries to pay a vendor, it only sees `{{vendor.iban}}`. The T3N host resolves the placeholder inside the enclave, checks the allowlist, and either sends the payment through Agent Connect (Stripe test) or returns `payee_mismatch`. Revoke is `grants: []`.

PayLock is not a second product. It is the default skill on the sidecar, and it is the sixty-second judging clip.

---

## Market context

**Who this is for**

1. Enterprise security and finance leads who will not put bank credentials in a model context window
2. Platform teams already running Claude Desktop, LangGraph, n8n, or similar, who need a kill-switch they did not have to rewrite their agent for
3. Terminal 3, who asked for something they can host after the challenge, plus a handover note

**What they currently use:** cloud agent control planes (Microsoft Agent 365, Google Agent Studio, AWS Bedrock agent tooling), secret managers (Vault, Doppler), and human AP approval in email. None of those keep PII out of the prompt and still let the agent complete a last-mile payment.

**Why they switch:** a poisoned invoice should fail on policy, not on the model's good behaviour. Latch makes that failure visible on a ledger the sponsor already runs.

---

## Competitive landscape

| Player | What they sell | Gap versus Latch |
|---|---|---|
| Microsoft Agent 365 | Discover and govern agents inside Microsoft | Walled garden. No T3N TEE placeholders. |
| Google Agent Studio | Registry and simulation inside Gemini Enterprise | Same wall. Prompt still sees tools with real secrets if you wire them that way. |
| AWS Bedrock agents | IAM-scoped tools on AWS | Cloud identity, not a confidential placeholder path. |
| HashiCorp Vault / Doppler | Secret storage | Storage, not an action layer with payee policy. |
| Human AP in the inbox | Four-eyes on payments | Slow. Does not stop an agent that already has the token. |

Exact dollar alternatives: Vault Cloud starts in the hundreds per month. Agent 365 is bundled into Microsoft 365 enterprise SKUs. The gap is not price. It is that none of them are the T3N ADK, which is what this bounty scores.

---

## Monetisation

This bounty pays 100 / 50 / 30 USDC. The real prize is the sponsor hosting Latch.

Post-challenge, if Terminal 3 lists it:

- Free sandbox on T3N test credits
- Hosted sidecar as part of their startup programme, no separate Stripe SKU in V1
- If Latch stays independent later: a single Pro tier at $199 / month per tenant for the MCP host and policy editor, billed on Stripe. Not in MVP.

Do not invent a three-tier SaaS page for the hackathon.

---

## MVP feature set

### 1. MCP sidecar

**User story:** As a platform engineer I want to point my existing agent at one MCP server so that every outbound call is identity-checked, placeholder-substituted, and logged.

**Acceptance:** An MCP client can list tools `ap.pay`, `grants.revoke`, `audit.tail`. A call with no matching grant returns a deny, not a hang. `getActivityLog()` shows the row.

**Complexity:** Medium

### 2. Placeholder pay path (PayLock)

**User story:** As a finance lead I want the agent to pay an invoice without ever seeing the IBAN so that prompt injection cannot retarget the funds.

**Acceptance:** Request body sent to the contract contains `{{vendor.iban}}` only. Stripe test or sandbox bank adapter receives the resolved value from the host. A swapped payee in the invoice text does not change the destination. Result is `deny` with `payee_mismatch` when the allowlist misses.

**Complexity:** High

### 3. Scoped grant and revoke

**User story:** As a data owner I want to grant one function, one host, and one window, and to empty that list in one write.

**Acceptance:** `updateMemberDelegation` merge path, not a blind document replace that wipes sibling grants. `grants: []` via `grants.revoke` stops the next `ap.pay`.

**Complexity:** Medium

### 4. Public demo console

**User story:** As a judge I want to press Run the invoice on the landing page and see waiting become `payee_mismatch` so I understand Latch without reading the repo.

**Acceptance:** Hero console and `/app` share the same state. No mock marketing counts. If the TEE path is down, the UI says sandbox, not sent.

**Complexity:** Medium

**What makes people care:** the deny. That is the feature that is not a chatbot.

**Not in V1:** four-eyes co-sign as a separate flow, multi-bank MPC, SIG questionnaires, a mobile app, production mainnet T3N, a custom LLM, wallet connect, protocol fees.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS | SSR landing, matches FRONTEND_SPEC.md, Vercel deploy |
| Motion | motion/react | Current import path. GSAP ScrollTrigger only for the horizontal pan |
| Icons | Google Material Icons or inline SVG | FRONTEND_SKILL unified icon rule |
| Backend / MCP | Node.js, TypeScript, official MCP SDK | Same language as the T3N JS SDK |
| T3N | `@terminal3/t3n-sdk` version 52 | Sponsor comment on the listing: use SDK 52 |
| TEE contract | Rust compiled to WASM, as in the ADK walkthrough | Required for `http-with-placeholders` |
| Payments | Stripe test via Agent Connect | Sponsor sandbox already wired |
| Auth | Server-side T3N API key and agent key. No wagmi | This is not a wallet dApp. Keys never go to the browser. |
| Database | None in V1 | Policy in tenant KV. Audit via `getActivityLog()` |
| Hosting | Vercel for web, Node process for MCP | T3N can take the contract + MCP after handover |
| LLM | None inside Latch | Latch authorises. The customer's agent already thinks. |

Monthly cost at 0 users: $0 on sandbox credits plus Vercel free. At 100 / 1000 / 10000: still dominated by T3N credits, not by this repo.

---

## Data

No application Postgres. Shapes the contract and the MCP already need:

**Grant (member delegation)**

```
grantee: did:t3n:…
contract_id: z:<tid>:latch-pay
functions: ["pay-invoice"]
allowed_hosts: ["api.stripe.com"]
window?: { valid_from_secs, valid_until_secs }
```

**Pay invoice input**

```
invoiceId: string
amount: string
currency: "USDC" | "USD"
payeeRef: "{{vendor.iban}}"
```

**Audit row (from activity log)**

```
at: string
functionName: string
result: "allow" | "deny"
reason?: "payee_mismatch" | "egress_denied" | "placeholder not permitted"
```

Vendor allowlist and Stripe secret live in tenant KV maps, never in the repo, never in prompts.

---

## MCP and HTTP surface

MCP tools (stdio or SSE, one server):

| Tool | Auth | Behaviour |
|---|---|---|
| `ap.pay` | agent DID with grant | Invoke TEE `pay-invoice` |
| `grants.revoke` | data owner session | Merge-write empty grant for this grantee |
| `audit.tail` | tenant session | Page `getActivityLog()` |

Next.js routes, all server-side:

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/demo/invoice` | none, rate 10 / min / IP | `{ invoiceId }` | `{ result, reason }` |
| GET | `/api/demo/status` | none, rate 30 / min / IP | | `{ decision, lastRows[] }` |
| GET | `/api/health` | public | | `{ ok: true }` |

No webhook in V1. Stripe test confirmation is inline in the contract response.

---

## User flow

1. Landing, no login
2. Run the invoice
3. Hero console moves waiting → payee_mismatch
4. Optional scroll through grant, placeholder, deny, revoke
5. `/app` shows policy YAML and the new audit row
6. Submission pack: GitHub, Google Doc, bugs, handover, X tag @terminal3io

Empty: audit list says Run the invoice to write the first row.
Loading: skeleton shimmer, no spinner.
Error: name the failure (missing T3N_API_KEY, egress_denied) and a retry.

---

## Environment

```
T3N_API_KEY=
T3N_AGENT_KEY=
T3N_ENV=testnet
NEXT_PUBLIC_SITE_URL=
STRIPE_TEST_KEY=
```

Browser never reads `T3N_API_KEY` or `T3N_AGENT_KEY`. No `NEXT_PUBLIC_` prefix on secrets.

---

## Build sequence

Adjusted for a live bounty, not a calm four-week SaaS.

**Week 1:** SDK 52 handshake, tenant DID, agent DID, empty TEE contract registered, MCP `audit.tail` against `getActivityLog()`, landing shell per FRONTEND_SPEC.md with the coded console.

**Week 2:** `pay-invoice` with placeholders, allowlist check, Stripe test or explicit sandbox caption, Run the invoice wired end to end.

**Week 3:** revoke path, `/app`, documentation, bugs from the refreshed docs, handover page.

**Week 4 buffer:** polish, X post, Google Doc, early submit. Do not wait out the clock. Time to submit is a scored criterion.

---

## Hackathon deliverables

- Public GitHub, README with install and handover
- Public Google Doc with screenshots and bugs
- Working demo URL
- Note on whether we keep running Latch or hand it to Terminal 3 (default: hand over, with a one-page process)
- X post tagging @terminal3io
- SDK 52, Google SSO plus work email on the claim page
