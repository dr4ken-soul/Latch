# MARKETING.md: Latch

## Goal

Get Latch in front of Terminal 3 judges during the Superteam window. Prove the deny, do not explain the architecture.

Core public proof: the same poisoned invoice, a naive send versus `payee_mismatch` on Latch, an audit row, and a public GitHub.

## Voice

Builder, not company. One idea per post. Show a recording. Tag @terminal3io. British English. No em dashes. No seamless, unlock, or next-gen.

Primary CTA on the site remains Run the invoice. Posts can say submitted or watch the deny.

## Post 1, live demo

```
building latch for the @terminal3io agent challenge

it sits in front of an enterprise agent on T3N
the model only sees {{vendor.iban}}
a poisoned invoice tries to swap the payee
latch returns payee_mismatch and writes the row

sdk 52, mcp sidecar, handover notes in the repo if you want to host it

[demo clip under 90s]
```

## Post 2, submission

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
4. Decision flips to payee_mismatch (8s)
5. Horizontal pan through grant, placeholder, deny, revoke (20s)
6. Tab Naive versus Latch logs (15s)
7. `/app` audit row (10s)
8. Wordmark Latch (5s)

## Submission notes

**Title:** Latch
**Tagline:** Let the agent pay. Never let it see.
**Listing:** https://superteam.fun/earn/listing/t3n-agent-build-challenge

**Description (under 200 words):**

Latch is an MCP sidecar for Terminal 3. Existing agents keep thinking. Latch wraps the action, resolves placeholders inside a TEE, and writes an audit row before anything leaves. PayLock is the reference skill: accounts payable that cannot be retargeted by hidden invoice text. Policy is YAML. Revoke is one grant write. The repo includes a handover if Terminal 3 wants to host it.

## Checklist

- [ ] DID claimed with Google SSO and work email
- [ ] SDK 52 locked in package.json
- [ ] Public GitHub
- [ ] Public Google Doc with screenshots and bugs
- [ ] HTTPS demo
- [ ] Handover paragraph (prefer T3 host)
- [ ] Clip under 90s
- [ ] Post 1 when Run the invoice is real
- [ ] Post 2 at submit, tag @terminal3io
- [ ] Submit early
