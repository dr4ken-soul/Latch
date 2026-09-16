import { NextResponse } from 'next/server';

/** Returns the public sandbox status and activity rows. */
export async function GET() { return NextResponse.json({ decision: 'waiting', lastRows: [] }); }
