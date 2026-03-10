import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'photos';
const KEY = 'financeiro/editais.json';

export interface Edital {
  id: string;
  titulo: string;
  orgao: string; // órgão financiador
  numero: string; // número do edital
  data_submissao: string; // YYYY-MM-DD
  status: 'inscrito' | 'aprovado' | 'em_execucao' | 'concluido' | 'reprovado' | 'cancelado';
  valor_solicitado: number;
  valor_aprovado: number;
  data_inicio?: string;
  data_fim?: string;
  data_prestacao_contas?: string;
  prestacao_status?: 'pendente' | 'enviada' | 'aprovada' | 'reprovada';
  observacoes?: string;
  created_at: string;
}

async function loadEditais(): Promise<Edital[]> {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()); } catch { return []; }
}

async function saveEditais(list: Edital[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

export async function GET() {
  return NextResponse.json(await loadEditais());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const list = await loadEditais();

  if (body._delete) {
    await saveEditais(list.filter(e => e.id !== body._delete));
    return NextResponse.json({ ok: true });
  }

  const edital: Edital = {
    ...body,
    id: body.id || `edital_${Date.now()}`,
    created_at: body.created_at || new Date().toISOString(),
  };

  const idx = list.findIndex(e => e.id === edital.id);
  if (idx >= 0) list[idx] = edital;
  else list.unshift(edital);

  await saveEditais(list);
  return NextResponse.json({ ok: true, data: edital });
}
