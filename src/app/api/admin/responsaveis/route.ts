import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/responsaveis.json';

// CPF of the super-admin (always has full access regardless)
const SUPER_ADMIN_CPF = '09856925703';

export interface ResponsavelNucleo {
  nucleo_key: string; // 'edson-alves', 'ipiranga', etc.
  nucleo_label: string;
  nome: string;
  cpf: string; // digits only, stored normalized
}

export interface ResponsaveisConfig {
  responsaveis: ResponsavelNucleo[];
  updated_at: string;
}

const DEFAULT_CONFIG: ResponsaveisConfig = {
  responsaveis: [],
  updated_at: new Date().toISOString(),
};

export async function GET() {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return NextResponse.json(DEFAULT_CONFIG);
  try {
    return NextResponse.json(JSON.parse(await data.text()));
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function POST(req: NextRequest) {
  const body: Partial<ResponsaveisConfig> = await req.json();
  const now = new Date().toISOString();

  const { data: existing } = await supabase.storage.from(BUCKET).download(KEY);
  let current: ResponsaveisConfig = DEFAULT_CONFIG;
  if (existing) {
    try { current = JSON.parse(await existing.text()); } catch {}
  }

  const updated: ResponsaveisConfig = {
    responsaveis: body.responsaveis ?? current.responsaveis,
    updated_at: now,
  };

  const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: updated });
}
