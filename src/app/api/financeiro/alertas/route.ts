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
          if (rec.alertas && (rec.alertas.comprovante_pendente || rec.alertas.uniforme_solicitado || rec.alertas.mensalidade_atrasada)) {
            alertas.push({
              student_id: studentId,
              nome_completo: rec.nome_completo,
              nucleo: rec.nucleo,
              ...rec.alertas,
            });
          }
        } catch {}
      })
  );

  return NextResponse.json(alertas);
}
