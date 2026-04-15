import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Service role required — bucket 'photos' is private, anon key cannot read it
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const supabaseWrite = supabase;

const BUCKET = 'photos';

export interface RascunhoData {
  id: string;
  nome_completo?: string;
  apelido?: string;
  nome_social?: string;
  sexo?: string;
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

function isMenorDeIdade(data_nascimento?: string): boolean {
  if (!data_nascimento) return false;
  const birth = new Date(data_nascimento + 'T12:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 18;
}

function calcularPendencias(data: Partial<RascunhoData>): string[] {
  const pendentes: string[] = [];
  for (const [field, label] of Object.entries(REQUIRED_FIELDS)) {
    const val = (data as Record<string, unknown>)[field];
    if (!val || (typeof val === 'string' && !val.trim())) {
      pendentes.push(label);
    }
  }
  // Responsável só é exigido para menores — detectado pela data de nascimento
  const menor = data.menor_de_idade ?? isMenorDeIdade(data.data_nascimento);
  if (menor) {
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
      try {
        const r = JSON.parse(await data.text());
        // Always recalculate dados_pendentes to avoid stale data
        r.dados_pendentes = calcularPendencias(r);
        rascunhos.push(r);
      } catch {}
    })
  );
  rascunhos.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return NextResponse.json(rascunhos);
}

function normalizeName(s: string) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body._delete) {
    const { error } = await supabaseWrite.storage.from(BUCKET).remove([`rascunhos/${body._delete}.json`]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const isUpdate = !!body.id; // updating existing draft — skip duplicate checks against students

  // ── Verificar duplicata contra a tabela de alunos já cadastrados ─────────
  if (!isUpdate) {
    const normalizeDoc   = (s: unknown) => String(s || '').replace(/\D/g, '');
    const normalizeEmail = (s: unknown) => String(s || '').trim().toLowerCase();

    const cpfNorm   = normalizeDoc(body.cpf);
    const identNorm = normalizeDoc(body.identidade);
    const emailNorm = normalizeEmail(body.email);

    const hasCpf   = cpfNorm.length >= 6;
    const hasIdent = identNorm.length >= 4;
    const hasEmail = emailNorm.length > 3 && emailNorm.includes('@');

    if (hasCpf || hasIdent || hasEmail) {
      const { data: allStudents } = await supabase
        .from('students')
        .select('id, nome_completo, cpf, identidade, email')
        .limit(5000);
      const dup = (allStudents || []).find(s => {
        if (hasCpf   && normalizeDoc(s.cpf)        === cpfNorm)   return true;
        if (hasIdent && normalizeDoc(s.identidade) === identNorm) return true;
        if (hasEmail && normalizeEmail(s.email)    === emailNorm) return true;
        return false;
      });
      if (dup) {
        let motivo = '';
        if (hasCpf   && normalizeDoc(dup.cpf)        === cpfNorm)   motivo = `CPF ${body.cpf}`;
        else if (hasIdent && normalizeDoc(dup.identidade) === identNorm) motivo = `Numeração Única/RG "${body.identidade}"`;
        else                                                              motivo = `e-mail "${body.email}"`;
        return NextResponse.json(
          { error: `Cadastro duplicado! Já existe um aluno cadastrado com ${motivo}: ${dup.nome_completo}. Não é possível salvar rascunho.`, duplicate: true, field: motivo.startsWith('e-mail') ? 'email' : 'cpf' },
          { status: 409 }
        );
      }
    }

    // ── Verificar duplicata pelo nome contra alunos já cadastrados ──────────
    const nomeRaw = (body.nome_completo || '').trim();
    const nomeParts = nomeRaw.split(/\s+/).filter(Boolean);
    if (nomeParts.length >= 2) {
      const { data: candidates } = await supabase
        .from('students')
        .select('id, nome_completo')
        .ilike('nome_completo', `${nomeParts[0][0]}%`)
        .limit(2000);
      if (candidates && candidates.length > 0) {
        const normalInput = normalizeName(nomeRaw);
        const dup = candidates.find(s => normalizeName(s.nome_completo || '') === normalInput);
        if (dup) {
          return NextResponse.json(
            { error: `Cadastro duplicado! Já existe um aluno com o nome "${dup.nome_completo}". Não é possível salvar rascunho.`, duplicate: true, field: 'nome' },
            { status: 409 }
          );
        }
      }
    }
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
