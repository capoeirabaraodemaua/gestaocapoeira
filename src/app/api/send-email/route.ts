import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  const { to, tipo } = body;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let subject = '';
  let html = '';

  // ── Confirmação de inscrição ──────────────────────────────────────────────
  if (!tipo || tipo === 'inscricao') {
    const { nome, nucleo, graduacao } = body;
    subject = '✅ Inscrição Confirmada — Capoeira Barão de Mauá';
    html = `
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
  }

  // ── Recuperação de senha do aluno (código OTP) ─────────────────────────────
  else if (tipo === 'recuperacao') {
    const { nome, otp } = body;
    subject = '🔑 Código de recuperação de senha — ACCBM';
    html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
        <div style="background:linear-gradient(135deg,#1d4ed8,#7c3aed);padding:24px;border-radius:8px 8px 0 0;text-align:center">
          <h2 style="color:#fff;margin:0;font-size:1.25rem">Recuperação de Senha</h2>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:0.85rem">Associação Cultural de Capoeira Barão de Mauá</p>
        </div>
        <div style="padding:28px 24px">
          <p style="color:#374151">Olá, <strong>${nome || 'Aluno'}</strong>!</p>
          <p style="color:#6b7280;margin-bottom:24px">Recebemos uma solicitação de recuperação de senha. Use o código abaixo:</p>
          <div style="background:#f0f9ff;border:2px solid #bfdbfe;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
            <div style="font-size:2.5rem;font-weight:800;letter-spacing:0.35em;color:#1e40af;font-family:monospace">${otp}</div>
            <p style="color:#64748b;font-size:0.8rem;margin:8px 0 0">Válido por 15 minutos</p>
          </div>
          <p style="color:#94a3b8;font-size:0.8rem;margin-top:24px">Se você não solicitou a recuperação de senha, ignore este e-mail. Sua senha permanece a mesma.</p>
        </div>
        <div style="padding:14px 24px;background:#f9fafb;border-radius:0 0 8px 8px;text-align:center">
          <p style="color:#9ca3af;font-size:0.75rem;margin:0">ACCBM — Associação Cultural de Capoeira Barão de Mauá</p>
        </div>
      </div>
    `;
  }

  // ── Redefinição de senha responsável/admin (link com token) ───────────────
  else if (tipo === 'reset-link') {
    const { nome, resetUrl } = body;
    subject = '🔐 Redefinição de senha — Painel ACCBM';
    html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
        <div style="background:linear-gradient(135deg,#1d4ed8,#1e40af);padding:24px;border-radius:8px 8px 0 0;text-align:center">
          <h2 style="color:#fff;margin:0;font-size:1.25rem">Redefinir Senha</h2>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:0.85rem">Painel Administrativo ACCBM</p>
        </div>
        <div style="padding:28px 24px">
          <p style="color:#374151">Olá, <strong>${nome || 'Responsável'}</strong>!</p>
          <p style="color:#6b7280;margin-bottom:24px">Recebemos uma solicitação para redefinir sua senha de acesso ao painel de núcleo.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${resetUrl}" style="background:#1d4ed8;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block">
              🔐 Redefinir minha senha
            </a>
          </div>
          <p style="color:#64748b;font-size:0.82rem;text-align:center">Este link expira em <strong>30 minutos</strong>.</p>
          <p style="color:#94a3b8;font-size:0.78rem;margin-top:20px">Se você não solicitou a redefinição, ignore este e-mail. Sua senha permanece a mesma.</p>
        </div>
        <div style="padding:14px 24px;background:#f9fafb;border-radius:0 0 8px 8px;text-align:center">
          <p style="color:#9ca3af;font-size:0.75rem;margin:0">ACCBM — Associação Cultural de Capoeira Barão de Mauá</p>
        </div>
      </div>
    `;
  }

  // ── Nova senha provisória (admin reset) ──────────────────────────────────
  else if (tipo === 'nova-senha') {
    const { nome, novaSenha, loginUrl } = body;
    subject = '🔑 Nova senha provisória — ACCBM';
    html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
        <div style="background:linear-gradient(135deg,#16a34a,#059669);padding:24px;border-radius:8px 8px 0 0;text-align:center">
          <h2 style="color:#fff;margin:0;font-size:1.25rem">Sua Nova Senha</h2>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:0.85rem">Associação Cultural de Capoeira Barão de Mauá</p>
        </div>
        <div style="padding:28px 24px">
          <p style="color:#374151">Olá, <strong>${nome || 'Aluno'}</strong>!</p>
          <p style="color:#6b7280;margin-bottom:20px">O administrador redefiniu sua senha de acesso à Área do Aluno. Use a senha abaixo para entrar:</p>
          <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
            <div style="font-size:1.6rem;font-weight:800;letter-spacing:0.1em;color:#166534;font-family:monospace">${novaSenha}</div>
            <p style="color:#64748b;font-size:0.78rem;margin:8px 0 0">Recomendamos trocar esta senha após o primeiro acesso</p>
          </div>
          ${loginUrl ? `<div style="text-align:center;margin:20px 0"><a href="${loginUrl}" style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">Acessar Área do Aluno</a></div>` : ''}
          <p style="color:#94a3b8;font-size:0.78rem;margin-top:16px">Se você não reconhece esta ação, entre em contato com a ACCBM.</p>
        </div>
        <div style="padding:14px 24px;background:#f9fafb;border-radius:0 0 8px 8px;text-align:center">
          <p style="color:#9ca3af;font-size:0.75rem;margin:0">ACCBM — Associação Cultural de Capoeira Barão de Mauá</p>
        </div>
      </div>
    `;
  }

  if (!html) {
    return NextResponse.json({ ok: false, error: 'Tipo de e-mail desconhecido.' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'ACCBM <noreply@accbm.com.br>',
        to: Array.isArray(to) ? to : [to],
        subject,
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
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
