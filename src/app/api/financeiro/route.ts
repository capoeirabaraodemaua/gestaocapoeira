import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Read-only client (anon key) for GET
const supabaseRead = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Write client (service role) for POST — bypasses RLS
const supabaseWrite = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

export interface AlertaFinanceiro {
  comprovante_pendente: boolean;
  uniforme_solicitado: boolean;
  mensalidade_atrasada: boolean;
  // Expanded: any recent student-side action awaiting admin review
  batizado_modalidade_escolhida: boolean;   // student chose batizado modality
  mensalidade_registrada: boolean;          // student added a new mensalidade
  contribuicao_registrada: boolean;         // student added a contribution record
  pagamento_registrado: boolean;            // student selected a payment method
  ultimas_acoes: string[];                  // human-readable log of recent actions
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
  alertas: AlertaFinanceiro;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id');
  if (!studentId) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const { data, error } = await supabaseRead.storage
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
  const rawBody = await req.json();
  // admin_viewed flag: when admin saves, clear action-notification flags
  const isAdminSave = !!rawBody._admin_save;
  const body: FichaFinanceira = rawBody;
  delete (body as any)._admin_save;

  if (!body.student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const now = new Date().toISOString();
  body.updated_at = now;

  // Preserve existing action log if present
  const prevAcoes: string[] = body.alertas?.ultimas_acoes ?? [];

  // Detect new events to log (compare timestamps / presence)
  const acoes: string[] = [...prevAcoes];
  const br = new Date(now).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

  // Rebuild all alert flags automatically
  const comprovante_pendente =
    body.mensalidades.some(m => m.comprovante_pendente && !m.admin_confirmado) ||
    body.contribuicao.historico.some(m => m.comprovante_pendente && !m.admin_confirmado) ||
    body.batizado.parcelas.some(p => (p as any).comprovante_enviado && p.status !== 'pago');

  const uniforme_solicitado = body.uniformes.some(u => u.status === 'solicitado');

  const mensalidade_atrasada =
    body.mensalidades.some(m => m.status === 'atrasado') ||
    body.batizado.parcelas.some(p => p.status === 'atrasado') ||
    body.contribuicao.historico.some(m => m.status === 'atrasado');

  const batizado_modalidade_escolhida =
    body.batizado.modalidade !== 'nao_definido' &&
    body.batizado.parcelas.some(p => p.status === 'pendente');

  const mensalidade_registrada =
    body.mensalidades.some(m => m.status === 'pendente' && !m.admin_confirmado);

  const contribuicao_registrada =
    body.contribuicao.ativa &&
    body.contribuicao.historico.some(m => m.status === 'pendente' && !m.admin_confirmado);

  const pagamento_registrado =
    body.mensalidades.some(m => m.metodo && m.status === 'pendente') ||
    body.batizado.parcelas.some(p => p.metodo && p.status === 'pendente') ||
    body.contribuicao.historico.some(m => m.metodo && m.status === 'pendente');

  // Build action summary for admin (append new entry)
  const resumo: string[] = [];
  if (comprovante_pendente) resumo.push(`📎 Comprovante enviado`);
  if (uniforme_solicitado) resumo.push(`👕 Uniforme solicitado`);
  if (mensalidade_atrasada) resumo.push(`⚠ Pagamento atrasado`);
  if (batizado_modalidade_escolhida) resumo.push(`🥋 Batizado: ${body.batizado.modalidade}`);
  if (mensalidade_registrada) resumo.push(`📅 Mensalidade registrada`);
  if (contribuicao_registrada) resumo.push(`🤝 Contribuição registrada`);
  if (pagamento_registrado) resumo.push(`💳 Forma de pagamento selecionada`);

  if (resumo.length > 0) {
    acoes.unshift(`[${br}] ${resumo.join(' · ')}`);
  }

  body.alertas = {
    comprovante_pendente,
    uniforme_solicitado,
    mensalidade_atrasada,
    // When admin saves, clear action-notification flags (they've been seen)
    batizado_modalidade_escolhida: isAdminSave ? false : batizado_modalidade_escolhida,
    mensalidade_registrada: isAdminSave ? false : mensalidade_registrada,
    contribuicao_registrada: isAdminSave ? false : contribuicao_registrada,
    pagamento_registrado: isAdminSave ? false : pagamento_registrado,
    ultimas_acoes: acoes.slice(0, 20), // keep last 20 entries
  };

  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabaseWrite.storage
    .from(BUCKET)
    .upload(`financeiro/${body.student_id}.json`, blob, { upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: body });
}
