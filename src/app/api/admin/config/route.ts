import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/admin_config.json';

const FALLBACK_CPF = '09856925703'; // CPF padrão caso não exista config

export interface AdminConfig {
  super_admin_cpf: string;
  updated_at: string;
}

const DEFAULT: AdminConfig = {
  super_admin_cpf: FALLBACK_CPF,
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
    return await res.json();
  } catch {
    return DEFAULT;
  }
}

export async function GET() {
  return NextResponse.json(await readConfig());
}

export async function POST(req: NextRequest) {
  const body: Partial<AdminConfig> = await req.json();

  if (!body.super_admin_cpf || body.super_admin_cpf.replace(/\D/g, '').length < 11) {
    return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });
  }

  const updated: AdminConfig = {
    super_admin_cpf: body.super_admin_cpf.replace(/\D/g, ''),
    updated_at: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(KEY, blob, { upsert: true, contentType: 'application/json' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: updated });
}
