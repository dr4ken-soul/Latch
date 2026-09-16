import { NextResponse } from 'next/server';

/** Returns the deterministic sandbox decision without exposing a secret. */
export async function POST() { return NextResponse.json({ result: 'deny', reason: 'payee_mismatch', mode: 'sandbox' }); }
