import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/organograma.json';

export interface MembroOrganograma {
  nome: string;
  foto_url?: string | null;
}

export interface Organograma {
  presidente: MembroOrganograma;
  vice_presidente: MembroOrganograma;
  secretario: MembroOrganograma;
  tesoureiro: MembroOrganograma;
  coordenador_tecnico_cultural: MembroOrganograma;
  conselho_fiscal: MembroOrganograma[];
  updated_at: string;
}

const DEFAULT: Organograma = {
  presidente: { nome: '', foto_url: null },
  vice_presidente: { nome: '', foto_url: null },
  secretario: { nome: '', foto_url: null },
  tesoureiro: { nome: '', foto_url: null },
  coordenador_tecnico_cultural: { nome: '', foto_url: null },
  conselho_fiscal: [],
  updated_at: '',
};

export async function GET() {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return NextResponse.json(DEFAULT);
  try { return NextResponse.json(JSON.parse(await data.text())); } catch { return NextResponse.json(DEFAULT); }
}

export async function POST(req: NextRequest) {
  const body: Organograma = await req.json();
  body.updated_at = new Date().toISOString();
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: body });
}
