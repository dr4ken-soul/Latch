# Latch — Agent Context

## What this is

Latch is an MCP sidecar for Terminal 3. It wraps outbound agent actions, resolves secrets inside a TEE, and logs them. PayLock is the reference skill: accounts payable that a poisoned invoice cannot retarget.

Hackathon: Terminal 3 Network agent build challenge, Superteam Earn, submissions open, winners listed for 23 September 2026.

## One-line pitch

Let the agent pay. Never let it see.

## Confirmed product decisions

- Name: Latch (not GrantGate, not PayLock as the product name)
- PayLock is the default skill, not a second brand
- No wallet connect, no wagmi, no lucide
- T3N keys stay on the server
- Default handover: Terminal 3 hosts it after judging
- Logo and favicon are comment slots until the user supplies files

## Confirmed design (do not reopen)

**Aesthetic hybrid:** bento operational + warm organic + light glass
**Nav:** E1 ghost top strip
**Motion:** parallax 2a+2b+2c on the hero, GSAP horizontal pan for four chapters, scroll blur-in with `once: false`
**Fonts:** Bricolage Grotesque, Figtree, IBM Plex Mono
**Palette:** Forest Minimal CSS variables in FRONTEND_SPEC.md
**Hero:** off-grid editorial, coded console module
**Sections in order:** nav, hero, statement, horizontal track, audit bento, tabbed demo, final CTA, footer
**Primary CTA:** Run the invoice
**Fingerprint:** asymmetric editorial / refined grotesk / quiet premium neutral / solid + inline asset / crescendo / scroll-driven narrative

Read FRONTEND_SPEC.md before touching any class. Read APP_BLUEPRINT.md before touching any contract or route.

## Repo hygiene

Do not commit the `reference/` directory (it is a clone of the z-tenant-flight example). It is in `.gitignore`.
Do not add `.env` or `web/.env.local` to git — they contain secrets or local config.
Use `--target x86_64-pc-windows-gnu` when running `cargo test` (wasm32-wasip2 cannot run natively on Windows).
Always run `npm run bridge` in its own shell before `npm run dev --workspace web`; the two processes are coupled on Windows.

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Motion | motion/react, GSAP + ScrollTrigger for the pan only |
| Icons | Material Icons CDN or inline SVG |
| MCP | Node.js, TypeScript |
| T3N | `@terminal3/t3n-sdk` **5.17.0** (pinned, BUILD_GUIDE says sdk 52) |
| Contract | Rust → WASM TEE, `http-with-placeholders` |
| Payments | Lemonsqueezy (default rail, via PAYMENT_API_KEY in secrets map) |
| DB | None. KV maps + `getActivityLog()` |
| Host | Vercel (web) |

## Structure

```
latch/
├── contracts/                 TEE contract (Rust/WASM)
├── mcp/                       MCP server
│   └── src/
│       ├── index.ts            MCP tools: ap.pay, grants.revoke, audit.tail
│       │   ├── t3n.ts              live TenantClient + AgentClient SDK calls
│       │   ├── env.ts              LatchEnv config from .env + process.env
│       │   ├── register.ts         idempotent registration (contract + maps + allowlist)
│       │   └── server.ts           plain-Node bridge (127.0.0.1:8787, SDK avoids bundler breakage)
├── bridge.ts  (in web/src/lib/)  Next.js proxy to bridge
├── rateLimit.ts  (in web/src/lib/)
├── web/
│   └── src/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── app/page.tsx
│       │   ├── api/demo/invoice/route.ts
│       │   ├── api/demo/status/route.ts
│       │   └── layout.tsx
│       ├── components/
│       │   ├── layout/Nav.tsx
│       │   ├── layout/Footer.tsx
│       │   └── sections/...
│       ├── hooks/useParallax.ts
│       └── styles/globals.css
├── FRONTEND_SPEC.md
├── APP_BLUEPRINT.md
├── BUILD_GUIDE.md
└── README.md
```

## Code rules

- camelCase in TypeScript
- JSDoc on every function and hook
- CSS variables, never hex in components
- CSS hover, never inline onMouseEnter style mutation
- Import motion from `motion/react`
- Blur-in default: `filter: blur(10px)` with opacity and y
- `viewport={{ once: false, amount: 0.1 }}` on every whileInView
- Skeletons, not spinners
- No localStorage for secrets or grants
- No Inter display, no JetBrains Mono, no Lucide
- No em dashes in copy, comments, README, or UI
- British English in user-facing strings
- `min-h-[100dvh]`, never `h-screen`
- Named z-index scale from the spec
- Magnetic and tilt use `useMotionValue`, not `useState`
- Coarse pointer and reduced motion disable parallax and the pan

## T3N rules

- SDK 52
- `setEnvironment("testnet")`
- `trustAnchor` from `fetchTrustedManifest("testnet")`
- Never hardcode tenant or agent DID. Read them from authenticate()
- Agent key ≠ tenant key
- `updateMemberDelegation` merge, do not blindly replace the whole grant document
- Placeholders in outbound HTTP, never inline PII in WASM
- Allowed hosts must be on the grant or the call is `egress_denied`

## Never

- Never put T3N_API_KEY in NEXT_PUBLIC_ vars
- Never show a real IBAN on the frontend
- Never ship a logo placeholder, emoji mark, or generated icon in the logo slot
- Never add a second primary CTA intent
- Never use `viewport={{ once: true }}`
- Never treat a sandbox deny as a successful payment
