import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { AgentEventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id');
  const lastEventId = request.headers.get('Last-Event-ID');

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const db = getDb();
      let cursor = lastEventId ? parseInt(lastEventId, 10) : 0;

      const poll = () => {
        if (closed) return;

        try {
          let sql: string;
          const params: unknown[] = [];

          if (agentId) {
            sql = `SELECT * FROM agent_events WHERE agent_id = ? AND id > ? ORDER BY id ASC LIMIT 100`;
            params.push(agentId, cursor);
          } else {
            sql = `SELECT * FROM agent_events WHERE id > ? ORDER BY id ASC LIMIT 100`;
            params.push(cursor);
          }

          const events = db.prepare(sql).all(...params) as AgentEventRow[];

          for (const event of events) {
            const data = {
              agent_id: event.agent_id,
              event_type: event.event_type,
              cycle_id: event.cycle_id,
              data: event.data_json ? JSON.parse(event.data_json) : null,
              created_at: event.created_at,
            };

            const sseMessage = `id: ${event.id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(sseMessage));
            cursor = event.id;
          }
        } catch (err) {
          // If DB error, send error event
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorEvent = `event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        }

        if (!closed) {
          setTimeout(poll, 500);
        }
      };

      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`));

      // Start polling
      poll();

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        closed = true;
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
