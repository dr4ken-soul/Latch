/**
 * Latch live provisioning script.
 *
 * One-shot setup against the T3N testnet, safe to re-run:
 *   1. Authenticate the tenant (T3N_API_KEY, the data owner).
 *   2. Register the Latch TEE contract WASM under `z:<tid>:latch-pay`
 *      (bumps the patch version when the same version is already registered).
 *   3. Create the `secrets` and `latch-policy` KV maps, read/write restricted
 *      to the contract's numeric id.
 *   4. Seed the payment rail key(s) into `secrets`.
 *   5. Seed the vendor allowlist into `latch-policy`.
 *   6. Seed the data owner's profile with the payee IBAN so the
 *      `{{profile.vendor.iban}}` placeholder resolves host-side.
 *   7. When T3N_AGENT_KEY is set, grant that agent the single `pay-invoice`
 *      edge with the rail's egress hosts.
 *
 * Run: npm run register --workspace mcp
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getEnv } from './env.js';
import {
  getTenantSession,
  getAgentSession,
  contractId,
  resolveContractVersion,
  CONTRACT_TAIL,
  CONTRACT_VERSION,
} from './t3n.js';

/** Default per-vendor ceilings for the demo allowlist (major units, EUR). */
const DEFAULT_ALLOWLIST: Record<
  string,
  { allowed: boolean; max_amount: number; currency: string; iban: string }
> = {
  'acme-cloud': {
    allowed: true,
    max_amount: 500,
    currency: 'EUR',
    iban: 'NL63ABNA0000000001',
  },
  'northwind-hosting': {
    allowed: true,
    max_amount: 200,
    currency: 'EUR',
    iban: 'NL63ABNA0000000001',
  },
  'paper-trail-supplies': {
    allowed: true,
    max_amount: 120,
    currency: 'EUR',
    iban: 'NL63ABNA0000000001',
  },
};

/** Egress hosts the agent may reach through the Latch contract. */
function railHosts(rail: string): string[] {
  return rail === 'stripe'
    ? ['api.stripe.com']
    : ['api.lemonsqueezy.com'];
}

/** Read the compiled WASM component produced by the contracts crate. */
async function readWasm(): Promise<Uint8Array> {
  const wasmPath = fileURLToPath(
    new URL('../../contracts/target/wasm32-wasip2/release/z_latch_pay.wasm', import.meta.url),
  );
  const bytes = await readFile(wasmPath);
  return new Uint8Array(bytes);
}

/** Bump `0.1.3` to `0.1.4`. */
function bumpPatch(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

async function main() {
  const env = getEnv();
  if (!env.tenantKey) {
    console.error('T3N_API_KEY is not set — add it to .env first.');
    process.exit(1);
  }

  const { t3n, did, tenant } = await getTenantSession();
  console.log(`tenant did:    ${did}`);
  console.log(`t3n env:       ${env.t3nEnv}`);
  console.log(`payment rail:  ${env.paymentRail}`);

  // 2. Register the WASM. Same-version re-registration is rejected, so if the
  //    state file says this version is already live, reuse its numeric id;
  //    otherwise bump the patch until the registration lands.
  const statePath = fileURLToPath(
    new URL('../../contracts/.registered.json', import.meta.url),
  );
  let version: string = CONTRACT_VERSION;
  let canonical: string;
  let registered: { name: string; contract_id: number } | null = null;
  let lastError: unknown = null;
  try {
    const state: { name?: string; numericId?: number; version?: string } = JSON.parse(
      await readFile(statePath, 'utf8'),
    );
    if (state.name && state.numericId && state.version) {
      const live = await resolveContractVersion(did);
      if (live === state.version) {
        registered = { name: state.name, contract_id: state.numericId };
        version = state.version;
        console.log(
          `contract:      ${state.name} already live (numeric id ${registered.contract_id}, version ${version})`,
        );
      }
    }
  } catch {
    lastError = null;
  }
  if (!registered) {
    const wasm = await readWasm();
    let attemptVersion = CONTRACT_VERSION;
    for (let attempt = 0; attempt < 12 && !registered; attempt += 1) {
      try {
        registered = await tenant.contracts.register({
          tail: CONTRACT_TAIL,
          version: attemptVersion,
          wasm,
        });
        version = attemptVersion;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (/exist|duplicate|version/i.test(message)) {
          attemptVersion = bumpPatch(attemptVersion);
          continue;
        }
        throw error;
      }
    }
    if (!registered) {
      console.error('contract registration failed', lastError);
      process.exit(1);
    }
  }
  canonical = registered!.name || contractId(did);
  console.log(`contract:      ${canonical} (numeric id ${registered!.contract_id}, version ${version})`);

  // 3. Create the KV maps, locked to the contract. Re-running when the maps
  //    already exist is fine — catch and continue.
  for (const tail of ['secrets', 'latch-policy']) {
    try {
      await tenant.maps.create({
        tail,
        visibility: 'private',
        writers: { only: [registered.contract_id] },
        readers: { only: [registered.contract_id] },
      });
      console.log(`map created:   z:${did.replace(/^did:t3n:/, '')}:${tail}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/exist/i.test(message)) {
        console.log(`map present:   z:${did.replace(/^did:t3n:/, '')}:${tail}`);
      } else {
        throw error;
      }
    }
    // A version bump issues a fresh numeric contract id; the ACL must chase
    // it or the executing contract loses read access to its own maps.
    await tenant.maps.update(tail, {
      visibility: 'private',
      writers: { only: [registered.contract_id] },
      readers: { only: [registered.contract_id] },
    });
  }

  // 4. Seed the rail secrets. Control-plane writes bypass the map ACL by design.
  if (!env.paymentApiKey) {
    console.warn('warning:       no payment rail API key configured (PAYMENT_API_KEY / STRIPE_TEST_KEY) — the approve path will deny with rail_unconfigured');
  } else {
    await tenant.maps.entrySet('secrets', 'payment_rail', env.paymentRail);
    await tenant.maps.entrySet('secrets', 'payment_api_key', env.paymentApiKey);
    if (env.paymentRail === 'lemonsqueezy') {
      if (env.lemonsqueezyVariantId) {
        await tenant.maps.entrySet('secrets', 'lemonsqueezy_variant_id', env.lemonsqueezyVariantId);
      } else {
        console.warn('warning:       LEMONSQUEEZY_VARIANT_ID not set — Lemonsqueezy approve path needs it');
      }
    }
    console.log(`secrets:       ${env.paymentRail} key sealed in z:<tid>:secrets`);
  }

  // 5. Seed the vendor allowlist. The poisoned demo vendor (`shadow-logic-ai`)
  //    is deliberately absent. Each entry carries the payee IBAN so the
  //    approve path has a data-owner-declared fallback when the cluster's
  //    strict profile schema refuses non-schema placeholders.
  const iban = env.demoIban || 'NL63ABNA0000000001';
  for (const [vendor, policy] of Object.entries(DEFAULT_ALLOWLIST)) {
    await tenant.maps.entrySet('latch-policy', vendor, JSON.stringify({ ...policy, iban }));
  }
  console.log(`allowlist:     ${Object.keys(DEFAULT_ALLOWLIST).join(', ')} (poisoned vendors absent by design)`);

  // 6. Seed the data owner's profile with the payee IBAN. The contract only
  //    ever emits the {{profile.vendor.iban}} marker; the host resolves it
  //    from this profile inside the enclave. The schema is strict, so an
  //    off-schema key may be refused: that is non-fatal and reported.
  try {
    const upsert = await t3n.submitUserInput({
      profile: { vendor: { iban } } as never,
      becomeDevTenant: true,
    });
    if (upsert.refusedFields?.length) {
      console.warn(`profile:       refused fields: ${upsert.refusedFields.join(', ')}`);
    }
    console.log(`profile:       vendor.iban seeded (${iban.slice(0, 4)}…${iban.slice(-4)})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `profile:       cluster profile schema refused vendor.iban (${message.slice(0, 120)})`,
    );
    console.warn('profile:       falling back to the policy-entry IBAN for approve-path egress');
  }

  // 7. Grant the agent the pay-invoice edge when its key is configured.
  const agent = await getAgentSession();
  if (agent) {
    await t3n.addMemberDelegationGrants([
      {
        grantee: agent.did,
        contract_id: canonical,
        function: 'pay-invoice',
        scopes: [{ path: 'vendor.iban', access: ['read'] }],
        version_req: `>=${CONTRACT_VERSION}`,
        allowed_hosts: railHosts(env.paymentRail),
      },
    ]);
    console.log(`agent grant:   ${agent.did} → ${canonical} (pay-invoice, hosts: ${railHosts(env.paymentRail).join(', ')})`);
  } else {
    console.log('agent grant:   skipped — T3N_AGENT_KEY not set (claim one at https://www.terminal3.io/claim-page)');
  }

  await writeFile(
    fileURLToPath(new URL('../../contracts/.registered.json', import.meta.url)),
    JSON.stringify({ name: canonical, numericId: registered.contract_id, version, tenantDid: did }, null, 2),
  );
  console.log('done.         state written to contracts/.registered.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
