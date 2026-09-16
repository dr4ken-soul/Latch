# BUGS.md

Working notes from building Latch against the live Terminal 3 testnet. These
are the sharp edges worth carrying into the T3N platform feedback loop. The
final paragraphs double as the starter text for the public Google Doc.

## 1. Map ACLs must chase the fresh numeric contract id

Every version bump issues a **new numeric contract id** (this build moved from
1048 to 1050). The tenant KV maps are locked to `writers`/`readers` of a
specific numeric id, so after any re-registration the executing contract loses
read access to its own `secrets` and `latch-policy` maps until the ACLs are
re-pinned.

This was a real failure mode: the deny path broke with access-denied errors
because the maps still pointed at a stale id. The fix was to call
`tenant.maps.update(tail, { visibility, writers, readers })` with the freshly
resolved `contract_id` after every register/skip, not just on map create.

Takeaway for T3N: either expose the numeric id inside the contract execution
path, or allow ACL pinning by `tail`/`name` so upgrades do not silently sever
map access.

## 2. `TenantClient.contracts.register` requires an undocumented `baseUrl`

Calling `tenant.contracts.register(...)` throws

```text
TenantSdkValidationError: requires config field(s): baseUrl
```

even though the tenant session was constructed with a node URL. The fix was to
add `baseUrl` and `endpoint` to the `TenantClient` config explicitly. It is not
documented on the method signature and only surfaces at call time, which makes
it easy to ship a registration script that fails on the first deploy.

## 3. Host profile schema refuses non-schema keys

`submitUserInput` (and the cluster profile writer) enforce a strict schema.
Writing the custom `vendor` key returns

```text
UnrecognizedKeys: ...
```

so the documented `{{profile.vendor.iban}}` placeholder cannot be populated
through the public profile path on the current testnet. The contract now
carries the payee IBAN on each `latch-policy` allowlist entry as the fallback
and reports `payee_via: "explicit"` when it uses that path. When the host
schema grows to accept custom profile keys, the marker path resumes without a
contract change.

## 4. `cargo test` fails natively with a WASM-only target

The workspace pins `wasm32-wasip2`, which cannot execute on a host without the
WASM runtime. `cargo test` therefore errors at spawn (`%1 is not a valid Win32
application`) unless a host target is passed:

```bash
cargo test --lib --target x86_64-pc-windows-gnu
```

The 8 unit tests pass on the GNU host target. Add a `.cargo/config.toml`
alias or CI job so contributors are not surprised.

## 5. TS strict cannot prove assignment in the registration skip path

After adding the skip-path (read `.registered.json`, resolve live version,
skip re-registration), `let version: string;` was only assigned inside the
`if` and loop branches. `tsc` raised `TS2454: used before being assigned` at
two call sites. The fix was to initialise `let version: string =
CONTRACT_VERSION;` so the variable is always defined, which is also correct
because the local constant is the baseline when no live version is resolved.

## 6. Bridge shell reporting quirk (local dev only)

A bridge process started in the background can report "background shell not
found" when polled while still serving traffic. Do not trust the poll; probe
the port directly (`GET /health`) before assuming the bridge is down.

## Google Doc starter text

Same content as above, plus:

- screenshots of the four live curl probes (health, deny, audit, revoke);
- a screenshot of the `/app` console flipping to `payee_mismatch` in live mode;
- the note that the approve path is intentionally gated until a real rail key
  is seeded, and that the bridge is loopback-only by default.