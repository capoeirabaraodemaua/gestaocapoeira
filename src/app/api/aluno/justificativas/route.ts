import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const KEY = 'config/justificativas.json';

export type Justificativa = {
  id: string;
  student_id: string;
  student_name: string;
  nucleo: string;
  data_falta: string; // YYYY-MM-DD
  motivo: string;
  status: 'pendente' | 'aprovado' | 'recusado';
  resposta_mestre?: string;
  created_at: string;
  updated_at: string;
};

async function loadJustificativas(): Promise<Justificativa[]> {
  try {
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!urlData?.signedUrl) return [];
    const res = await fetch(urlData.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function saveJustificativas(list: Justificativa[]): Promise<void> {
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

// GET: student gets only THEIR justificativas; admin gets all or filtered by nucleo
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('student_id');
  const nucleo = searchParams.get('nucleo');
  const admin = searchParams.get('admin') === 'true';

  const all = await loadJustificativas();

  if (admin) {
    // Admin can see all or filter by nucleo
    const filtered = nucleo ? all.filter(j => j.nucleo === nucleo) : all;
    return NextResponse.json(filtered);
  }

  if (!student_id) {
    return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
  }

  // Student can ONLY see their own justificativas
  return NextResponse.json(all.filter(j => j.student_id === student_id));
}

// POST: student submits a justificativa; admin approves/rejects
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  const all = await loadJustificativas();

  if (action === 'submit') {
    const { student_id, data_falta, motivo } = body;
    if (!student_id || !data_falta || !motivo) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
    }

    // Validate date — must be within last 30 days
    const faltaDate = new Date(data_falta + 'T12:00:00');
    const now = new Date();
    const diffDays = (now.getTime() - faltaDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0 || diffDays > 30) {
      return NextResponse.json({ error: 'A data deve estar nos últimos 30 dias.' }, { status: 400 });
    }

    // Get student info
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('nome_completo, nucleo')
      .eq('id', student_id)
      .maybeSingle();
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });

    // Check for duplicate (same student, same date)
    const existing = all.find(j => j.student_id === student_id && j.data_falta === data_falta);
    if (existing) {
      return NextResponse.json({ error: 'Já existe uma justificativa para esta data.' }, { status: 409 });
    }

    const now2 = new Date().toISOString();
    const justificativa: Justificativa = {
      id: `just_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      student_id,
      student_name: student.nome_completo,
      nucleo: student.nucleo,
      data_falta,
      motivo,
      status: 'pendente',
      created_at: now2,
      updated_at: now2,
    };

    all.push(justificativa);
    await saveJustificativas(all);
    return NextResponse.json({ success: true, justificativa });
  }

  if (action === 'review') {
    // Admin reviews (approve/reject)
    const { id, status, resposta_mestre } = body;
    if (!id || !['aprovado', 'recusado'].includes(status)) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    const idx = all.findIndex(j => j.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Justificativa não encontrada.' }, { status: 404 });

    all[idx] = {
      ...all[idx],
      status,
      resposta_mestre: resposta_mestre || '',
      updated_at: new Date().toISOString(),
    };
    await saveJustificativas(all);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
}
