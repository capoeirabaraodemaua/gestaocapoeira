import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0];

async function runSQL(sql: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// POST /api/admin/backfill-tenants
// 1. Creates tenant_id column if missing
// 2. Sets tenant_id = provided UUID for all students
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = req.headers.get('x-admin-auth') || body.admin_auth || '';
    if (!adminAuth || !['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    // tenant_id to apply — caller can override, defaults to the ACCBM canonical ID
    const tenantId: string = body.tenant_id || '3a3480c1-e937-4a46-8a46-d5358099e697';

    // Step 1: Add column (TEXT, nullable — no FK constraint so it never blocks inserts)
    const addCol = await runSQL(
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id TEXT;`
    );

    // Step 2: Fill all students that don't have tenant_id yet
    const { data: students, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, nucleo');

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const all = students || [];
    let updated = 0;
    let skipped = 0;

    // Batch update in chunks of 20
    const chunkSize = 20;
    for (let i = 0; i < all.length; i += chunkSize) {
      const chunk = all.slice(i, i + chunkSize);
      const ids = chunk.map((s: { id: string }) => s.id);
      const { error } = await supabaseAdmin
        .from('students')
        .update({ tenant_id: tenantId })
        .in('id', ids);
      if (!error) updated += ids.length;
      else skipped += ids.length;
    }

    return NextResponse.json({
      success: true,
      column_created: addCol.ok,
      total: all.length,
      updated,
      skipped,
      tenant_id_applied: tenantId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
