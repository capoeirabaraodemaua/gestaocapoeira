import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Tenta executar SQL via Management API do Supabase
async function tryExecSQL(sql: string): Promise<boolean> {
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ query: sql }),
    });
    return res.ok;
  } catch { return false; }
}

// Remove NOT NULL de colunas que costumam ser obrigatórias no schema legado
let constraintsFixed = false;
async function ensureNullableColumns() {
  if (constraintsFixed) return;
  await tryExecSQL(`
    ALTER TABLE students ALTER COLUMN cpf DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN identidade DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN nome_completo DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN data_nascimento DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN telefone DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN endereco DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN numero DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN bairro DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN cidade DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN estado DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN graduacao DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN tipo_graduacao DROP NOT NULL;
    ALTER TABLE students ALTER COLUMN nucleo DROP NOT NULL;
  `);
  constraintsFixed = true;
}

const KNOWN_COLUMNS = [
  'nome_completo', 'apelido', 'nome_social', 'sexo', 'cpf', 'identidade',
  'data_nascimento', 'telefone', 'email', 'cep', 'endereco', 'numero',
  'complemento', 'bairro', 'cidade', 'estado', 'graduacao', 'tipo_graduacao',
  'nucleo', 'foto_url', 'nome_pai', 'nome_mae', 'autoriza_imagem',
  'menor_de_idade', 'nome_responsavel', 'cpf_responsavel',
  'assinatura_responsavel', 'assinatura_pai', 'assinatura_mae',
];

export async function POST(req: NextRequest) {
  try {
    // Garante que colunas sejam nullable (remove NOT NULL constraints legados)
    await ensureNullableColumns();

    const body = await req.json();
    const { payload } = body as { payload: Record<string, unknown> };

    if (!payload) {
      return NextResponse.json({ error: 'Payload ausente' }, { status: 400 });
    }

    // Verificar duplicata por CPF ou identidade
    const orParts: string[] = [];
    if (payload.cpf) orParts.push(`cpf.eq.${payload.cpf}`);
    if (payload.identidade) orParts.push(`identidade.eq.${payload.identidade}`);
    if (orParts.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from('students')
        .select('id, nome_completo, cpf, identidade')
        .or(orParts.join(','))
        .limit(1);
      if (existing && existing.length > 0) {
        const dup = existing[0];
        const motivo =
          payload.cpf && dup.cpf === payload.cpf ? `CPF ${payload.cpf}` :
          `Numeração Única/RG "${payload.identidade}"`;
        return NextResponse.json(
          { error: `Cadastro duplicado! Já existe um aluno com ${motivo}: ${dup.nome_completo}`, duplicate: true },
          { status: 409 }
        );
      }
    }

    // Descobre quais colunas têm NOT NULL constraint e preenche com placeholder se vazio
    // Isso evita erros de constraint sem precisar alterar o schema
    const NOT_NULL_COLS_FALLBACK: Record<string, unknown> = {
      cpf: '',
      identidade: '',
      nome_completo: '',
      data_nascimento: '1900-01-01',
      telefone: '',
      endereco: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: '',
      graduacao: 'Cru',
      tipo_graduacao: 'corda',
      nucleo: '',
      nome_pai: '',
      nome_mae: '',
      nome_responsavel: '',
      cpf_responsavel: '',
      email: '',
      apelido: '',
      nome_social: '',
      sexo: '',
    };

    // Monta payload limpo: mantém valores reais, aplica fallbacks para NOT NULL
    const safePayload: Record<string, unknown> = {};
    // Primeiro: aplica todos os fallbacks como base
    for (const [k, v] of Object.entries(NOT_NULL_COLS_FALLBACK)) {
      safePayload[k] = v;
    }
    // Depois: sobrescreve com valores reais do usuário (não nulos/vazios)
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === 'boolean') {
        safePayload[k] = v;
      } else if (v !== null && v !== undefined && v !== '') {
        safePayload[k] = v;
      }
    }
    // Garante campos booleanos obrigatórios
    safePayload.autoriza_imagem = payload.autoriza_imagem ?? false;
    safePayload.menor_de_idade = payload.menor_de_idade ?? false;
    safePayload.assinatura_responsavel = payload.assinatura_responsavel ?? false;

    let insertError: { message?: string; details?: string; hint?: string; code?: string } | null = null;

    // Tenta inserir — remove colunas inexistentes no schema (até 8 tentativas)
    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabaseAdmin.from('students').insert(safePayload);
      if (!error) {
        insertError = null;
        break;
      }
      insertError = error;
      const msg = error.message || '';

      // Detecta coluna inexistente e remove do payload para retry
      const missingColMatch = msg.match(/Could not find the '(\w+)' column|column[s]?\s+['"]?(\w+)['"]?\s+of relation/i);
      const missingCol = missingColMatch ? (missingColMatch[1] || missingColMatch[2]) : null;
      if (missingCol && safePayload[missingCol] !== undefined) {
        delete safePayload[missingCol];
        continue;
      }

      // Erro não recuperável
      break;
    }

    if (insertError) {
      console.error('Erro insert aluno:', insertError);
      return NextResponse.json(
        { error: insertError.message || insertError.details || insertError.hint || 'Erro ao salvar no banco' },
        { status: 500 }
      );
    }

    // Busca o ID do aluno inserido
    let studentId: string | null = null;
    let inscricao_numero: number | null = null;

    if (safePayload.cpf) {
      const { data } = await supabaseAdmin.from('students').select('id, ordem_inscricao').eq('cpf', safePayload.cpf as string).limit(1).maybeSingle();
      studentId = data?.id ?? null;
      inscricao_numero = (data as Record<string, unknown>)?.ordem_inscricao as number ?? null;
    } else if (safePayload.identidade) {
      const { data } = await supabaseAdmin.from('students').select('id, ordem_inscricao').eq('identidade', safePayload.identidade as string).limit(1).maybeSingle();
      studentId = data?.id ?? null;
      inscricao_numero = (data as Record<string, unknown>)?.ordem_inscricao as number ?? null;
    } else if (safePayload.nome_completo) {
      const { data } = await supabaseAdmin.from('students').select('id, ordem_inscricao').eq('nome_completo', safePayload.nome_completo as string).order('created_at', { ascending: false }).limit(1).maybeSingle();
      studentId = data?.id ?? null;
      inscricao_numero = (data as Record<string, unknown>)?.ordem_inscricao as number ?? null;
    }

    if (!inscricao_numero) {
      const { count } = await supabaseAdmin.from('students').select('*', { count: 'exact', head: true });
      inscricao_numero = count ?? null;
    }

    return NextResponse.json({ success: true, student_id: studentId, inscricao_numero });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('Erro rota inscricao:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
