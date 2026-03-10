import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'photos';

export interface Parcela {
  numero: number;
  valor: number;
  vencimento: string;
  status: 'pago' | 'pendente' | 'atrasado';
  data_pagamento?: string;
  metodo?: string;
  comprovante_url?: string;
}

export interface Mensalidade {
  mes: string; // YYYY-MM
  valor: number;
  status: 'pago' | 'pendente' | 'atrasado';
  data_pagamento?: string;
  metodo?: string;
  comprovante_url?: string;
  admin_confirmado?: boolean;
  comprovante_pendente?: boolean;
}

export interface UniformeItem {
  id: string;
  descricao: string;
  tamanho?: string;
  quantidade: number;
  valor_unitario: number;
  status: 'solicitado' | 'confirmado' | 'entregue' | 'cancelado';
  data_solicitacao: string;
  data_entrega?: string;
}

export interface FichaFinanceira {
  student_id: string;
  nome_completo: string;
  cpf: string;
  nucleo: string;
  batizado: {
    modalidade: 'integral' | 'parcelado' | 'nao_definido';
    valor_total: number;
    parcelas: Parcela[];
    status_geral: 'pago' | 'pendente' | 'atrasado' | 'nao_definido';
  };
  contribuicao: {
    ativa: boolean;
    valor_mensal: number;
    historico: Mensalidade[];
  };
  mensalidades: Mensalidade[];
  uniformes: UniformeItem[];
  alertas: {
    comprovante_pendente: boolean;
    uniforme_solicitado: boolean;
    mensalidade_atrasada: boolean;
  };
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id');
  if (!studentId) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(`financeiro/${studentId}.json`);

  if (error || !data) {
    // Return empty default record
    return NextResponse.json(null);
  }

  try {
    const text = await data.text();
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(req: NextRequest) {
  const body: FichaFinanceira = await req.json();
  if (!body.student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  body.updated_at = new Date().toISOString();

  // Update alertas automatically
  body.alertas = {
    comprovante_pendente:
      body.mensalidades.some(m => m.comprovante_pendente) ||
      body.batizado.parcelas.some(p => p.status === 'pendente' && (p as any).comprovante_enviado),
    uniforme_solicitado: body.uniformes.some(u => u.status === 'solicitado'),
    mensalidade_atrasada:
      body.mensalidades.some(m => m.status === 'atrasado') ||
      body.batizado.parcelas.some(p => p.status === 'atrasado'),
  };

  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`financeiro/${body.student_id}.json`, blob, { upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: body });
}
