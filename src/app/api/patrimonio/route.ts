import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'photos';
const KEY = 'financeiro/patrimonio.json';

export interface ItemPatrimonio {
  id: string;
  nome: string;
  tipo: string; // instrumento, mobiliário, equipamento, uniforme, outros
  nucleo: string;
  quantidade: number;
  valor_estimado?: number;
  estado: 'otimo' | 'bom' | 'regular' | 'ruim' | 'descartado';
  numero_serie?: string;
  data_aquisicao?: string;
  notas?: string;
  created_at: string;
}

async function getAll(): Promise<ItemPatrimonio[]> {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()); } catch { return []; }
}

async function saveAll(list: ItemPatrimonio[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  return supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

export async function GET() {
  return NextResponse.json(await getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const list = await getAll();

  if (body._delete) {
    await saveAll(list.filter(p => p.id !== body._delete));
    return NextResponse.json({ ok: true });
  }

  const item: ItemPatrimonio = {
    id: body.id || `pat_${Date.now()}`,
    nome: body.nome || '',
    tipo: body.tipo || 'outros',
    nucleo: body.nucleo || '',
    quantidade: Number(body.quantidade) || 1,
    valor_estimado: body.valor_estimado ? Number(body.valor_estimado) : undefined,
    estado: body.estado || 'bom',
    numero_serie: body.numero_serie || undefined,
    data_aquisicao: body.data_aquisicao || undefined,
    notas: body.notas || undefined,
    created_at: body.created_at || new Date().toISOString(),
  };

  const idx = list.findIndex(p => p.id === item.id);
  if (idx >= 0) list[idx] = item; else list.unshift(item);
  const { error } = await saveAll(list);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: item });
}
