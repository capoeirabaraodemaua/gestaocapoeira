import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const ID_MAP_KEY = 'config/aluno-id-map.json';

async function loadIdMap(): Promise<Record<string, string>> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ID_MAP_KEY, 30);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

// GET /api/carteirinha?cpf=XXX or ?id=UUID or ?identidade=XXX
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cpf = searchParams.get('cpf');
  const studentId = searchParams.get('id');
  const identidade = searchParams.get('identidade');

  let student: Record<string, unknown> | null = null;

  if (studentId) {
    const { data } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('id', studentId)
      .maybeSingle();
    student = data;
  } else if (cpf) {
    const cpfClean = cpf.replace(/\D/g, '');
    // Try formatted then raw digits
    const { data: byFormatted } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('cpf', cpf)
      .maybeSingle();
    if (byFormatted) {
      student = byFormatted;
    } else {
      const { data: byRaw } = await supabaseAdmin
        .from('students')
        .select('*')
        .eq('cpf', cpfClean)
        .maybeSingle();
      student = byRaw;
    }
  } else if (identidade) {
    const { data } = await supabaseAdmin
      .from('students')
      .select('*')
      .ilike('identidade', identidade)
      .maybeSingle();
    student = data;
  }

  if (!student) {
    return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  }

  // Resolve enrollment number: ordem_inscricao → gerar-id map
  let inscricao_numero: number | null = (student.ordem_inscricao as number) ?? null;
  if (!inscricao_numero && student.id) {
    const idMap = await loadIdMap();
    const displayId = idMap[student.id as string];
    if (displayId) {
      const match = displayId.match(/(\d+)$/);
      if (match) inscricao_numero = parseInt(match[1], 10);
    }
  }

  return NextResponse.json({ student, inscricao_numero });
}
