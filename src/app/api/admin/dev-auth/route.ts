import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Lê a env dentro da função para sempre pegar o valor atual (sem cache de módulo)
    const DEV_PASSWORD = process.env.DEV_PASSWORD || 'accbm@dev2025';

    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ ok: false, error: 'Senha ausente.' }, { status: 400 });
    }
    if (password.trim() === DEV_PASSWORD.trim()) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: 'Senha incorreta. Acesso negado.' }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 });
  }
}
