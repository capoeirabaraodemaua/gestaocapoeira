import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

export interface RegistroGraduacao {
  id: string;           // uuid gerado no insert
  data_graduacao: string;        // YYYY-MM-DD
  graduacao_recebida: string;    // ex: "Cru", "Amarela", "Azul"
  evento: string;                // ex: "Batizado 2024"
  professor_responsavel: string;
  observacoes?: string;
  criado_em: string;             // ISO timestamp
}

function storageKey(studentId: string) {
  return `historico-graduacoes/${studentId}.json`;
}

async function readHistorico(studentId: string): Promise<RegistroGraduacao[]> {
  try {
    const { data } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storageKey(studentId), 15);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function writeHistorico(studentId: string, records: RegistroGraduacao[]) {
  const blob = new Blob([JSON.stringify(records)], { type: 'application/json' });
  await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storageKey(studentId), blob, { upsert: true, contentType: 'application/json' });
}

// GET /api/historico-graduacoes?student_id=xxx
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id');
  if (!studentId) return NextResponse.json({ error: 'student_id obrigatório' }, { status: 400 });
  const records = await readHistorico(studentId);
  return NextResponse.json({ records });
}

// POST /api/historico-graduacoes — adiciona ou atualiza um registro
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { student_id, registro } = body as { student_id: string; registro: Omit<RegistroGraduacao, 'id' | 'criado_em'> & { id?: string } };
    if (!student_id || !registro) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });

    const records = await readHistorico(student_id);
    const now = new Date().toISOString();

    if (registro.id) {
      // Atualiza existente
      const idx = records.findIndex(r => r.id === registro.id);
      if (idx >= 0) {
        records[idx] = { ...records[idx], ...registro, criado_em: records[idx].criado_em };
      }
    } else {
      // Novo registro
      const novo: RegistroGraduacao = {
        ...registro,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        criado_em: now,
      };
      records.push(novo);
    }

    // Ordena por data decrescente
    records.sort((a, b) => b.data_graduacao.localeCompare(a.data_graduacao));
    await writeHistorico(student_id, records);
    return NextResponse.json({ ok: true, records });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/historico-graduacoes?student_id=xxx&registro_id=yyy
export async function DELETE(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id');
  const registroId = req.nextUrl.searchParams.get('registro_id');
  if (!studentId || !registroId) return NextResponse.json({ error: 'Parâmetros faltando' }, { status: 400 });

  const records = await readHistorico(studentId);
  const updated = records.filter(r => r.id !== registroId);
  await writeHistorico(studentId, updated);
  return NextResponse.json({ ok: true, records: updated });
}
