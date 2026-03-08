import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Usa a API SQL do Supabase diretamente via HTTP (suporta DDL com service role)
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const statements = [
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE`,
    `CREATE SEQUENCE IF NOT EXISTS students_inscricao_seq START 1`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS ordem_inscricao INTEGER DEFAULT nextval('students_inscricao_seq')`,
  ];

  const results: { sql: string; ok: boolean; error?: string }[] = [];

  for (const sql of statements) {
    try {
      const res = await fetch(`${url}/rest/v1/rpc/exec_ddl`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      const body = await res.text();
      results.push({ sql, ok: res.ok, error: res.ok ? undefined : body });
    } catch (e) {
      results.push({ sql, ok: false, error: String(e) });
    }
  }

  // Fallback: tentar via Supabase Management API
  const allFailed = results.every(r => !r.ok);
  if (allFailed) {
    return NextResponse.json({
      message: 'Não foi possível executar automaticamente. Execute o SQL abaixo no Supabase Dashboard → SQL Editor:',
      sql: statements.join(';\n') + ';',
      results,
    }, { status: 400 });
  }

  return NextResponse.json({ success: true, results });
}
