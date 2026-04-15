import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/lixeira.json';

export interface LixeiraEntry {
  id: string;               // original student UUID
  deleted_at: string;       // ISO timestamp of deletion
  deleted_by: string;       // nucleo key of admin who deleted
  student: Record<string, unknown>; // full student data snapshot
  extras?: Record<string, string>;  // apelido/nome_social/sexo snapshot
}

async function loadLixeira(): Promise<LixeiraEntry[]> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function saveLixeira(list: LixeiraEntry[]): Promise<void> {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

// GET — list all deleted students
export async function GET() {
  const list = await loadLixeira();
  return NextResponse.json(list);
}

// POST — add student to lixeira (called before deleting from DB)
export async function POST(req: NextRequest) {
  const body = await req.json() as { student: Record<string, unknown>; deleted_by: string; extras?: Record<string, string> };
  if (!body.student?.id) return NextResponse.json({ error: 'student.id required' }, { status: 400 });
  const list = await loadLixeira();
  // Remove any previous entry with same id (idempotent)
  const filtered = list.filter(e => e.id !== String(body.student.id));
  filtered.unshift({
    id: String(body.student.id),
    deleted_at: new Date().toISOString(),
    deleted_by: body.deleted_by || 'geral',
    student: body.student,
    extras: body.extras,
  });
  await saveLixeira(filtered);
  return NextResponse.json({ ok: true });
}

// PUT — update student data inside lixeira (edit before restoring or just edit)
export async function PUT(req: NextRequest) {
  const { id, student, extras } = await req.json() as { id: string; student: Record<string, unknown>; extras?: Record<string, string> };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const list = await loadLixeira();
  const idx = list.findIndex(e => e.id === id);
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 });
  list[idx] = { ...list[idx], student: { ...list[idx].student, ...student }, extras: { ...(list[idx].extras || {}), ...(extras || {}) } };
  await saveLixeira(list);
  return NextResponse.json({ ok: true });
}

// DELETE — permanently remove from lixeira
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const list = await loadLixeira();
  await saveLixeira(list.filter(e => e.id !== id));
  return NextResponse.json({ ok: true });
}
