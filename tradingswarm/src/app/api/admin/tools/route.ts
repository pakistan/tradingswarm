import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listTools } from '@/lib/db/configs';

export async function GET() {
  const db = getDb();
  const tools = listTools(db);
  return NextResponse.json(tools);
}
