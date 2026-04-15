import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { to, label, username, password } = await req.json();
    if (!to || !username || !password) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#dc2626,#1d4ed8);padding:28px 28px 24px;text-align:center">
      <div style="color:#fff;font-size:1.3rem;font-weight:900;letter-spacing:0.03em">ACCBM</div>
      <div style="color:rgba(255,255,255,0.8);font-size:0.8rem;margin-top:4px">Associação Cultural de Capoeira Barão de Mauá</div>
    </div>
    <div style="padding:28px">
      <h2 style="margin:0 0 8px;color:#111827;font-size:1rem;font-weight:800">🔐 Suas Credenciais de Acesso</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:0.85rem">As credenciais do painel administrativo foram atualizadas para <strong>${label}</strong>.</p>

      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:18px;margin-bottom:20px">
        <div style="margin-bottom:12px">
          <div style="font-size:0.72rem;color:#0369a1;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Usuário</div>
          <div style="font-family:monospace;font-size:1.1rem;font-weight:800;color:#0f172a;background:#e0f2fe;border-radius:8px;padding:8px 14px;letter-spacing:0.04em">${username}</div>
        </div>
        <div>
          <div style="font-size:0.72rem;color:#0369a1;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Senha</div>
          <div style="font-family:monospace;font-size:1.1rem;font-weight:800;color:#0f172a;background:#e0f2fe;border-radius:8px;padding:8px 14px;letter-spacing:0.08em">${password}</div>
        </div>
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:0.8rem;color:#92400e;margin-bottom:20px">
        ⚠️ <strong>Mantenha estas credenciais em local seguro.</strong> Não compartilhe sua senha com ninguém. Recomendamos alterar a senha após o primeiro acesso.
      </div>

      <p style="margin:0;font-size:0.75rem;color:#9ca3af;text-align:center">Capoeira Barão de Mauá — Sistema de Gestão ACCBM</p>
    </div>
  </div>
</body>
</html>`;

    const result = await sendEmail(to, `🔐 Suas Credenciais ACCBM — ${label}`, html);

    return NextResponse.json({ sent: result.sent, skipped: result.skipped, error: result.error });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
