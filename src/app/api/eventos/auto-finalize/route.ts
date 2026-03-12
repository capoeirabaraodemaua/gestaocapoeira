import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BUCKET = 'photos';
const KEY = 'eventos/eventos.json';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
const supabaseWrite = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAll() {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()) as any[]; } catch { return []; }
}

async function saveAll(list: any[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  return supabaseWrite.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

/**
 * GET /api/eventos/auto-finalize
 * Called on page load from the admin panel.
 * Finds all non-finalized events whose datetime has passed and applies graduations.
 * Returns { applied: number, events: string[] }
 */
export async function GET() {
  const now = new Date();
  const list = await getAll();

  const toFinalize = list.filter((ev: any) => {
    if (ev.finalizado) return false;
    if (!ev.data || !ev.hora) return false;
    // Build datetime in local Brasília time: compare UTC to event local time
    const evDt = new Date(`${ev.data}T${ev.hora}:00-03:00`); // Brasília = UTC-3
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

  return NextResponse.json({
    applied: appliedEvents.length,
    events: appliedEvents,
  });
}
