import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const postId = parseInt(params.id, 10);
  if (isNaN(postId)) return NextResponse.json({ error: 'Invalid post id' }, { status: 400 });

  const db = getDb();
  // Delete replies first, then the post
  db.prepare('DELETE FROM posts WHERE parent_id = ?').run(postId);
  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

  return NextResponse.json({ ok: true });
}
