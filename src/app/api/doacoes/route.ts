import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'photos';
const KEY = 'financeiro/doacoes.json';

export interface Doacao {
  id: string;
  tipo: 'pj' | 'pf'; // pessoa jurídica ou física
  nome: string;
  documento: string; // CNPJ ou CPF
  valor: number;
  domicilio: string;
  modalidade: 'unica' | 'mensal';
  data: string; // YYYY-MM-DD
  observacoes?: string;
  comprovante_url?: string;
  created_at: string;
}

async function loadDoacoes(): Promise<Doacao[]> {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()); } catch { return []; }
}

async function saveDoacoes(list: Doacao[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

export async function GET() {
  return NextResponse.json(await loadDoacoes());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const list = await loadDoacoes();

  if (body._delete) {
    const updated = list.filter(d => d.id !== body._delete);
    await saveDoacoes(updated);
    return NextResponse.json({ ok: true });
  }

  const doacao: Doacao = {
    ...body,
    id: body.id || `doacao_${Date.now()}`,
    created_at: body.created_at || new Date().toISOString(),
  };

  const idx = list.findIndex(d => d.id === doacao.id);
  if (idx >= 0) list[idx] = doacao;
  else list.unshift(doacao);

  await saveDoacoes(list);
  return NextResponse.json({ ok: true, data: doacao });
}
