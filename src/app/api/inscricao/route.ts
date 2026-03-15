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
// e garante que novas colunas existam
let constraintsFixed = false;
async function ensureNullableColumns() {
  if (constraintsFixed) return;
  // Remove NOT NULL constraints legados
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
  // Garante colunas novas (apelido, nome_social, sexo, email, etc.)
  const newCols = [
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS apelido TEXT`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS nome_social TEXT`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS sexo TEXT`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE`,
  ];
  for (const sql of newCols) {
    await tryExecSQL(sql);
  }
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

    // Normaliza nome: remove acentos, lowercase, colapsa espaços extras
    // Ex: "JOÃO  DA SILVA" == "joao da silva" == "João da Silva" == "Joao Da Silva"
    function normalizeName(s: string): string {
      return (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // remove diacríticos/acentos
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Verificar duplicata por CPF, identidade ou email
    const orParts: string[] = [];
    if (payload.cpf)        orParts.push(`cpf.eq.${payload.cpf}`);
    if (payload.identidade) orParts.push(`identidade.eq.${payload.identidade}`);
    if (payload.email)      orParts.push(`email.eq.${payload.email}`);
    if (orParts.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from('students')
        .select('id, nome_completo, cpf, identidade, email')
        .or(orParts.join(','))
        .limit(1);
      if (existing && existing.length > 0) {
        const dup = existing[0];
        let motivo = '';
        if (payload.cpf && dup.cpf === payload.cpf)
          motivo = `CPF ${payload.cpf}`;
        else if (payload.identidade && dup.identidade === payload.identidade)
          motivo = `Numeração Única/RG "${payload.identidade}"`;
        else
          motivo = `e-mail "${payload.email}"`;
        return NextResponse.json(
          { error: `Cadastro duplicado! Já existe um aluno com ${motivo}: ${dup.nome_completo}`, duplicate: true, field: motivo.startsWith('e-mail') ? 'email' : 'cpf' },
          { status: 409 }
        );
      }
    }

    // Verificar nome completo: obrigatório nome + sobrenome
    const nomeRaw = (payload.nome_completo as string || '').trim();
    const nomeParts = nomeRaw.split(/\s+/).filter(Boolean);
    if (nomeParts.length < 2) {
      return NextResponse.json(
        { error: 'O nome completo deve conter nome e sobrenome.', field: 'nome' },
        { status: 400 }
      );
    }

    // Verificar duplicata por nome — busca ampla pela primeira palavra, compara normalizado no JS
    // Isso garante que JOÃO == Joao == joao == João (maiúsculas, acentos, capitalização)
    if (nomeRaw) {
      const primeiroNome = normalizeName(nomeParts[0]);
      // Busca todos os alunos cujo nome começa com a primeira letra do nome (broad search)
      // Fazemos filtro pela primeira palavra usando ilike com wildcard para garantir hits
      const { data: candidates } = await supabaseAdmin
        .from('students')
        .select('id, nome_completo, cpf')
        .ilike('nome_completo', `${nomeParts[0][0]}%`)  // começa com mesma letra
        .limit(2000);

      if (candidates && candidates.length > 0) {
        const normalInput = normalizeName(nomeRaw);
        const dup = candidates.find(s => {
          const normalCandidate = normalizeName(s.nome_completo || '');
          return normalCandidate === normalInput;
        });
        if (dup) {
          return NextResponse.json(
            {
              error: `Cadastro duplicado! Já existe um aluno com o nome "${dup.nome_completo}". Se for a mesma pessoa, use o CPF para localizar o cadastro existente.`,
              duplicate: true,
              field: 'nome',
            },
            { status: 409 }
          );
        }
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

    // Busca o ID do aluno inserido — usa só 'id' para evitar erro de colunas faltantes
    let studentId: string | null = null;
    let inscricao_numero: number | null = null;

    const lookupSelect = async (filter: { col: string; val: string }) => {
      // Try with ordem_inscricao first; fall back to id-only if column missing
      try {
        const { data, error } = await supabaseAdmin
          .from('students').select('id, ordem_inscricao')
          .eq(filter.col, filter.val).limit(1).maybeSingle();
        if (!error && data) {
          studentId = data.id ?? null;
          inscricao_numero = (data as Record<string, unknown>)?.ordem_inscricao as number ?? null;
          return;
        }
      } catch {}
      // Fallback: id only
      const { data } = await supabaseAdmin
        .from('students').select('id')
        .eq(filter.col, filter.val).limit(1).maybeSingle();
      studentId = data?.id ?? null;
    };

    if (safePayload.cpf) {
      await lookupSelect({ col: 'cpf', val: safePayload.cpf as string });
    } else if (safePayload.identidade) {
      await lookupSelect({ col: 'identidade', val: safePayload.identidade as string });
    } else if (safePayload.nome_completo) {
      try {
        const { data, error } = await supabaseAdmin
          .from('students').select('id, ordem_inscricao')
          .eq('nome_completo', safePayload.nome_completo as string)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!error && data) {
          studentId = data.id ?? null;
          inscricao_numero = (data as Record<string, unknown>)?.ordem_inscricao as number ?? null;
        }
      } catch {}
      if (!studentId) {
        const { data } = await supabaseAdmin
          .from('students').select('id')
          .eq('nome_completo', safePayload.nome_completo as string)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        studentId = data?.id ?? null;
      }
    }

    // Se não tem ordem_inscricao: busca o mapa de matrículas no Storage e atribui próximo número
    if (!inscricao_numero) {
      try {
        const BUCKET = 'photos';
        const KEY = 'config/matriculas.json';
        const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(KEY, 10);
        let matMap: Record<string, number> = {};
        if (urlData?.signedUrl) {
          const mRes = await fetch(urlData.signedUrl, { cache: 'no-store' });
          if (mRes.ok) matMap = await mRes.json();
        }
        // Próximo número = max atual + 1
        const maxNum = Object.values(matMap).reduce((a, b) => Math.max(a, b), 0);
        inscricao_numero = maxNum + 1;
        // Salva no mapa
        if (studentId) matMap[studentId] = inscricao_numero;
        const cpfDigits = (safePayload.cpf as string || '').replace(/\D/g, '');
        if (cpfDigits) matMap[`cpf_${cpfDigits}`] = inscricao_numero;
        const blob = new Blob([JSON.stringify(matMap)], { type: 'application/json' });
        await supabaseAdmin.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
      } catch {
        // fallback: conta total de alunos
        const { count } = await supabaseAdmin.from('students').select('*', { count: 'exact', head: true });
        inscricao_numero = count ?? null;
      }
    }

    // Salva apelido, nome_social, sexo no Storage (independente de colunas DB)
    if (studentId) {
      const hasExtras = payload.apelido || payload.nome_social || payload.sexo;
      if (hasExtras) {
        try {
          const EXTRAS_KEY = 'extras/student-extras.json';
          const BUCKET = 'photos';
          // Load existing map
          let extMap: Record<string, Record<string, string>> = {};
          const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(EXTRAS_KEY, 15);
          if (urlData?.signedUrl) {
            const r = await fetch(urlData.signedUrl, { cache: 'no-store' });
            if (r.ok) extMap = await r.json();
          }
          extMap[studentId] = {
            ...(extMap[studentId] || {}),
            ...(payload.apelido  ? { apelido:    payload.apelido  as string } : {}),
            ...(payload.nome_social ? { nome_social: payload.nome_social as string } : {}),
            ...(payload.sexo     ? { sexo:       payload.sexo     as string } : {}),
          };
          const blob = new Blob([JSON.stringify(extMap)], { type: 'application/json' });
          await supabaseAdmin.storage.from(BUCKET).upload(EXTRAS_KEY, blob, { upsert: true });
        } catch { /* não bloqueia o cadastro */ }
      }
    }

    return NextResponse.json({ success: true, student_id: studentId, inscricao_numero });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('Erro rota inscricao:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
