import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/whatsapp-fila.json';

export type EnvioStatus = 'pendente' | 'enviado' | 'erro' | 'cadastrado';

export interface EnvioHistoricoItem {
  data: string;
  status: EnvioStatus;
  msg?: string;
}

export interface EnvioRecord {
  id: string;
  student_id: string;
  student_name: string;
  telefone: string;
  nucleo: string;
  status: EnvioStatus;
  tentativas: number;
  data_primeiro_envio: string | null;
  data_ultimo_envio: string | null;
  data_proximo_envio: string | null;
  erro_msg: string | null;
  historico: EnvioHistoricoItem[];
}

export interface FilaData {
  envios: EnvioRecord[];
  ultima_atualizacao: string;
}

async function readFila(): Promise<FilaData> {
  try {
    const { data: urlData } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(KEY, 10);
    if (!urlData?.signedUrl) return { envios: [], ultima_atualizacao: new Date().toISOString() };
    const res = await fetch(urlData.signedUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    if (!res.ok) return { envios: [], ultima_atualizacao: new Date().toISOString() };
    return await res.json();
  } catch {
    return { envios: [], ultima_atualizacao: new Date().toISOString() };
  }
}

async function saveFila(data: FilaData): Promise<void> {
  data.ultima_atualizacao = new Date().toISOString();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  await supabaseAdmin.storage
    .from(BUCKET)
    .upload(KEY, blob, { upsert: true, contentType: 'application/json' });
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// GET — read full fila
export async function GET() {
  const data = await readFila();
  return NextResponse.json(data);
}

// POST — bulk actions
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  const data = await readFila();

  // ── sync: rebuild fila from students list ──────────────────────────────────
  if (action === 'sync') {
    // body.students: { id, nome_completo, telefone, nucleo }[]
    // body.registered_ids: string[] (student_ids that already have accounts)
    const incoming: { id: string; nome_completo: string; telefone: string; nucleo: string }[] =
      body.students || [];
    const registeredIds: Set<string> = new Set(body.registered_ids || []);

    // Mark already-registered as "cadastrado"
    for (const r of data.envios) {
      if (registeredIds.has(r.student_id) && r.status !== 'cadastrado') {
        r.status = 'cadastrado';
      }
    }

    // Add new records for students not yet in fila
    const existing = new Set(data.envios.map(e => e.student_id));
    for (const s of incoming) {
      if (!existing.has(s.id) && !registeredIds.has(s.id)) {
        data.envios.push({
          id: genId(),
          student_id: s.id,
          student_name: s.nome_completo,
          telefone: s.telefone || '',
          nucleo: s.nucleo || '',
          status: 'pendente',
          tentativas: 0,
          data_primeiro_envio: null,
          data_ultimo_envio: null,
          data_proximo_envio: null,
          erro_msg: null,
          historico: [],
        });
      }
    }

    await saveFila(data);
    return NextResponse.json({ ok: true, total: data.envios.length });
  }

  // ── mark_sent: record a successful send ────────────────────────────────────
  if (action === 'mark_sent') {
    const { student_id } = body;
    const now = new Date().toISOString();
    // Next follow-up in 24h
    const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const rec = data.envios.find(e => e.student_id === student_id);
    if (rec) {
      rec.status = 'enviado';
      rec.tentativas += 1;
      rec.data_ultimo_envio = now;
      rec.data_proximo_envio = next24h;
      if (!rec.data_primeiro_envio) rec.data_primeiro_envio = now;
      rec.erro_msg = null;
      rec.historico.push({ data: now, status: 'enviado' });
    }
    await saveFila(data);
    return NextResponse.json({ ok: true });
  }

  // ── mark_error: record a failed send ──────────────────────────────────────
  if (action === 'mark_error') {
    const { student_id, msg } = body;
    const now = new Date().toISOString();
    const rec = data.envios.find(e => e.student_id === student_id);
    if (rec) {
      rec.status = 'erro';
      rec.tentativas += 1;
      rec.data_ultimo_envio = now;
      rec.erro_msg = msg || 'Erro desconhecido';
      rec.historico.push({ data: now, status: 'erro', msg: msg || 'Erro desconhecido' });
    }
    await saveFila(data);
    return NextResponse.json({ ok: true });
  }

  // ── mark_cadastrado: student completed registration ────────────────────────
  if (action === 'mark_cadastrado') {
    const { student_id } = body;
    const now = new Date().toISOString();
    const rec = data.envios.find(e => e.student_id === student_id);
    if (rec) {
      rec.status = 'cadastrado';
      rec.historico.push({ data: now, status: 'cadastrado', msg: 'Cadastro concluído' });
    }
    await saveFila(data);
    return NextResponse.json({ ok: true });
  }

  // ── reset_errors: reset all erro to pendente ──────────────────────────────
  if (action === 'reset_errors') {
    for (const r of data.envios) {
      if (r.status === 'erro') {
        r.status = 'pendente';
        r.erro_msg = null;
      }
    }
    await saveFila(data);
    return NextResponse.json({ ok: true });
  }

  // ── reset_all: reset all to pendente (except cadastrado) ──────────────────
  if (action === 'reset_all') {
    for (const r of data.envios) {
      if (r.status !== 'cadastrado') {
        r.status = 'pendente';
        r.erro_msg = null;
      }
    }
    await saveFila(data);
    return NextResponse.json({ ok: true });
  }

  // ── check_followups: get records due for follow-up ────────────────────────
  if (action === 'check_followups') {
    const now = Date.now();
    const due = data.envios.filter(r => {
      if (r.status !== 'enviado') return false;
      if (!r.data_proximo_envio) return false;
      if (r.tentativas >= 3) return false; // max 3 attempts
      return new Date(r.data_proximo_envio).getTime() <= now;
    });
    // Set them back to pendente so they'll be queued again
    for (const r of due) {
      r.status = 'pendente';
    }
    await saveFila(data);
    return NextResponse.json({ due: due.length, records: due });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
