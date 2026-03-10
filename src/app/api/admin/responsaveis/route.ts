import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Write (service_role bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/responsaveis.json';

export interface ResponsavelNucleo {
  nucleo_key: string;
  nucleo_label: string;
  nome: string;
  cpf: string; // digits only
  nome2?: string;
  cpf2?: string; // digits only
}

export interface ResponsaveisConfig {
  responsaveis: ResponsavelNucleo[];
  updated_at: string;
}

const DEFAULT_CONFIG: ResponsaveisConfig = {
  responsaveis: [],
  updated_at: new Date().toISOString(),
};

/** Lê o arquivo sempre fresco, sem cache, usando service_role */
async function readConfig(): Promise<ResponsaveisConfig> {
  try {
    // Gera URL pública via service_role para evitar cache do SDK
    const { data: urlData } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(KEY, 10);
    if (!urlData?.signedUrl) return DEFAULT_CONFIG;

    const res = await fetch(urlData.signedUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    if (!res.ok) return DEFAULT_CONFIG;
    return await res.json();
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function GET() {
  return NextResponse.json(await readConfig());
}

export async function POST(req: NextRequest) {
  const body: Partial<ResponsaveisConfig> = await req.json();
  const now = new Date().toISOString();

  const current = await readConfig();

  const updated: ResponsaveisConfig = {
    responsaveis: body.responsaveis ?? current.responsaveis,
    updated_at: now,
  };

  const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(KEY, blob, { upsert: true, contentType: 'application/json' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Retorna o dado que acabou de ser salvo (sem releitura para evitar cache)
  return NextResponse.json({ ok: true, data: updated });
}
