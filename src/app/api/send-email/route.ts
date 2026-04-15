import { NextResponse } from 'next/server';
import {
  sendEmail,
  buildOtpHtml,
  buildResetLinkHtml,
  buildNewPasswordHtml,
  buildInscricaoHtml,
} from '@/lib/email';

export async function POST(req: Request) {
  const body = await req.json();
  const { to, tipo } = body;

  if (!to) {
    return NextResponse.json({ ok: false, error: 'Destinatário (to) obrigatório.' }, { status: 400 });
  }

  let subject = '';
  let html = '';

  if (!tipo || tipo === 'inscricao') {
    const { nome, nucleo, graduacao } = body;
    const tmpl = buildInscricaoHtml(nome || '', nucleo || '', graduacao || '');
    subject = tmpl.subject;
    html = tmpl.html;
  } else if (tipo === 'recuperacao') {
    const { nome, otp } = body;
    const tmpl = buildOtpHtml(nome || 'Aluno', otp || '');
    subject = tmpl.subject;
    html = tmpl.html;
  } else if (tipo === 'reset-link') {
    const { nome, resetUrl } = body;
    const tmpl = buildResetLinkHtml(nome || 'Responsável', resetUrl || '');
    subject = tmpl.subject;
    html = tmpl.html;
  } else if (tipo === 'nova-senha') {
    const { nome, novaSenha, loginUrl } = body;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const tmpl = buildNewPasswordHtml(nome || 'Aluno', novaSenha || '', loginUrl || `${baseUrl}/aluno`);
    subject = tmpl.subject;
    html = tmpl.html;
  } else {
    return NextResponse.json({ ok: false, error: 'Tipo de e-mail desconhecido.' }, { status: 400 });
  }

  const result = await sendEmail(to, subject, html);

  if (result.skipped) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (!result.sent) {
    return NextResponse.json({ ok: false, error: result.error || 'Falha ao enviar e-mail.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
