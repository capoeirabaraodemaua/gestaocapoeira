import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const LIXEIRA_KEY = 'config/lixeira.json';
const EXTRAS_KEY = 'extras/student-extras.json';

async function loadJson(key: string): Promise<unknown> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(key, 30);
    if (!data?.signedUrl) return key.endsWith('.json') ? (key.includes('extras') ? {} : []) : [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return key.includes('extras') ? {} : [];
    return await res.json();
  } catch { return key.includes('extras') ? {} : []; }
}

async function saveJson(key: string, data: unknown): Promise<void> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload(key, blob, { upsert: true });
}

// POST /api/lixeira/restaurar — re-inserts student into DB and removes from lixeira
export async function POST(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const lixeira = await loadJson(LIXEIRA_KEY) as Array<{ id: string; student: Record<string, unknown>; extras?: Record<string, string> }>;
  const entry = lixeira.find(e => e.id === id);
  if (!entry) return NextResponse.json({ error: 'not found in lixeira' }, { status: 404 });

  // Remove fields that shouldn't be re-inserted
  const { id: _id, ...studentData } = entry.student as Record<string, unknown> & { id: string };

  // Try to re-insert with original UUID
  const insertPayload = { id, ...studentData };

  // Remove extras columns from insert payload (may not exist in DB)
  const p = insertPayload as Record<string, unknown>;
  delete p.apelido;
  delete p.nome_social;
  delete p.sexo;
  delete p.ordem_inscricao;
  delete p.ultimo_checkin;
  delete p.checkin_nucleo;

  const { error } = await supabaseAdmin.from('students').insert(insertPayload);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Restore extras to student-extras Storage
  if (entry.extras && Object.keys(entry.extras).length > 0) {
    try {
      const extMap = await loadJson(EXTRAS_KEY) as Record<string, Record<string, string>>;
      extMap[id] = entry.extras;
      await saveJson(EXTRAS_KEY, extMap);
    } catch {}
  }

  // Remove from lixeira
  await saveJson(LIXEIRA_KEY, lixeira.filter(e => e.id !== id));

  return NextResponse.json({ ok: true });
}
