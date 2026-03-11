import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
const supabaseWrite = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'financeiro/materiais.json';

export interface MaterialCompra {
  id: string;
  descricao: string;
  categoria: string; // ex: instrumento, uniforme, material de escritório, outros
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  modalidade: 'avista' | 'parcelado';
  parcelas?: number;
  metodo_pagamento: string; // PIX, Cartão de Débito, Cartão de Crédito, Dinheiro
  fornecedor?: string;
  nucleo?: string; // para qual núcleo
  data_compra: string;
  notas?: string;
  created_at: string;
}

async function getAll(): Promise<MaterialCompra[]> {
  const { data, error } = await supabase.storage.from(BUCKET).download(KEY);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()); } catch { return []; }
}

async function saveAll(list: MaterialCompra[]) {
  const blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
  return supabaseWrite.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

export async function GET() {
  return NextResponse.json(await getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const list = await getAll();

  if (body._delete) {
    const updated = list.filter(m => m.id !== body._delete);
    await saveAll(updated);
    return NextResponse.json({ ok: true });
  }

  const item: MaterialCompra = {
    id: body.id || `mat_${Date.now()}`,
    descricao: body.descricao || '',
    categoria: body.categoria || 'outros',
    quantidade: Number(body.quantidade) || 1,
    valor_unitario: Number(body.valor_unitario) || 0,
    valor_total: Number(body.valor_total) || (Number(body.quantidade) || 1) * (Number(body.valor_unitario) || 0),
    modalidade: body.modalidade || 'avista',
    parcelas: body.parcelas ? Number(body.parcelas) : undefined,
    metodo_pagamento: body.metodo_pagamento || 'PIX',
    fornecedor: body.fornecedor || undefined,
    nucleo: body.nucleo || undefined,
    data_compra: body.data_compra || new Date().toISOString().slice(0, 10),
    notas: body.notas || undefined,
    created_at: body.created_at || new Date().toISOString(),
  };

  const idx = list.findIndex(m => m.id === item.id);
  if (idx >= 0) list[idx] = item; else list.unshift(item);
  const { error } = await saveAll(list);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: item });
}
