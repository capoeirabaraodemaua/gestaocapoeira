import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const mat = req.nextUrl.searchParams.get('mat');
  if (!mat) return NextResponse.json({ error: 'mat required' }, { status: 400 });

  // mat format: ACCBM-000001 → extract number
  const match = mat.match(/(\d+)$/);
  if (!match) return NextResponse.json({ error: 'invalid mat' }, { status: 400 });
  const num = parseInt(match[1], 10);

  const { data, error } = await admin
    .from('students')
    .select('nome_completo,nucleo,graduacao,tipo_graduacao,foto_url,menor_de_idade,nome_pai,nome_mae,nome_responsavel,cpf_responsavel,ordem_inscricao,apelido,nome_social,sexo')
    .eq('ordem_inscricao', num)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Normalize field name for CarteirinhaData
  return NextResponse.json({ ...data, inscricao_numero: data.ordem_inscricao });
}
