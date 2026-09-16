import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Latch runtime configuration, resolved from process.env with the repo-root
 * `.env` file as a fallback so local dev has one source of truth.
 */
export interface LatchEnv {
  /** T3N cluster: `testnet` (default), `sandbox`, or `production`. */
  readonly t3nEnv: 'testnet' | 'sandbox' | 'production';
  /** Tenant (data owner) API key claimed from the Terminal 3 claim page. */
  readonly tenantKey?: string;
  /** Separate agent API key; the agent session is only used when set. */
  readonly agentKey?: string;
  /** Payment rail the TEE contract instructs: `lemonsqueezy` (default) or `stripe`. */
  readonly paymentRail: 'lemonsqueezy' | 'stripe';
  /** Payment rail API key, seeded into the tenant `secrets` KV map. */
  readonly paymentApiKey?: string;
  /** Lemonsqueezy variant id required to create checkouts. */
  readonly lemonsqueezyVariantId?: string;
  /** Testnet IBAN seeded into the data owner's profile for placeholder resolution. */
  readonly demoIban?: string;
}

interface RawEnv {
  T3N_ENV?: string;
  T3N_API_KEY?: string;
  T3N_AGENT_KEY?: string;
  PAYMENT_RAIL?: string;
  PAYMENT_API_KEY?: string;
  LEMONSQUEEZY_VARIANT_ID?: string;
  STRIPE_TEST_KEY?: string;
  DEMO_IBAN?: string;
}

/** Parse a `.env` file into a flat string record without external deps. */
function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Read the repo-root `.env` (two levels above this file). Returns an empty
 * record when absent so deployments can rely purely on real env vars.
 */
function readRootDotEnv(): Record<string, string> {
  try {
    const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
    return parseDotEnv(readFileSync(rootEnvPath, 'utf8'));
  } catch {
    return {};
  }
}

let cached: LatchEnv | null = null;

/** Resolve Latch configuration. Process env wins over the `.env` file. */
export function getEnv(): LatchEnv {
  if (cached) return cached;
  const file = readRootDotEnv();
  const raw: RawEnv = {
    T3N_ENV: process.env.T3N_ENV ?? file.T3N_ENV,
    T3N_API_KEY: process.env.T3N_API_KEY ?? file.T3N_API_KEY,
    T3N_AGENT_KEY: process.env.T3N_AGENT_KEY ?? file.T3N_AGENT_KEY,
    PAYMENT_RAIL: process.env.PAYMENT_RAIL ?? file.PAYMENT_RAIL,
    PAYMENT_API_KEY: process.env.PAYMENT_API_KEY ?? file.PAYMENT_API_KEY,
    LEMONSQUEEZY_VARIANT_ID: process.env.LEMONSQUEEZY_VARIANT_ID ?? file.LEMONSQUEEZY_VARIANT_ID,
    STRIPE_TEST_KEY: process.env.STRIPE_TEST_KEY ?? file.STRIPE_TEST_KEY,
    DEMO_IBAN: process.env.DEMO_IBAN ?? file.DEMO_IBAN,
  };
  const rail = raw.PAYMENT_RAIL === 'stripe' ? 'stripe' : 'lemonsqueezy';
  cached = {
    t3nEnv: raw.T3N_ENV === 'sandbox' || raw.T3N_ENV === 'production' ? raw.T3N_ENV : 'testnet',
    tenantKey: raw.T3N_API_KEY || undefined,
    agentKey: raw.T3N_AGENT_KEY || undefined,
    paymentRail: rail,
    paymentApiKey: (rail === 'stripe' ? raw.STRIPE_TEST_KEY : raw.PAYMENT_API_KEY) || undefined,
    lemonsqueezyVariantId: raw.LEMONSQUEEZY_VARIANT_ID || undefined,
    demoIban: raw.DEMO_IBAN || undefined,
  };
  return cached;
}

/** True when the live T3N path has the tenant key it needs. */
export function isLiveConfigured(): boolean {
  return Boolean(getEnv().tenantKey);
}
