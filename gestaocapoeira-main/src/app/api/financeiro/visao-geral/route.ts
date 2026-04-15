import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'photos';

export const dynamic = 'force-dynamic';

export interface LancamentoItem {
  student_id: string;
  nome_completo: string;
  nucleo: string;
  tipo: 'mensalidade' | 'batizado' | 'contribuicao' | 'uniforme';
  descricao: string;
  valor: number;
  status: string;
  data: string; // YYYY-MM or date string
  metodo?: string;
  admin_confirmado?: boolean;
}

export interface VisaoGeralFinanceiro {
  total_alunos_com_ficha: number;
  total_arrecadado: number;
  total_pendente: number;
  por_nucleo: Record<string, {
    alunos: number;
    arrecadado: number;
    pendente: number;
    atrasado: number;
  }>;
  lancamentos: LancamentoItem[];
  updated_at: string;
}

// List all objects in financeiro/ prefix
async function listFinanceiroFiles(): Promise<string[]> {
  const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: 'financeiro/', limit: 1000, offset: 0 }),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const items: Array<{ name: string }> = await res.json();
  return items
    .map(i => i.name)
    .filter(n => n.endsWith('.json') && n !== 'config.json' && n !== 'doacoes.json' && n !== 'editais.json');
}

async function fetchFicha(fileName: string): Promise<any | null> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/financeiro/${fileName}?t=${Date.now()}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Cache-Control': 'no-store' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

export async function GET() {
  const files = await listFinanceiroFiles();

  const lancamentos: LancamentoItem[] = [];
  const porNucleo: Record<string, { alunos: number; arrecadado: number; pendente: number; atrasado: number }> = {};
  let totalArrecadado = 0;
  let totalPendente = 0;
  let totalAlunosComFicha = 0;

  // Fetch all fichas in parallel (batches of 20)
  const BATCH = 20;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const fichas = await Promise.all(batch.map(f => fetchFicha(f)));

    for (const ficha of fichas) {
      if (!ficha || !ficha.student_id) continue;
      totalAlunosComFicha++;
      const nucleo = ficha.nucleo || 'Sem núcleo';
      if (!porNucleo[nucleo]) porNucleo[nucleo] = { alunos: 0, arrecadado: 0, pendente: 0, atrasado: 0 };
      porNucleo[nucleo].alunos++;

      // Mensalidades
      for (const m of (ficha.mensalidades || [])) {
        const valor = Number(m.valor) || 0;
        const item: LancamentoItem = {
          student_id: ficha.student_id,
          nome_completo: ficha.nome_completo || '',
          nucleo,
          tipo: 'mensalidade',
          descricao: `Mensalidade ${m.mes || ''}`,
          valor,
          status: m.status || 'pendente',
          data: m.mes || '',
          metodo: m.metodo,
          admin_confirmado: m.admin_confirmado,
        };
        lancamentos.push(item);
        if (m.status === 'pago') { totalArrecadado += valor; porNucleo[nucleo].arrecadado += valor; }
        else if (m.status === 'atrasado') { totalPendente += valor; porNucleo[nucleo].pendente += valor; porNucleo[nucleo].atrasado += valor; }
        else { totalPendente += valor; porNucleo[nucleo].pendente += valor; }
      }

      // Batizado parcelas
      for (const p of (ficha.batizado?.parcelas || [])) {
        const valor = Number(p.valor) || 0;
        const item: LancamentoItem = {
          student_id: ficha.student_id,
          nome_completo: ficha.nome_completo || '',
          nucleo,
          tipo: 'batizado',
          descricao: `Batizado Parcela ${p.numero || ''}`,
          valor,
          status: p.status || 'pendente',
          data: p.vencimento || '',
          metodo: p.metodo,
          admin_confirmado: p.admin_confirmado,
        };
        lancamentos.push(item);
        if (p.status === 'pago') { totalArrecadado += valor; porNucleo[nucleo].arrecadado += valor; }
        else if (p.status === 'atrasado') { totalPendente += valor; porNucleo[nucleo].pendente += valor; porNucleo[nucleo].atrasado += valor; }
        else { totalPendente += valor; porNucleo[nucleo].pendente += valor; }
      }

      // Contribuição
      for (const c of (ficha.contribuicao?.historico || [])) {
        const valor = Number(c.valor) || 0;
        const item: LancamentoItem = {
          student_id: ficha.student_id,
          nome_completo: ficha.nome_completo || '',
          nucleo,
          tipo: 'contribuicao',
          descricao: `Contribuição ${c.mes || ''}`,
          valor,
          status: c.status || 'pendente',
          data: c.mes || '',
          metodo: c.metodo,
          admin_confirmado: c.admin_confirmado,
        };
        lancamentos.push(item);
        if (c.status === 'pago') { totalArrecadado += valor; porNucleo[nucleo].arrecadado += valor; }
        else if (c.status === 'atrasado') { totalPendente += valor; porNucleo[nucleo].pendente += valor; porNucleo[nucleo].atrasado += valor; }
        else { totalPendente += valor; porNucleo[nucleo].pendente += valor; }
      }

      // Uniformes
      for (const u of (ficha.uniformes || [])) {
        const valor = Number(u.valor_unitario) * Number(u.quantidade || 1);
        const item: LancamentoItem = {
          student_id: ficha.student_id,
          nome_completo: ficha.nome_completo || '',
          nucleo,
          tipo: 'uniforme',
          descricao: `${u.descricao || 'Uniforme'}${u.tamanho ? ` (${u.tamanho})` : ''}`,
          valor,
          status: u.status || 'solicitado',
          data: u.data_solicitacao || '',
        };
        lancamentos.push(item);
        if (u.status === 'entregue' || u.status === 'confirmado') { totalArrecadado += valor; porNucleo[nucleo].arrecadado += valor; }
        else if (u.status !== 'cancelado') { totalPendente += valor; porNucleo[nucleo].pendente += valor; }
      }
    }
  }

  // Sort by date desc
  lancamentos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  const result: VisaoGeralFinanceiro = {
    total_alunos_com_ficha: totalAlunosComFicha,
    total_arrecadado: Math.round(totalArrecadado * 100) / 100,
    total_pendente: Math.round(totalPendente * 100) / 100,
    por_nucleo: porNucleo,
    lancamentos,
    updated_at: new Date().toISOString(),
  };

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store, no-cache' },
  });
}
