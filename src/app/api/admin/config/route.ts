import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/admin_config.json';

const FALLBACK_CPF = '09856925703';

export interface AdminConfig {
  super_admin_cpf: string;         // primary (backward compat)
  super_admin_cpfs: string[];      // up to 3 admins gerais
  updated_at: string;
}

const DEFAULT: AdminConfig = {
  super_admin_cpf: FALLBACK_CPF,
  super_admin_cpfs: [FALLBACK_CPF],
  updated_at: '',
};

async function readConfig(): Promise<AdminConfig> {
  try {
    const { data: urlData } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(KEY, 10);
    if (!urlData?.signedUrl) return DEFAULT;
    const res = await fetch(urlData.signedUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    if (!res.ok) return DEFAULT;
    const data = await res.json();
    // Migrate old format: if only super_admin_cpf exists, build array
    if (!data.super_admin_cpfs || !Array.isArray(data.super_admin_cpfs)) {
      data.super_admin_cpfs = data.super_admin_cpf ? [data.super_admin_cpf] : [FALLBACK_CPF];
    }
    if (!data.super_admin_cpf) data.super_admin_cpf = data.super_admin_cpfs[0];
    return data;
  } catch {
    return DEFAULT;
  }
}

export async function GET() {
  return NextResponse.json(await readConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const current = await readConfig();

  // Handle array update: { super_admin_cpfs: ['111','222','333'] }
  if (body.super_admin_cpfs !== undefined) {
    const list: string[] = (body.super_admin_cpfs as string[])
      .map((c: string) => c.replace(/\D/g, ''))
      .filter((c: string) => c.length >= 11)
      .slice(0, 3);
    if (list.length === 0) return NextResponse.json({ error: 'Nenhum CPF válido' }, { status: 400 });
    const updated: AdminConfig = {
      super_admin_cpf: list[0],
      super_admin_cpfs: list,
      updated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(KEY, blob, { upsert: true, contentType: 'application/json' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: updated });
  }

  // Legacy single CPF update
  if (!body.super_admin_cpf || body.super_admin_cpf.replace(/\D/g, '').length < 11) {
    return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });
  }
  const cpf = body.super_admin_cpf.replace(/\D/g, '');
  const updated: AdminConfig = {
    super_admin_cpf: cpf,
    super_admin_cpfs: [cpf],
    updated_at: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(KEY, blob, { upsert: true, contentType: 'application/json' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: updated });
}
