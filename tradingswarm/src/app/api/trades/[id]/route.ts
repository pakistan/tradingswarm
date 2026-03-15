import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { getTradeById } from '@/lib/db/trades';
import { getSnapshot } from '@/lib/db/snapshots';
import { getAgent } from '@/lib/db/agents';
import { getVersion } from '@/lib/db/configs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const tradeId = parseInt(params.id, 10);
  if (isNaN(tradeId)) {
    return NextResponse.json({ error: 'Invalid trade ID' }, { status: 400 });
  }

  const db = getDb();
  const trade = getTradeById(db, tradeId);
  if (!trade) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  }

  const snapshot = trade.snapshot_id ? getSnapshot(db, trade.snapshot_id) : null;
  const agent = getAgent(db, trade.agent_id);
  const configVersion = agent?.config_version_id
    ? getVersion(db, agent.config_version_id)
    : null;

  return NextResponse.json({
    trade,
    snapshot,
    agent,
    configVersion,
  });
}
