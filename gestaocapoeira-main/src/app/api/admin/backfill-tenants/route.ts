import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Map nucleo display name → tenant UUID (stable, deterministic)
const NUCLEO_TO_TENANT: Record<string, string> = {
  'Poliesportivo Edson Alves': 'a1000001-0000-4000-8000-000000000001',
  'Poliesportivo do Ipiranga': 'a1000002-0000-4000-8000-000000000002',
  'Saracuruna':                'a1000003-0000-4000-8000-000000000003',
  'Vila Urussaí':              'a1000004-0000-4000-8000-000000000004',
  'Jayme Fichman':             'a1000005-0000-4000-8000-000000000005',
  'Academia Mais Saúde':       'a1000006-0000-4000-8000-000000000006',
  'Mauá':                      'a1000001-0000-4000-8000-000000000001',
};

// Try to add a column by attempting an UPDATE that references it.
// If it fails with "column does not exist", we create it via a workaround.
async function ensureColumn(column: string, definition: string): Promise<{ created: boolean; error?: string }> {
  // Check if column exists by selecting it
  const { error: checkErr } = await supabaseAdmin
    .from('students')
    .select(column)
    .limit(1);

  if (!checkErr) return { created: false }; // already exists

  const errMsg = checkErr.message || '';
  if (!errMsg.includes(column) && !errMsg.toLowerCase().includes('column')) {
    return { created: false, error: errMsg };
  }

  // Column doesn't exist — try to create via the Supabase DB REST endpoint
  // This uses the /rest/v1/ schema introspection trick: POST to a non-existent RPC
  // to force a schema reload is not reliable; instead we use a special pg function
  // that Supabase exposes: pg_catalog functions via rpc

  // Attempt via rpc('query') if available (self-hosted) or via HTTP header trick
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Try the Supabase DB API endpoint (available on all plans)
  const projectRef = url.replace('https://', '').split('.')[0];

  const endpoints = [
    // Supabase Management API v1
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    // Direct DB REST (some plans)
    `${url}/rest/v1/rpc/run_sql`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'apikey': key,
        },
        body: JSON.stringify({ query: `ALTER TABLE students ADD COLUMN IF NOT EXISTS ${column} ${definition};` }),
      });
      if (res.ok) return { created: true };
    } catch { /* try next */ }
  }

  return { created: false, error: 'Could not add column via any available endpoint' };
}

// POST /api/admin/backfill-tenants
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = (req.headers.get('x-admin-auth') || body.admin_auth || '').toLowerCase();
    if (!['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const defaultTenantId: string = body.tenant_id || '3a3480c1-e937-4a46-8a27-d5358099e697';
    const results: Record<string, unknown> = {};

    // Step 1: Check/create tenant_id column
    const tenantColResult = await ensureColumn('tenant_id', 'TEXT');
    results.tenant_id_column = tenantColResult;

    // Also ensure other missing columns
    const extraCols: Array<[string, string]> = [
      ['email', 'TEXT'],
      ['apelido', 'TEXT'],
      ['nome_social', 'TEXT'],
      ['sexo', 'TEXT'],
      ['assinatura_pai', 'BOOLEAN NOT NULL DEFAULT FALSE'],
      ['assinatura_mae', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ];
    for (const [col, def] of extraCols) {
      const r = await ensureColumn(col, def);
      if (r.created || r.error) results[`col_${col}`] = r;
    }

    // Wait for schema cache to refresh
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Fetch all students
    const { data: students, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, nucleo, tenant_id');

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message, results }, { status: 500 });
    }

    const all = (students || []) as { id: string; nucleo: string; tenant_id?: string }[];
    let updated = 0;
    let already_had_tenant_id = 0;
    let skipped = 0;

    // Step 3: Update each student's tenant_id
    // Group by tenant_id to do bulk updates
    const byTenant: Record<string, string[]> = {};
    for (const s of all) {
      if (s.tenant_id) { already_had_tenant_id++; continue; }
      const tid = NUCLEO_TO_TENANT[s.nucleo] ?? defaultTenantId;
      if (!byTenant[tid]) byTenant[tid] = [];
      byTenant[tid].push(s.id);
    }

    for (const [tid, ids] of Object.entries(byTenant)) {
      // Update in chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { error } = await supabaseAdmin
          .from('students')
          .update({ tenant_id: tid })
          .in('id', chunk);
        if (!error) updated += chunk.length;
        else skipped += chunk.length;
      }
    }

    return NextResponse.json({
      success: true,
      total: all.length,
      updated,
      already_had_tenant_id,
      skipped,
      tenant_id_applied: defaultTenantId,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
