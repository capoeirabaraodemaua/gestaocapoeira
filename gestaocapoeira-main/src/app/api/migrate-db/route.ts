import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL!
  .replace('https://', '').replace('.supabase.co', '');

const MIGRATION_SQLS = [
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS apelido TEXT`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS nome_social TEXT`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS sexo TEXT`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename='students_inscricao_seq')
    THEN CREATE SEQUENCE students_inscricao_seq START 1; END IF;
  END $$`,
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS ordem_inscricao INTEGER DEFAULT nextval('students_inscricao_seq')`,
  `UPDATE students SET ordem_inscricao = nextval('students_inscricao_seq') WHERE ordem_inscricao IS NULL`,
];

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({})) as { password?: string };
  if (!password) return NextResponse.json({ error: 'Senha necessária' }, { status: 400 });

  // Try all known pooler endpoints and ports
  const attempts = [
    `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${password}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  ];

  let lastError = '';
  for (const connStr of attempts) {
    const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
    try {
      const client = await pool.connect();
      const applied: string[] = [];
      for (const sql of MIGRATION_SQLS) {
        try { await client.query(sql); applied.push(sql.slice(0, 60).trim()); } catch {}
      }
      client.release();
      await pool.end();
      return NextResponse.json({ success: true, message: `✓ ${applied.length} instruções executadas com sucesso!` });
    } catch (err) {
      lastError = String(err);
      await pool.end().catch(() => {});
    }
  }

  return NextResponse.json({ error: `Não foi possível conectar: ${lastError.slice(0, 200)}` }, { status: 500 });
}
