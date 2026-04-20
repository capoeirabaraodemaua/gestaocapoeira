import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const idParam  = req.nextUrl.searchParams.get('id');
  const matParam = req.nextUrl.searchParams.get('mat');

  if (!idParam && !matParam) {
    return NextResponse.json({ error: 'id or mat required' }, { status: 400 });
  }

  let row: Record<string, any> | null = null;

  if (idParam) {
    // Primary lookup: by UUID — always works
    const { data, error } = await admin
      .from('students')
      .select('*')           // select('*') returns only existing columns — never fails on missing cols
      .eq('id', idParam)
      .single();
    if (!error && data) row = data as Record<string, any>;
  } else {
    // Lookup by matricula number: DEMO-000001 → extract digits
    const match = matParam!.match(/(\d+)$/);
    if (!match) return NextResponse.json({ error: 'invalid mat' }, { status: 400 });
    const num = parseInt(match[1], 10);

    // Try by ordem_inscricao (may not exist → falls back to empty)
    const { data } = await admin
      .from('students')
      .select('*')
      .eq('ordem_inscricao', num)
      .single();
    if (data) row = data as Record<string, any>;
  }

  if (!row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Normalize field aliases for CarteirinhaData / verificar page
  return NextResponse.json({
    ...row,
    // Ensure expected field names are present
    nome_completo:    row.nome_completo    ?? '',
    nucleo:           row.nucleo           ?? '',
    graduacao:        row.graduacao        ?? '',
    tipo_graduacao:   row.tipo_graduacao   ?? 'adulta',
    foto_url:         row.foto_url         ?? null,
    menor_de_idade:   row.menor_de_idade   ?? false,
    nome_pai:         row.nome_pai         ?? null,
    nome_mae:         row.nome_mae         ?? null,
    nome_responsavel: row.nome_responsavel ?? null,
    apelido:          row.apelido          ?? null,
    nome_social:      row.nome_social      ?? null,
    sexo:             row.sexo             ?? null,
    inscricao_numero: row.ordem_inscricao  ?? null,
    student_id:       row.id,
  });
}
