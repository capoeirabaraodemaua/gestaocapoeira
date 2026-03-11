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

export interface RascunhoData {
  id: string;
  nome_completo?: string;
  cpf?: string;
  identidade?: string;
  data_nascimento?: string;
  email?: string;
  telefone?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  nucleo?: string;
  graduacao?: string;
  tipo_graduacao?: string;
  foto_url?: string | null;
  nome_pai?: string;
  nome_mae?: string;
  autoriza_imagem?: boolean;
  menor_de_idade?: boolean;
  nome_responsavel?: string;
  cpf_responsavel?: string;
  assinatura_responsavel?: boolean;
  assinatura_pai?: boolean;
  assinatura_mae?: boolean;
  dados_pendentes: string[];
  created_at: string;
  updated_at: string;
}

// Required fields and their friendly labels
const REQUIRED_FIELDS: Record<string, string> = {
  nome_completo: 'Nome Completo',
  identidade: 'Identidade / Numeração Única',
  data_nascimento: 'Data de Nascimento',
  telefone: 'Telefone',
  cep: 'CEP',
  endereco: 'Endereço',
  numero: 'Número',
  bairro: 'Bairro',
  cidade: 'Cidade',
  estado: 'Estado',
  nucleo: 'Núcleo',
  graduacao: 'Graduação',
  tipo_graduacao: 'Tipo de Graduação',
};

function calcularPendencias(data: Partial<RascunhoData>): string[] {
  const pendentes: string[] = [];
  for (const [field, label] of Object.entries(REQUIRED_FIELDS)) {
    const val = (data as Record<string, unknown>)[field];
    if (!val || (typeof val === 'string' && !val.trim())) {
      pendentes.push(label);
    }
  }
  // Minor-specific checks
  if (data.menor_de_idade) {
    if (!data.nome_responsavel?.trim()) pendentes.push('Nome do Responsável');
    if (!data.cpf_responsavel?.trim()) pendentes.push('CPF do Responsável');
  }
  return pendentes;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabase.storage.from(BUCKET).download(`rascunhos/${id}.json`);
    if (error || !data) return NextResponse.json(null);
    try {
      return NextResponse.json(JSON.parse(await data.text()));
    } catch {
      return NextResponse.json(null);
    }
  }

  // List all drafts
  const { data: files, error } = await supabase.storage.from(BUCKET).list('rascunhos', { limit: 500 });
  if (error || !files) return NextResponse.json([]);

  const rascunhos: RascunhoData[] = [];
  await Promise.all(
    files.filter(f => f.name.endsWith('.json')).map(async f => {
      const { data } = await supabase.storage.from(BUCKET).download(`rascunhos/${f.name}`);
      if (!data) return;
      try { rascunhos.push(JSON.parse(await data.text())); } catch {}
    })
  );
  rascunhos.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return NextResponse.json(rascunhos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body._delete) {
    const { error } = await supabaseWrite.storage.from(BUCKET).remove([`rascunhos/${body._delete}.json`]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = body.id || `rasc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  const pendentes = calcularPendencias(body);

  const rascunho: RascunhoData = {
    ...body,
    id,
    dados_pendentes: pendentes,
    created_at: body.created_at || now,
    updated_at: now,
  };

  const blob = new Blob([JSON.stringify(rascunho)], { type: 'application/json' });
  const { error } = await supabaseWrite.storage.from(BUCKET).upload(`rascunhos/${id}.json`, blob, { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: rascunho });
}
