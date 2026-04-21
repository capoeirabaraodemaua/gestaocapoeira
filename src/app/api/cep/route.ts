import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/cep?cep=00000000
// Server-side proxy for ViaCEP to avoid CORS issues in the browser
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cep = (searchParams.get('cep') || '').replace(/\D/g, '');

  if (cep.length !== 8) {
    return NextResponse.json({ error: 'CEP deve ter 8 dígitos.' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { 'User-Agent': 'SistemaDemo/1.0' },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'CEP não encontrado.' }, { status: 404 });
    }

    const data = await res.json();

    if (data.erro) {
      return NextResponse.json({ error: 'CEP não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      logradouro: data.logradouro || '',
      bairro:     data.bairro     || '',
      localidade: data.localidade || '',
      uf:         data.uf         || '',
      cep:        data.cep        || '',
    });
  } catch {
    return NextResponse.json({ error: 'Serviço de CEP indisponível.' }, { status: 503 });
  }
}
