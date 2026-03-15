import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'extras/student-extras.json';

export interface StudentExtras {
  apelido?: string;
  nome_social?: string;
  sexo?: string;
}

type ExtrasMap = Record<string, StudentExtras>; // key = student id

async function loadExtras(): Promise<ExtrasMap> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function saveExtras(map: ExtrasMap): Promise<void> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

// GET /api/student-extras — returns full map or single student
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const map = await loadExtras();
  if (id) return NextResponse.json(map[id] || {});
  return NextResponse.json(map);
}

// POST /api/student-extras — upsert one student's extras (empty string = clear field)
export async function POST(req: NextRequest) {
  const { id, apelido, nome_social, sexo } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const map = await loadExtras();
  map[id] = {
    apelido:     apelido     !== undefined ? apelido     : (map[id]?.apelido     ?? ''),
    nome_social: nome_social !== undefined ? nome_social : (map[id]?.nome_social ?? ''),
    sexo:        sexo        !== undefined ? sexo        : (map[id]?.sexo        ?? ''),
  };
  await saveExtras(map);
  return NextResponse.json({ ok: true });
}

// DELETE /api/student-extras — remove one student's extras entirely
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const map = await loadExtras();
  delete map[id];
  await saveExtras(map);
  return NextResponse.json({ ok: true });
}
