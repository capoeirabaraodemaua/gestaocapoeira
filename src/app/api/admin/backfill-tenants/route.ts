import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NUCLEO_TO_TENANT_ID, DEFAULT_TENANT_ID } from '@/lib/tenants';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function tryExecSQL(sql: string): Promise<boolean> {
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0];
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ query: sql }),
    });
    return res.ok;
  } catch { return false; }
}

// POST /api/admin/backfill-tenants
// Creates tenant_id column if missing and fills it for all students based on nucleo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = req.headers.get('x-admin-auth') || body.admin_auth || '';
    if (!adminAuth || !['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    // Step 1: Create column if it doesn't exist
    const colOk = await tryExecSQL(
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id TEXT;`
    );

    // Step 2: Fetch all students (only id + nucleo — no tenant_id to avoid error if column just created)
    const { data: students, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, nucleo');

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    // Step 3: Update all students with tenant_id derived from nucleo
    let updated = 0;
    let skipped = 0;

    for (const student of students || []) {
      const tenantId = NUCLEO_TO_TENANT_ID[(student as { nucleo?: string }).nucleo || ''] ?? DEFAULT_TENANT_ID;
      const { error } = await supabaseAdmin
        .from('students')
        .update({ tenant_id: tenantId })
        .eq('id', (student as { id: string }).id);
      if (!error) updated++;
      else skipped++;
    }

    return NextResponse.json({
      success: true,
      column_created: colOk,
      total: (students || []).length,
      updated,
      skipped,
      already_had_tenant_id: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
