import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { to, nome, nucleo, graduacao } = await req.json();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) {
    // Sem chave configurada — retorna ok silencioso
    return NextResponse.json({ ok: true, skipped: true });
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
      <div style="background:linear-gradient(135deg,#dc2626,#7c3aed);padding:28px 24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.4rem">Inscrição Confirmada!</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:0.9rem">Associação Cultural de Capoeira Barão de Mauá</p>
      </div>
      <div style="padding:28px 24px">
        <p style="font-size:1rem;color:#374151">Olá, <strong>${nome}</strong>!</p>
        <p style="color:#6b7280">Sua inscrição foi recebida com sucesso. Aqui estão seus dados:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:0.88rem">Nome</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#111827">${nome}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:0.88rem">Núcleo</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#111827">${nucleo || '—'}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:0.88rem">Graduação</td><td style="padding:10px 0;font-weight:600;color:#111827">${graduacao || '—'}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:0.88rem;margin-top:24px">Bem-vindo(a) à família Barão de Mauá! Em breve entraremos em contato com mais informações. <strong>Axé!</strong></p>
      </div>
      <div style="padding:16px 24px;background:#f9fafb;border-radius:0 0 8px 8px;text-align:center">
        <p style="color:#9ca3af;font-size:0.78rem;margin:0">Associação Cultural de Capoeira Barão de Mauá</p>
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Capoeira Barão de Mauá <onboarding@resend.dev>',
        to: [to],
        subject: '✅ Inscrição Confirmada — Capoeira Barão de Mauá',
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return NextResponse.json({ ok: false, error: err }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Email send error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
