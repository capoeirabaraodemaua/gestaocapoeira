import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BUCKET = 'photos';
const KEY = 'eventos/eventos.json';

const supabaseWrite = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAll() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${KEY}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Cache-Control': 'no-cache, no-store',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return JSON.parse(await res.text()) as any[];
  } catch {
    return [];
  }
}

async function saveAll(list: any[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  const { error: updateErr } = await supabaseWrite.storage
    .from(BUCKET)
    .update(KEY, blob, { contentType: 'application/json' });
  if (updateErr) {
    await supabaseWrite.storage.from(BUCKET).upload(KEY, blob, { contentType: 'application/json' });
  }
}

export async function GET() {
  const now = new Date();
  const list = await getAll();

  const toFinalize = list.filter((ev: any) => {
    if (ev.finalizado) return false;
    if (!ev.data || !ev.hora) return false;
    const evDt = new Date(`${ev.data}T${ev.hora}:00-03:00`);
    return now >= evDt;
  });

  if (toFinalize.length === 0) {
    return NextResponse.json({ applied: 0, events: [] });
  }

  const appliedEvents: string[] = [];
  const updated = [...list];

  for (const ev of toFinalize) {
    let allOk = true;
    for (const p of ev.participantes || []) {
      if (!p.nova_graduacao || p.nova_graduacao === p.graduacao_atual) continue;
      const { error } = await supabaseWrite
        .from('students')
        .update({ graduacao: p.nova_graduacao, tipo_graduacao: p.tipo_graduacao || 'adulta' })
        .eq('id', p.student_id);
      if (error) { allOk = false; }
    }
    if (allOk) {
      const idx = updated.findIndex((e: any) => e.id === ev.id);
      if (idx >= 0) updated[idx] = { ...updated[idx], finalizado: true, updated_at: now.toISOString() };
      appliedEvents.push(ev.nome || ev.id);
    }
  }

  await saveAll(updated);

  return NextResponse.json({ applied: appliedEvents.length, events: appliedEvents });
}
