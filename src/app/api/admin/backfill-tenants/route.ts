import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NUCLEO_TO_TENANT_ID, DEFAULT_TENANT_ID } from '@/lib/tenants';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/admin/backfill-tenants
// Adds tenant_id column (if missing) and fills it for all existing students based on nucleo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Require admin session cookie or geral panel auth header
    const adminAuth = req.headers.get('x-admin-auth') || body.admin_auth || '';
    if (!adminAuth || !['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    // Step 1: Ensure the column exists
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0];
    const addColRes = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          query: `ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id TEXT;`,
        }),
      }
    );
    const colOk = addColRes.ok;

    // Step 2: Fetch all students without tenant_id
    const { data: students, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, nucleo, tenant_id');

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const toUpdate = (students || []).filter(
      s => !s.tenant_id
    );

    let updated = 0;
    let skipped = 0;

    for (const student of toUpdate) {
      const tenantId = NUCLEO_TO_TENANT_ID[student.nucleo || ''] ?? DEFAULT_TENANT_ID;
      const { error } = await supabaseAdmin
        .from('students')
        .update({ tenant_id: tenantId })
        .eq('id', student.id);
      if (!error) updated++;
      else skipped++;
    }

    const alreadyHad = (students || []).length - toUpdate.length;

    return NextResponse.json({
      success: true,
      column_added: colOk,
      total: (students || []).length,
      updated,
      skipped,
      already_had_tenant_id: alreadyHad,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
