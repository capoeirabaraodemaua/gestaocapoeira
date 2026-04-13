import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTenantId } from '@/lib/tenants';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/admin/import-alunos
// Body: { auth: 'geral', rows: Array<Record<string,string>> }
// Matches by cpf first, then nome_completo (normalised), then PATCHes missing/provided fields
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = (body.auth || '').toLowerCase();
    if (!['geral', 'admin'].includes(auth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const rows: Record<string, string>[] = body.rows || [];
    if (!rows.length) return NextResponse.json({ error: 'Nenhum registro enviado.' }, { status: 400 });

    const { data: students, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, nome_completo, cpf');
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const normalize = (s: string) =>
      (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    const nameMap: Record<string, string> = {};
    const cpfMap: Record<string, string> = {};
    for (const s of (students || [])) {
      nameMap[normalize(s.nome_completo || '')] = s.id;
      if (s.cpf) cpfMap[s.cpf.replace(/\D/g, '')] = s.id;
    }

    let updated = 0, skipped = 0, notFound = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const cpfRaw = (row.cpf || '').replace(/\D/g, '');
      let studentId = cpfRaw.length === 11 ? cpfMap[cpfRaw] : undefined;
      if (!studentId) studentId = nameMap[normalize(row.nome_completo || row.nome || '')];
      if (!studentId) { notFound++; continue; }

      const str = (v: string | undefined) => v?.trim() || null;
      const bool = (v: string | undefined) => {
        if (!v) return undefined;
        return ['true', 'sim', '1', 'yes'].includes(v.trim().toLowerCase());
      };

      const patch: Record<string, unknown> = {};

      if (str(row.cpf))              patch.cpf              = str(row.cpf);
      if (str(row.identidade))       patch.identidade       = str(row.identidade);
      if (str(row.email))            patch.email            = str(row.email);
      if (str(row.telefone))         patch.telefone         = str(row.telefone);
      if (str(row.data_nascimento))  patch.data_nascimento  = str(row.data_nascimento);
      if (str(row.nucleo))           { patch.nucleo = str(row.nucleo); patch.tenant_id = getTenantId(row.nucleo.trim()); }
      if (str(row.graduacao))        patch.graduacao        = str(row.graduacao);
      if (str(row.tipo_graduacao))   patch.tipo_graduacao   = str(row.tipo_graduacao);
      if (str(row.cep))              patch.cep              = str(row.cep);
      if (str(row.endereco))         patch.endereco         = str(row.endereco);
      if (str(row.numero))           patch.numero           = str(row.numero);
      if (str(row.complemento))      patch.complemento      = str(row.complemento);
      if (str(row.bairro))           patch.bairro           = str(row.bairro);
      if (str(row.cidade))           patch.cidade           = str(row.cidade);
      if (str(row.estado))           patch.estado           = str(row.estado);
      if (str(row.nome_pai))         patch.nome_pai         = str(row.nome_pai);
      if (str(row.nome_mae))         patch.nome_mae         = str(row.nome_mae);
      if (str(row.nome_responsavel)) patch.nome_responsavel = str(row.nome_responsavel);
      if (str(row.cpf_responsavel))  patch.cpf_responsavel  = str(row.cpf_responsavel);
      if (str(row.apelido))          patch.apelido          = str(row.apelido);
      if (str(row.nome_social))      patch.nome_social      = str(row.nome_social);
      if (str(row.sexo))             patch.sexo             = str(row.sexo);

      const menorVal = bool(row.menor_de_idade);
      if (menorVal !== undefined) patch.menor_de_idade = menorVal;

      // Auto-compute menor_de_idade from data_nascimento
      if (patch.menor_de_idade === undefined && patch.data_nascimento) {
        try {
          const dob = new Date(String(patch.data_nascimento) + 'T12:00:00');
          const today = new Date();
          const age = today.getFullYear() - dob.getFullYear() -
            (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
          patch.menor_de_idade = age < 18;
        } catch { /* skip */ }
      }

      // Auto-set tipo_graduacao if missing
      if (!patch.tipo_graduacao && patch.nucleo) {
        patch.tipo_graduacao = patch.menor_de_idade ? 'infantil' : 'adulta';
      }

      if (!Object.keys(patch).length) { skipped++; continue; }

      const { error } = await supabaseAdmin.from('students').update(patch).eq('id', studentId);
      if (error) {
        errors.push(`${row.nome_completo || row.nome}: ${error.message}`);
        skipped++;
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      notFound,
      total: rows.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
