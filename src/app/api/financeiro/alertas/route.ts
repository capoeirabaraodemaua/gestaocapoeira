import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

// These are non-student files in the financeiro/ folder — skip them
const SKIP_FILES = new Set(['config.json', 'doacoes.json', 'editais.json', 'materiais.json', 'patrimonio.json']);

export async function GET() {
  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list('financeiro', { limit: 500 });

  if (error || !files) return NextResponse.json([]);

  const alertas: Array<{
    student_id: string;
    nome_completo: string;
    nucleo: string;
    updated_at?: string;
    comprovante_pendente: boolean;
    uniforme_solicitado: boolean;
    mensalidade_atrasada: boolean;
    batizado_modalidade_escolhida?: boolean;
    mensalidade_registrada?: boolean;
    contribuicao_registrada?: boolean;
    pagamento_registrado?: boolean;
    ultimas_acoes?: string[];
  }> = [];

  await Promise.all(
    files
      .filter(f => f.name.endsWith('.json') && !SKIP_FILES.has(f.name))
      .map(async f => {
        const studentId = f.name.replace('.json', '');
        // Skip non-student files (must be a numeric ID or UUID, not a config filename)
        if (!/^\d+$/.test(studentId) && !/^[0-9a-f-]{8,}$/i.test(studentId)) return;

        const { data } = await supabase.storage
          .from(BUCKET)
          .download(`financeiro/${studentId}.json`);
        if (!data) return;
        try {
          const rec = JSON.parse(await data.text());
          // Must be a student record
          if (!rec.student_id || !rec.nome_completo) return;

          const a = rec.alertas ?? {};
          const hasAlert =
            a.comprovante_pendente ||
            a.uniforme_solicitado ||
            a.mensalidade_atrasada ||
            a.batizado_modalidade_escolhida ||
            a.mensalidade_registrada ||
            a.contribuicao_registrada ||
            a.pagamento_registrado;

          // Always include all records so admin can see full list — filter hasAlert for badge highlights
          if (hasAlert) {
            alertas.push({
              student_id: rec.student_id,
              nome_completo: rec.nome_completo,
              nucleo: rec.nucleo ?? '',
              updated_at: rec.updated_at,
              comprovante_pendente: !!a.comprovante_pendente,
              uniforme_solicitado: !!a.uniforme_solicitado,
              mensalidade_atrasada: !!a.mensalidade_atrasada,
              batizado_modalidade_escolhida: !!a.batizado_modalidade_escolhida,
              mensalidade_registrada: !!a.mensalidade_registrada,
              contribuicao_registrada: !!a.contribuicao_registrada,
              pagamento_registrado: !!a.pagamento_registrado,
              ultimas_acoes: a.ultimas_acoes ?? [],
            });
          }
        } catch {}
      })
  );

  // Sort by most recently updated
  alertas.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));

  return NextResponse.json(alertas);
}
