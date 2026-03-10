import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const BUCKET = 'photos';

// Returns a list of all student financial records that have active alerts
export async function GET() {
  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list('financeiro', { limit: 500 });

  if (error || !files) return NextResponse.json([]);

  const alertas: Array<{
    student_id: string;
    nome_completo: string;
    nucleo: string;
    comprovante_pendente: boolean;
    uniforme_solicitado: boolean;
    mensalidade_atrasada: boolean;
  }> = [];

  await Promise.all(
    files
      .filter(f => f.name.endsWith('.json'))
      .map(async f => {
        const studentId = f.name.replace('.json', '');
        const { data } = await supabase.storage
          .from(BUCKET)
          .download(`financeiro/${studentId}.json`);
        if (!data) return;
        try {
          const rec = JSON.parse(await data.text());
          const a = rec.alertas ?? {};
        const hasAlert = a.comprovante_pendente || a.uniforme_solicitado ||
          a.mensalidade_atrasada || a.batizado_modalidade_escolhida ||
          a.mensalidade_registrada || a.contribuicao_registrada || a.pagamento_registrado;
        if (hasAlert) {
            alertas.push({
              student_id: studentId,
              nome_completo: rec.nome_completo,
              nucleo: rec.nucleo,
              updated_at: rec.updated_at,
              ...a,
            });
          }
        } catch {}
      })
  );

  return NextResponse.json(alertas);
}
