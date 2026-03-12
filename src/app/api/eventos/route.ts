import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
const supabaseWrite = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'eventos/eventos.json';

export interface EventoParticipant {
  student_id: string;
  nome_completo: string;
  nucleo: string;
  graduacao_atual: string;
  nova_graduacao: string;
  tipo_graduacao: string; // 'adulta' | 'infantil'
}

export interface Evento {
  id: string;
  tipo: 'batizado' | 'troca';
  nome: string;
  data: string;       // YYYY-MM-DD
  hora: string;       // HH:MM
  local: string;
  nucleo?: string;    // optional filter by nucleo
  participantes: EventoParticipant[];
  finalizado: boolean;
  created_at: string;
  updated_at: string;
}

async function getAll(): Promise<Evento[]> {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()); } catch { return []; }
}

async function saveAll(list: Evento[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  return supabaseWrite.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

export async function GET() {
  return NextResponse.json(await getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const list = await getAll();

  // Delete event
  if (body._delete) {
    const updated = list.filter(e => e.id !== body._delete);
    await saveAll(updated);
    return NextResponse.json({ ok: true });
  }

  // Finalize event — update student grades in database
  if (body._finalize) {
    const ev = list.find(e => e.id === body._finalize);
    if (!ev) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });

    // Apply grade changes to each participant
    const errors: string[] = [];
    for (const p of ev.participantes) {
      if (!p.nova_graduacao || p.nova_graduacao === p.graduacao_atual) continue;
      const { error } = await supabaseWrite
        .from('students')
        .update({
          graduacao: p.nova_graduacao,
          tipo_graduacao: p.tipo_graduacao || 'adulta',
        })
        .eq('id', p.student_id);
      if (error) errors.push(`${p.nome_completo}: ${error.message}`);
    }

    // Mark event as finalized
    const updated = list.map(e =>
      e.id === ev.id
        ? { ...e, finalizado: true, updated_at: new Date().toISOString() }
        : e
    );
    await saveAll(updated);

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors });
    }
    return NextResponse.json({ ok: true, applied: ev.participantes.length });
  }

  // Create or update event
  const now = new Date().toISOString();
  const existing = list.find(e => e.id === body.id);

  if (existing) {
    const updated = list.map(e =>
      e.id === body.id
        ? { ...e, ...body, updated_at: now }
        : e
    );
    await saveAll(updated);
    return NextResponse.json({ ok: true, id: body.id });
  }

  const novo: Evento = {
    id: `ev_${Date.now()}`,
    tipo: body.tipo || 'batizado',
    nome: body.nome || '',
    data: body.data || '',
    hora: body.hora || '',
    local: body.local || '',
    nucleo: body.nucleo || '',
    participantes: body.participantes || [],
    finalizado: false,
    created_at: now,
    updated_at: now,
  };

  await saveAll([...list, novo]);
  return NextResponse.json({ ok: true, id: novo.id });
}
