import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// SQL statements to activate all new columns
export const MIGRATION_SQL = `-- Execute no Supabase Dashboard → SQL Editor
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE;
CREATE SEQUENCE IF NOT EXISTS students_inscricao_seq START 1;
ALTER TABLE students ADD COLUMN IF NOT EXISTS ordem_inscricao INTEGER DEFAULT nextval('students_inscricao_seq');
ALTER TABLE students ADD COLUMN IF NOT EXISTS apelido TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS nome_social TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS sexo TEXT;
UPDATE students SET ordem_inscricao = nextval('students_inscricao_seq') WHERE ordem_inscricao IS NULL;`;

// Check which columns exist by attempting a select with those fields
async function checkColumns() {
  const cols = ['email', 'assinatura_pai', 'assinatura_mae', 'ordem_inscricao', 'apelido', 'nome_social', 'sexo'];
  const missing: string[] = [];

  for (const col of cols) {
    const { error } = await supabaseAdmin
      .from('students')
      .select(col)
      .limit(1);
    if (error && (error.message.includes('column') || error.message.includes('does not exist'))) {
      missing.push(col);
    }
  }
  return missing;
}

export async function GET() {
  try {
    const missing = await checkColumns();

    if (missing.length === 0) {
      return NextResponse.json({
        success: true,
        message: '✓ Todas as colunas já estão ativas no banco de dados!',
        missing: [],
      });
    }

    // Columns are missing — return SQL for manual execution
    return NextResponse.json({
      success: false,
      missing,
      sql: MIGRATION_SQL,
      message: `${missing.length} coluna(s) ainda não existem: ${missing.join(', ')}. Execute o SQL abaixo no Supabase Dashboard.`,
    }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json({
      success: false,
      missing: [],
      sql: MIGRATION_SQL,
      message: 'Não foi possível verificar. Execute o SQL manualmente.',
      error: e.message,
    }, { status: 500 });
  }
}
