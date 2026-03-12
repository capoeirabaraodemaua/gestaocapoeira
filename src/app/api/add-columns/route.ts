import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Individual DDL statements to run one by one
const DDL_STATEMENTS = [
  { col: 'email',            sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT` },
  { col: 'assinatura_pai',   sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE` },
  { col: 'assinatura_mae',   sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE` },
  { col: 'seq',              sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename='students_inscricao_seq') THEN CREATE SEQUENCE students_inscricao_seq START 1; END IF; END $$` },
  { col: 'ordem_inscricao',  sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS ordem_inscricao INTEGER DEFAULT nextval('students_inscricao_seq')` },
  { col: 'apelido',          sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS apelido TEXT` },
  { col: 'nome_social',      sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS nome_social TEXT` },
  { col: 'sexo',             sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS sexo TEXT` },
  { col: 'ordem_fill',       sql: `UPDATE students SET ordem_inscricao = nextval('students_inscricao_seq') WHERE ordem_inscricao IS NULL` },
];

// Execute a single SQL statement via Supabase Management API
async function execSQL(sql: string): Promise<{ ok: boolean; error?: string }> {
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (res.ok) return { ok: true };

  // Fallback: try pg REST endpoint directly on the project
  const fallback = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (fallback.ok) return { ok: true };

  const errText = await res.text().catch(() => 'unknown error');
  return { ok: false, error: errText };
}

// Check if a column exists
async function columnExists(col: string): Promise<boolean> {
  if (col === 'seq' || col === 'ordem_fill') return true; // non-column steps always run
  const { error } = await supabaseAdmin.from('students').select(col).limit(1);
  if (!error) return true;
  return !(error.message.includes('column') || error.message.includes('does not exist'));
}

export async function GET() {
  const results: Array<{ col: string; status: 'ok' | 'already_exists' | 'error'; error?: string }> = [];
  let anyError = false;

  for (const { col, sql } of DDL_STATEMENTS) {
    // Skip if already exists (except sequence/update steps which always run safely)
    if (col !== 'seq' && col !== 'ordem_fill') {
      const exists = await columnExists(col);
      if (exists) {
        results.push({ col, status: 'already_exists' });
        continue;
      }
    }

    const { ok, error } = await execSQL(sql);
    if (ok) {
      results.push({ col, status: 'ok' });
    } else {
      results.push({ col, status: 'error', error });
      anyError = true;
    }
  }

  const created = results.filter(r => r.status === 'ok').map(r => r.col);
  const existed = results.filter(r => r.status === 'already_exists').map(r => r.col);
  const errors  = results.filter(r => r.status === 'error');

  if (errors.length > 0) {
    // Management API might not be available — return SQL for manual fallback
    const fallbackSQL = DDL_STATEMENTS
      .filter(s => !existed.includes(s.col))
      .map(s => s.sql + ';')
      .join('\n');

    return NextResponse.json({
      success: false,
      created,
      existed,
      errors,
      fallbackSQL,
      message: `Não foi possível criar automaticamente (${errors.length} erro(s)). Execute o SQL abaixo no Supabase Dashboard → SQL Editor.`,
    }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    created,
    existed,
    message: created.length > 0
      ? `✓ ${created.length} coluna(s) criada(s) com sucesso! ${existed.length} já existiam.`
      : '✓ Todas as colunas já estavam ativas no banco de dados!',
  });
}
