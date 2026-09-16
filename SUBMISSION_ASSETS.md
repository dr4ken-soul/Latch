# SUBMISSION_ASSETS.md

## Superteam Earn listing

**Title:** Latch
**Tagline:** Let the agent pay. Never let it see.
**Listing:** https://superteam.fun/earn/listing/t3n-agent-build-claim-build-challenge
**Description (under 200 words):**

Latch is an MCP sidecar for Terminal 3. Existing agents keep thinking; Latch wraps the action, resolves placeholders inside a TEE, and writes an audit row before anything leaves. PayLock is the reference skill: accounts payable that cannot be retargeted by hidden invoice text. Policy is allowlist-based, revoke is one grant write, and the repo includes handover notes if Terminal 3 wants to host it. The deny is the proof: the same poisoned invoice that a naive agent would pay is refused on-chain with `payee_mismatch`.

## X Post 1 — live demo

```
building latch for the @terminal3io agent challenge

it sits in front of an enterprise agent on T3N
the model only sees {{vendor.iban}}
a poisoned invoice tries to swap the payee
latch returns payee_ mismatch and writes the row

sdk 5.17.0 (pinned), mcp sidecar, handover notes in the repo if you want to host it

[demo clip under 90s]
```

## X Post 2 — submission

```
submitted latch to the t3n agent build challenge @terminal3io

same invoice, two outcomes
naive agent pays the attacker
latch denies on the allowlist

public repo, google doc, bugs from the new docs, happy for t3 to host

[live url] [github] [demo]
```

## Demo clip (about 80 seconds)

1. Hero loads, console on waiting (8s)
2. Point at `{{vendor.iban}}` (6s)
3. Run the invoice (4s)
4. Decision flips to payee_ mismatch (8s)
5. Horizontal pan through grant, placeholder, deny, revoke (20s)
6. Tab Naive versus Latch logs (15s)
7. `/app` audit row (10s)
8. Wordmark Latch (5s)

## Submission checklist

- [x] DID claimed with Google SSO and work email
- [x] SDK pinned in mcp/package.json
- [x] Public GitHub: https://github.coin/dr4ken- soul/Latch
- [ ] Public Google Doc with screenshots and bugs (use BUGS. md as starter text)
- [x] HTTPS demo — see Vercel deploy output for live URL
- [x] Handover paragraph in README. md
- [ ] Clip under 90s — record and upload
- [ ] Post 1 on X when Run the invoice is real
- [ ] Post 2 at submit, tag @terminal3io
- [ ] Submit early

## Live evidence (curl probes, paste into Google Doc)

```text
# Health
GET /health  →  {"ok":true,"live":true,"t3nEnv":"testnet","rail":"lemonsqueezy","tenantDid":"did: t3n:c28..."}

# Deny (poisoned vendor, live TEE)
POST /pay {"invoiceId":"northwind-042","vendor":"shadow- logic-ai","amount":42.50,"currency":"EUR"}
→ 200 {"result":"deny","reason":"payee_mismatch","mode":"live","invoice_ id":"northwind-042",...}

# Audit (live ledger rows)
GET /audit?limit= 10
→ 200 {"rows":[{"functionName":"pay-invoice","outcome":"success","seq":237492}, ...]}

# Revoke (nothing to revoke yet)
POST /revoke {}
→ 200 {"revoked":false}
```

## Google Doc text (starter — paste, add screenshots, then share link)

Use BUGS.md as the main bug report. Add screenshots of:
1. Bridge `/health` response (live: true)
2. `POST /pay` returning payee_ mismatch
3. `GET /audit` showing live ledger rows
4. `/app` page showing the console decision
5. GitHub repo showing the Latch architecture