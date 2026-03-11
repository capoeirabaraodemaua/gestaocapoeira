import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseRead = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
const supabaseWrite = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/hierarquia.json';

export interface MembroHierarquia {
  id: string;
  nome: string;
  nucleo?: string;
  foto_url?: string | null;
}

export interface Hierarquia {
  mestres: MembroHierarquia[];
  mestrandos: MembroHierarquia[];
  professores: MembroHierarquia[];
  instrutores: MembroHierarquia[];
  monitores: MembroHierarquia[];
  alunos_graduados: MembroHierarquia[];
  updated_at: string;
}

const DEFAULT: Hierarquia = {
  mestres: [],
  mestrandos: [],
  professores: [],
  instrutores: [],
  monitores: [],
  alunos_graduados: [],
  updated_at: '',
};

export async function GET() {
  const { data, error } = await supabaseRead.storage.from(BUCKET).download(KEY);
  if (error || !data) return NextResponse.json(DEFAULT);
  try { return NextResponse.json(JSON.parse(await data.text())); } catch { return NextResponse.json(DEFAULT); }
}

export async function POST(req: NextRequest) {
  const body: Hierarquia = await req.json();
  body.updated_at = new Date().toISOString();
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabaseWrite.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: body });
}
