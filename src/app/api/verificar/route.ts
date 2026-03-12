import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const FIELDS = 'id,nome_completo,nucleo,graduacao,tipo_graduacao,foto_url,menor_de_idade,nome_pai,nome_mae,nome_responsavel,cpf_responsavel,ordem_inscricao,apelido,nome_social,sexo';

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id');
  const matParam = req.nextUrl.searchParams.get('mat');

  let query;

  if (idParam) {
    // Lookup by UUID — most reliable
    query = admin.from('students').select(FIELDS).eq('id', idParam).single();
  } else if (matParam) {
    // Lookup by matricula number: ACCBM-000001 → extract digits
    const match = matParam.match(/(\d+)$/);
    if (!match) return NextResponse.json({ error: 'invalid mat' }, { status: 400 });
    const num = parseInt(match[1], 10);
    query = admin.from('students').select(FIELDS).eq('ordem_inscricao', num).single();
  } else {
    return NextResponse.json({ error: 'id or mat required' }, { status: 400 });
  }

  const { data, error } = await query;

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Normalize field names for CarteirinhaData
  return NextResponse.json({
    ...data,
    inscricao_numero: (data as any).ordem_inscricao ?? null,
    student_id: (data as any).id,
  });
}
