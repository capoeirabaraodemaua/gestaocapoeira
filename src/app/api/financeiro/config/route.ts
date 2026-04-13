import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'financeiro/config.json';

export interface FinanceiroConfig {
  mensalidade_valor: number;
  batizado_integral: number;
  /** @deprecated use batizado_integral / num_parcelas instead */
  batizado_parcela1?: number;
  /** @deprecated use batizado_integral / num_parcelas instead */
  batizado_parcela2?: number;
  /** @deprecated use batizado_integral / num_parcelas instead */
  batizado_parcela3?: number;
  batizado_max_parcelas: number; // 1–12
  contribuicao_mensal: number;
  updated_at: string;
}

const DEFAULT_CONFIG: FinanceiroConfig = {
  mensalidade_valor: 80,
  batizado_integral: 150,
  batizado_max_parcelas: 12,
  contribuicao_mensal: 30,
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
  const body: Partial<FinanceiroConfig> = await req.json();
  // Merge with existing config
  const { data: existing } = await supabase.storage.from(BUCKET).download(KEY);
  let current: FinanceiroConfig = DEFAULT_CONFIG;
  if (existing) {
    try { current = JSON.parse(await existing.text()); } catch {}
  }
  const updated: FinanceiroConfig = { ...current, ...body, updated_at: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: updated });
}
