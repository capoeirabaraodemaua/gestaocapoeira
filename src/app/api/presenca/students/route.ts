import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    let { data, error } = await supabaseAdmin
      .from('students')
      .select('id, nome_completo, cpf, graduacao, nucleo, foto_url, telefone, email')
      .order('nome_completo');

    if (error) {
      // Retry without email if column doesn't exist
      const res = await supabaseAdmin
        .from('students')
        .select('id, nome_completo, cpf, graduacao, nucleo, foto_url, telefone')
        .order('nome_completo');
      data = res.data as typeof data;
    }

    return NextResponse.json(data || []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
