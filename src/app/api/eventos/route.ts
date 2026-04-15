import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'photos';
const KEY = 'eventos/eventos.json';

const supabaseWrite = createClient(SUPABASE_URL, SERVICE_KEY);

export interface EventoParticipant {
  student_id: string;
  nome_completo: string;
  nucleo: string;
  graduacao_atual: string;
  nova_graduacao: string;
  tipo_graduacao: string;
  cpf?: string | null;
  inscricao_numero?: number | null;
  data_nascimento?: string | null;
}

export interface Evento {
  id: string;
  tipo: 'batizado' | 'troca';
  nome: string;
  data: string;
  hora: string;
  local: string;
  nucleo?: string;
  participantes: EventoParticipant[];
  finalizado: boolean;
  created_at: string;
  updated_at: string;
  imagem_url?: string | null;
  video_url?: string | null;
  descricao?: string | null;
}

// Read bypassing ALL caches — direct HTTP with no-store
async function getAll(): Promise<Evento[]> {
  try {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${KEY}?t=${Date.now()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      // @ts-ignore — Next.js extended fetch option
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    return JSON.parse(await res.text());
  } catch {
    return [];
  }
}

// Write using SDK update (atomic overwrite)
async function saveAll(list: Evento[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  const { error } = await supabaseWrite.storage
    .from(BUCKET)
    .update(KEY, blob, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  const list = await getAll();

  // If student_id is provided, filter events relevant to that student only
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('student_id');

  if (studentId) {
    // Fetch student's nucleo from DB
    let studentNucleo = '';
    try {
      const { data: st } = await supabaseWrite
        .from('students')
        .select('nucleo')
        .eq('id', studentId)
        .maybeSingle();
      studentNucleo = st?.nucleo || '';
    } catch { /* fallback to empty */ }

    // Brasília timezone for date comparison
    const nowBrasilia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr = nowBrasilia.toISOString().slice(0, 10); // YYYY-MM-DD

    const relevant = list.filter(ev => {
      // Eventos finalizados (já realizados) não aparecem mais na área do aluno
      if (ev.finalizado) return false;
      // Oculta eventos cuja data já passou
      if (ev.data && ev.data < todayStr) return false;
      // Se há participantes definidos, mostra só se o aluno estiver na lista
      if (ev.participantes && ev.participantes.length > 0) {
        return ev.participantes.some(p => String(p.student_id) === String(studentId));
      }
      // Sem participantes: mostra ao aluno do mesmo núcleo (ou evento sem núcleo)
      return !ev.nucleo || ev.nucleo === studentNucleo;
    });

    return NextResponse.json(relevant, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
    });
  }

  return NextResponse.json(list, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const list = await getAll();

  // ── Delete ──────────────────────────────────────────────────────────────────
  if (body._delete) {
    await saveAll(list.filter(e => e.id !== body._delete));
    return NextResponse.json({ ok: true });
  }

  // ── Finalize ─────────────────────────────────────────────────────────────────
  if (body._finalize) {
    const ev = list.find(e => e.id === body._finalize);
    if (!ev) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 });

    const errors: string[] = [];
    for (const p of ev.participantes) {
      if (!p.nova_graduacao || p.nova_graduacao === p.graduacao_atual) continue;

      // 1. Update DB graduation
      const { error } = await supabaseWrite
        .from('students')
        .update({ graduacao: p.nova_graduacao, tipo_graduacao: p.tipo_graduacao || 'adulta' })
        .eq('id', p.student_id);
      if (error) { errors.push(`${p.nome_completo}: ${error.message}`); continue; }

      // 2. Append to historico-graduacoes/{student_id}.json so student area reflects it
      try {
        const histKey = `historico-graduacoes/${p.student_id}.json`;
        let existing: unknown[] = [];
        try {
          const { data: dl } = await supabaseWrite.storage.from(BUCKET).download(histKey);
          if (dl) existing = JSON.parse(await dl.text());
        } catch { /* file may not exist yet */ }
        const novoReg = {
          id: `ev_${Date.now()}_${p.student_id}`,
          data_graduacao: ev.data || new Date().toISOString().split('T')[0],
          graduacao_recebida: p.nova_graduacao,
          evento: ev.nome || (ev.tipo === 'batizado' ? 'Batizado' : 'Troca de Graduação'),
          professor_responsavel: '',
          observacoes: `Evento: ${ev.nome}${ev.local ? ` — ${ev.local}` : ''}`,
          status: 'finalizado' as const,
          criado_em: new Date().toISOString(),
          finalizado_em: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify([...existing, novoReg])], { type: 'application/json' });
        await supabaseWrite.storage.from(BUCKET).upload(histKey, blob, { upsert: true, contentType: 'application/json' });
      } catch { /* non-blocking */ }
    }

    await saveAll(
      list.map(e => e.id === ev.id ? { ...e, finalizado: true, updated_at: new Date().toISOString() } : e)
    );

    if (errors.length > 0) return NextResponse.json({ ok: false, errors });
    return NextResponse.json({ ok: true, applied: ev.participantes.length });
  }

  // ── Create or update ─────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const existing = list.find(e => e.id === body.id);

  if (existing) {
    await saveAll(list.map(e => e.id === body.id ? { ...e, ...body, updated_at: now } : e));
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
    imagem_url: body.imagem_url || null,
    video_url: body.video_url || null,
    descricao: body.descricao || null,
  };

  await saveAll([...list, novo]);
  return NextResponse.json({ ok: true, id: novo.id });
}
