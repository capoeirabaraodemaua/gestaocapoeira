/**
 * POST /api/admin/setup-db
 *
 * Resolves the multi-tenant database setup:
 * 1. Checks which tables exist (students, alunos, tenants, inquilinos)
 * 2. Adds tenant_id column to students if missing
 * 3. Fills tenant_id for all 120 students based on nucleo
 * 4. Returns full status + the SQL to run manually if DDL fails
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NUCLEO_TO_TENANT: Record<string, string> = {
  'Poliesportivo Edson Alves': 'a1000001-0000-4000-8000-000000000001',
  'Poliesportivo do Ipiranga': 'a1000002-0000-4000-8000-000000000002',
  'Saracuruna':                'a1000003-0000-4000-8000-000000000003',
  'Vila Urussaí':              'a1000004-0000-4000-8000-000000000004',
  'Jayme Fichman':             'a1000005-0000-4000-8000-000000000005',
  'Academia Mais Saúde':       'a1000006-0000-4000-8000-000000000006',
  'Mauá':                      'a1000001-0000-4000-8000-000000000001',
};
const DEFAULT_TENANT = '3a3480c1-e937-4a46-8a27-d5358099e697';

// Check if a table exists and is accessible
async function tableExists(name: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from(name).select('id').limit(1);
  return !error || !error.message.includes('not exist') && !error.message.includes('schema cache');
}

// Check if a column exists on students
async function columnExists(col: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('students').select(col).limit(1);
  return !error;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = (req.headers.get('x-admin-auth') || body.admin_auth || '').toLowerCase();
    if (!['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const defaultTenantId = body.tenant_id || DEFAULT_TENANT;
    const status: Record<string, unknown> = {};

    // 1. Check which tables exist
    const tables = ['students', 'alunos', 'tenants', 'inquilinos'];
    const tableStatus: Record<string, boolean> = {};
    for (const t of tables) {
      tableStatus[t] = await tableExists(t);
    }
    status.tables = tableStatus;

    // 2. Check columns on students
    const colsToCheck = ['tenant_id', 'email', 'apelido', 'nome_social', 'sexo', 'assinatura_pai', 'assinatura_mae'];
    const colStatus: Record<string, boolean> = {};
    for (const c of colsToCheck) {
      colStatus[c] = await columnExists(c);
    }
    status.columns = colStatus;

    // Check and backfill null created_at values automatically
    try {
      // Set DEFAULT now() so future inserts always get a timestamp
      await supabaseAdmin.rpc('exec_sql', {
        sql: "ALTER TABLE students ALTER COLUMN created_at SET DEFAULT now(); UPDATE students SET created_at = now() WHERE created_at IS NULL;"
      }).catch(() => {/* may not have exec_sql RPC */});

      // Count how many still have null created_at
      const { count: nullCount } = await supabaseAdmin
        .from('students')
        .select('*', { count: 'exact', head: true })
        .is('created_at', null);
      status.null_created_at_count = nullCount ?? 0;
    } catch { status.null_created_at_count = 'unknown'; }

    // 3. Count students
    const { count } = await supabaseAdmin
      .from('students')
      .select('*', { count: 'exact', head: true });
    status.student_count = count;

    // 4. If tenant_id column exists, do the fill
    let updated = 0;
    let already_set = 0;
    let update_errors = 0;

    if (colStatus['tenant_id']) {
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id, nucleo, tenant_id');

      const all = (students || []) as { id: string; nucleo: string; tenant_id?: string }[];

      // Group by target tenant_id
      const byTenant: Record<string, string[]> = {};
      for (const s of all) {
        if (s.tenant_id) { already_set++; continue; }
        const tid = NUCLEO_TO_TENANT[s.nucleo] ?? defaultTenantId;
        if (!byTenant[tid]) byTenant[tid] = [];
        byTenant[tid].push(s.id);
      }

      for (const [tid, ids] of Object.entries(byTenant)) {
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const { error } = await supabaseAdmin
            .from('students')
            .update({ tenant_id: tid })
            .in('id', chunk);
          if (!error) updated += chunk.length;
          else update_errors += chunk.length;
        }
      }

      status.fill_result = { updated, already_set, update_errors };
    } else {
      status.fill_result = 'skipped — tenant_id column does not exist yet';
    }

    // 5. Generate SQL to run in Supabase Dashboard
    const missingCols = colsToCheck.filter(c => !colStatus[c]);
    const sqlScript = missingCols.length > 0 ? `-- Run this in Supabase Dashboard > SQL Editor
-- Step 1: Add missing columns
${!colStatus['tenant_id'] ? "ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id TEXT;" : "-- tenant_id already exists ✓"}
${!colStatus['email'] ? "ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;" : ""}
${!colStatus['apelido'] ? "ALTER TABLE students ADD COLUMN IF NOT EXISTS apelido TEXT;" : ""}
${!colStatus['nome_social'] ? "ALTER TABLE students ADD COLUMN IF NOT EXISTS nome_social TEXT;" : ""}
${!colStatus['sexo'] ? "ALTER TABLE students ADD COLUMN IF NOT EXISTS sexo TEXT;" : ""}
${!colStatus['assinatura_pai'] ? "ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE;" : ""}
${!colStatus['assinatura_mae'] ? "ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE;" : ""}

-- Step 2: Fill tenant_id by nucleo
UPDATE students SET tenant_id = 'a1000001-0000-4000-8000-000000000001' WHERE nucleo = 'Poliesportivo Edson Alves' AND (tenant_id IS NULL OR tenant_id = '');
UPDATE students SET tenant_id = 'a1000002-0000-4000-8000-000000000002' WHERE nucleo = 'Poliesportivo do Ipiranga' AND (tenant_id IS NULL OR tenant_id = '');
UPDATE students SET tenant_id = 'a1000003-0000-4000-8000-000000000003' WHERE nucleo = 'Saracuruna' AND (tenant_id IS NULL OR tenant_id = '');
UPDATE students SET tenant_id = 'a1000004-0000-4000-8000-000000000004' WHERE nucleo = 'Vila Urussaí' AND (tenant_id IS NULL OR tenant_id = '');
UPDATE students SET tenant_id = 'a1000005-0000-4000-8000-000000000005' WHERE nucleo = 'Jayme Fichman' AND (tenant_id IS NULL OR tenant_id = '');
UPDATE students SET tenant_id = 'a1000006-0000-4000-8000-000000000006' WHERE nucleo = 'Academia Mais Saúde' AND (tenant_id IS NULL OR tenant_id = '');
UPDATE students SET tenant_id = '${defaultTenantId}' WHERE tenant_id IS NULL;

-- Step 3: Fix created_at — garante DEFAULT e preenche registros sem data
ALTER TABLE students ALTER COLUMN created_at SET DEFAULT now();
UPDATE students SET created_at = now() WHERE created_at IS NULL;

-- Step 4: Grant permissions so PostgREST can access the table
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE students TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;` : `-- All named columns exist.
-- Fix created_at — garante DEFAULT e preenche registros sem data de cadastro:
ALTER TABLE students ALTER COLUMN created_at SET DEFAULT now();
UPDATE students SET created_at = now() WHERE created_at IS NULL;`;

    status.sql_to_run = sqlScript;
    // Always show SQL panel — at minimum it includes the created_at fix
    status.needs_manual_sql = true;
    status.missing_columns = missingCols;

    return NextResponse.json({ success: true, ...status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
