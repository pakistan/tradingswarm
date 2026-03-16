import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { FeedbackAnalyzer } from '@/lib/trading/feedback';

export async function GET() {
  const db = getDb();
  const analyzer = new FeedbackAnalyzer(db);
  const summary = analyzer.analyze();
  return NextResponse.json(summary);
}
