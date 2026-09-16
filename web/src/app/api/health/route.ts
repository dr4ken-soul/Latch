import { NextResponse } from 'next/server';

/** Provides a public deployment health check. */
export async function GET() { return NextResponse.json({ ok: true }); }
