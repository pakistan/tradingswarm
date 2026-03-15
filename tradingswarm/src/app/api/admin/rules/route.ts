import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listRules, createRule, deleteRule } from '@/lib/db/configs';

export async function GET() {
  const db = getDb();
  const rules = listRules(db);
  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, prompt_text, description, category } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!prompt_text || typeof prompt_text !== 'string') {
      return NextResponse.json({ error: 'prompt_text is required' }, { status: 400 });
    }

    const db = getDb();
    const rule = createRule(db, name, prompt_text, description, category);
    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleIdStr = searchParams.get('rule_id');

    if (!ruleIdStr) {
      return NextResponse.json({ error: 'rule_id query param is required' }, { status: 400 });
    }

    const ruleId = parseInt(ruleIdStr, 10);
    if (isNaN(ruleId)) {
      return NextResponse.json({ error: 'rule_id must be a number' }, { status: 400 });
    }

    const db = getDb();
    deleteRule(db, ruleId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
