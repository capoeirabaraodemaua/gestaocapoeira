import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = '3a3480c1-e937-4a46-8a27-d5358099e697';

// GET /api/admin/export-alunos?auth=geral
// Returns a CSV file with nome, telefone, data_nascimento, tenant_id for all students
export async function GET(req: NextRequest) {
  const auth = req.nextUrl.searchParams.get('auth') || '';
  if (!['geral', 'admin'].includes(auth.toLowerCase())) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
  }

  // Fetch all students — paginate to get all 120+
  const PAGE = 1000;
  let allStudents: { nome_completo: string; telefone: string | null; data_nascimento: string | null }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('nome_completo, telefone, data_nascimento')
      .order('nome_completo', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    allStudents = allStudents.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Build CSV
  const escape = (v: string | null | undefined): string => {
    const s = (v ?? '').toString().trim();
    // Wrap in quotes if contains comma, quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const formatDate = (d: string | null): string => {
    if (!d) return '';
    const day = d.split('T')[0];
    // Treat placeholder dates as empty
    if (day === '1900-01-01' || day === '0001-01-01') return '';
    return day;
  };

  // Clean name: remove leading asterisks or special chars used as markers
  const cleanName = (n: string | null): string => {
    return (n ?? '').replace(/^\*+/, '').trim();
  };

  const header = 'nome,telefone,data_nascimento,tenant_id';
  const rows = allStudents.map(s =>
    [
      escape(cleanName(s.nome_completo)),
      escape(s.telefone),
      escape(formatDate(s.data_nascimento)),
      TENANT_ID,
    ].join(',')
  );

  const csv = [header, ...rows].join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="alunos-ginga-gestao-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
