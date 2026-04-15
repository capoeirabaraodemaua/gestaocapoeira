import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/export-alunos?auth=geral&nucleo=saracuruna
// Returns a CSV file with ALL columns from the students table
export async function GET(req: NextRequest) {
  const auth = req.nextUrl.searchParams.get('auth') || '';
  const nucleoFilter = req.nextUrl.searchParams.get('nucleo') || '';

  if (!['geral', 'admin'].includes(auth.toLowerCase())) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
  }

  const PAGE = 1000;
  let allStudents: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin
      .from('students')
      .select('*')
      .order('ordem_inscricao', { ascending: true })
      .range(from, from + PAGE - 1);

    if (nucleoFilter) {
      query = query.eq('nucleo', nucleoFilter);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    allStudents = allStudents.concat(data as Record<string, unknown>[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const escape = (v: unknown): string => {
    const s = (v ?? '').toString().trim();
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const formatDate = (d: unknown): string => {
    if (!d) return '';
    const day = String(d).split('T')[0];
    if (day === '1900-01-01' || day === '0001-01-01') return '';
    const year = parseInt(day.slice(0, 4), 10);
    if (isNaN(year) || year < 2000) return '';
    return day;
  };

  const formatBool = (v: unknown): string => {
    if (v === true || v === 'true') return 'Sim';
    if (v === false || v === 'false') return 'Não';
    return '';
  };

  const cleanName = (n: unknown): string => {
    return String(n ?? '').replace(/^\*+/, '').trim();
  };

  // Canonical column order — all fields
  const COLUMNS = [
    'id', 'ordem_inscricao', 'created_at',
    'nome_completo', 'apelido', 'nome_social', 'sexo',
    'cpf', 'identidade', 'data_nascimento', 'telefone', 'email',
    'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
    'graduacao', 'tipo_graduacao', 'nucleo', 'tenant_id', 'foto_url',
    'nome_pai', 'nome_mae',
    'autoriza_imagem', 'menor_de_idade',
    'nome_responsavel', 'cpf_responsavel', 'assinatura_responsavel',
    'assinatura_pai', 'assinatura_mae',
    'password',
  ];

  const DATE_COLS = new Set(['data_nascimento', 'created_at']);
  const BOOL_COLS = new Set(['autoriza_imagem', 'menor_de_idade', 'assinatura_responsavel', 'assinatura_pai', 'assinatura_mae']);
  const NAME_COLS = new Set(['nome_completo']);

  const header = COLUMNS.join(',');
  const rows = allStudents.map(s =>
    COLUMNS.map(col => {
      const v = s[col];
      if (NAME_COLS.has(col)) return escape(cleanName(v));
      if (DATE_COLS.has(col)) return escape(formatDate(v));
      if (BOOL_COLS.has(col)) return escape(formatBool(v));
      return escape(v);
    }).join(',')
  );

  const csv = [header, ...rows].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  const suffix = nucleoFilter ? `-${nucleoFilter}` : '';

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="alunos-accbm${suffix}-${dateStr}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
