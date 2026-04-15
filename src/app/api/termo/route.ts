import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await admin
    .from('students')
    .select('id,nome_completo,cpf,data_nascimento,nome_pai,nome_mae,nucleo,nome_responsavel,cpf_responsavel,assinatura_responsavel,menor_de_idade')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { nome_responsavel, cpf_responsavel } = body;

  if (!nome_responsavel?.trim()) {
    return NextResponse.json({ error: 'nome_responsavel required' }, { status: 400 });
  }

  const { error } = await admin
    .from('students')
    .update({ nome_responsavel, cpf_responsavel, assinatura_responsavel: true })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
