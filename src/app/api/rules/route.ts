import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listRules } from '@/lib/db/configs';

export async function GET() {
  const db = getDb();
  return NextResponse.json(listRules(db));
}
