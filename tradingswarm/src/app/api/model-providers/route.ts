import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listModelProviders } from '@/lib/db/configs';

export async function GET() {
  const db = getDb();
  return NextResponse.json(listModelProviders(db));
}
