import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'public' } }
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];

// Map nucleo → tenant_id
const NUCLEO_TO_TENANT: Record<string, string> = {
  'Poliesportivo Edson Alves': 'a1000001-0000-4000-8000-000000000001',
  'Poliesportivo do Ipiranga': 'a1000002-0000-4000-8000-000000000002',
  'Saracuruna': 'a1000003-0000-4000-8000-000000000003',
  'Vila Urussaí': 'a1000004-0000-4000-8000-000000000004',
  'Jayme Fichman': 'a1000005-0000-4000-8000-000000000005',
  'Academia Mais Saúde': 'a1000006-0000-4000-8000-000000000006',
  'Mauá': 'a1000001-0000-4000-8000-000000000001',
};

async function runSQL(sql: string): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  // Try Supabase Management API
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    if (res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: true, data };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, error: `Management API: ${res.status} ${text}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = (req.headers.get('x-admin-auth') || body.admin_auth || '').toLowerCase();
    if (!['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const defaultTenantId: string = body.tenant_id || '3a3480c1-e937-4a46-8a27-d5358099e697';
    const results: string[] = [];

    // Step 1: Add missing columns via Management API SQL
    const columnsToAdd = [
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT`,
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS apelido TEXT`,
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS nome_social TEXT`,
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS sexo TEXT`,
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE`,
    ];

    for (const sql of columnsToAdd) {
      const r = await runSQL(sql);
      const colName = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1] ?? '?';
      results.push(`Column ${colName}: ${r.ok ? 'OK' : 'FAIL - ' + r.error}`);
    }

    // Step 2: Reload schema cache by fetching students
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Step 3: Fetch all students
    const { data: students, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, nucleo');

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message, results }, { status: 500 });
    }

    const all = (students || []) as { id: string; nucleo: string }[];
    let updated = 0;
    let skipped = 0;

    // Step 4: Update each student with the correct tenant_id
    // Try bulk update first, fall back to per-record
    const chunkSize = 30;
    for (let i = 0; i < all.length; i += chunkSize) {
      const chunk = all.slice(i, i + chunkSize);
      const ids = chunk.map(s => s.id);
      // Use the per-nucleo tenant_id mapping, fall back to the default provided
      // Group by tenant to minimize requests
      const byTenant: Record<string, string[]> = {};
      for (const s of chunk) {
        const tid = NUCLEO_TO_TENANT[s.nucleo] ?? defaultTenantId;
        if (!byTenant[tid]) byTenant[tid] = [];
        byTenant[tid].push(s.id);
      }

      for (const [tid, tenantIds] of Object.entries(byTenant)) {
        const { error } = await supabaseAdmin
          .from('students')
          .update({ tenant_id: tid })
          .in('id', tenantIds);
        if (!error) updated += tenantIds.length;
        else {
          // Try individual updates as fallback
          for (const sid of tenantIds) {
            const { error: e2 } = await supabaseAdmin
              .from('students')
              .update({ tenant_id: tid })
              .eq('id', sid);
            if (!e2) updated++;
            else skipped++;
          }
        }
      }
      void ids;
    }

    results.push(`Updated ${updated}/${all.length} students with tenant_id`);
    if (skipped > 0) results.push(`Skipped: ${skipped}`);

    return NextResponse.json({
      success: true,
      total: all.length,
      updated,
      skipped,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
