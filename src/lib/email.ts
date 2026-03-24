/**
 * Serviço de envio de email centralizado — ACCBM
 * Prioridade: env vars → config/email-config.json (Storage) → skip
 */

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

export type EmailResult = {
  sent: boolean;
  skipped?: boolean;
  error?: string;
};

type EmailConfig = {
  provider?: 'resend' | 'smtp' | '';
  resend_api_key?: string;
  resend_from?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
};

// Cache simples (evita buscar Storage a cada e-mail)
let _configCache: EmailConfig | null = null;
let _configCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getStorageConfig(): Promise<EmailConfig> {
  if (_configCache && Date.now() - _configCacheAt < CACHE_TTL) return _configCache;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase.storage.from('photos').createSignedUrl('config/email-config.json', 60);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    const cfg = await res.json() as EmailConfig;
    _configCache = cfg;
    _configCacheAt = Date.now();
    return cfg;
  } catch { return {}; }
}

// ─── Templates HTML ───────────────────────────────────────────────────────────

function baseLayout(content: string, color = '#1d4ed8') {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">
    <div style="background:linear-gradient(135deg,${color},${color}bb);padding:28px 32px;text-align:center">
      <div style="font-size:1.5rem;font-weight:900;color:#fff;letter-spacing:-0.5px">ACCBM</div>
      <div style="color:rgba(255,255,255,0.8);font-size:0.82rem;margin-top:4px">Associação Cultural de Capoeira Barão de Mauá</div>
    </div>
    <div style="padding:32px">${content}</div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:0.75rem">ACCBM · Associação Cultural de Capoeira Barão de Mauá</p>
    </div>
  </div></body></html>`;
}

export function buildOtpHtml(nome: string, otp: string): { subject: string; html: string } {
  const subject = '🔑 Código de recuperação de senha — ACCBM';
  const html = baseLayout(`
    <p style="color:#374151;font-size:1rem">Olá, <strong>${nome}</strong>!</p>
    <p style="color:#64748b;margin:0 0 24px">Você solicitou a recuperação da sua senha de acesso à <strong>Área do Aluno</strong>. Use o código abaixo:</p>
    <div style="background:#eff6ff;border:2px solid #bfdbfe;border-radius:14px;padding:28px;text-align:center;margin:0 0 24px">
      <div style="font-size:2.8rem;font-weight:900;letter-spacing:0.45em;color:#1e40af;font-family:monospace;line-height:1">${otp}</div>
      <div style="color:#64748b;font-size:0.78rem;margin-top:10px">⏱ Válido por <strong>15 minutos</strong></div>
    </div>
    <p style="color:#94a3b8;font-size:0.8rem">Se você não solicitou a recuperação de senha, ignore este e-mail. Sua senha permanece a mesma.</p>
  `, '#1d4ed8');
  return { subject, html };
}

export function buildResetLinkHtml(nome: string, resetUrl: string): { subject: string; html: string } {
  const subject = '🔐 Redefinição de senha — Painel ACCBM';
  const html = baseLayout(`
    <p style="color:#374151;font-size:1rem">Olá, <strong>${nome || 'Responsável'}</strong>!</p>
    <p style="color:#64748b;margin:0 0 24px">Recebemos uma solicitação para redefinir a senha do seu acesso ao <strong>Painel de Núcleo ACCBM</strong>.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">🔐 Redefinir minha senha</a>
    </div>
    <p style="color:#64748b;font-size:0.82rem;text-align:center">Este link expira em <strong>30 minutos</strong>.</p>
    <p style="color:#94a3b8;font-size:0.78rem;margin-top:20px">Se você não solicitou, ignore este e-mail. Sua senha permanece a mesma.</p>
  `, '#1d4ed8');
  return { subject, html };
}

export function buildNewPasswordHtml(nome: string, novaSenha: string, loginUrl: string): { subject: string; html: string } {
  const subject = '🔑 Nova senha provisória — ACCBM';
  const html = baseLayout(`
    <p style="color:#374151;font-size:1rem">Olá, <strong>${nome}</strong>!</p>
    <p style="color:#64748b;margin:0 0 20px">O administrador redefiniu sua senha de acesso à <strong>Área do Aluno</strong>. Use a senha abaixo para entrar:</p>
    <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:14px;padding:24px;text-align:center;margin:0 0 24px">
      <div style="font-size:1.8rem;font-weight:800;letter-spacing:0.15em;color:#166534;font-family:monospace">${novaSenha}</div>
      <div style="color:#64748b;font-size:0.78rem;margin-top:8px">Recomendamos trocar esta senha após o primeiro acesso</div>
    </div>
    <div style="text-align:center;margin:20px 0">
      <a href="${loginUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem">Acessar Área do Aluno</a>
    </div>
    <p style="color:#94a3b8;font-size:0.78rem">Se você não reconhece esta ação, entre em contato com a ACCBM imediatamente.</p>
  `, '#16a34a');
  return { subject, html };
}

export function buildInscricaoHtml(nome: string, nucleo: string, graduacao: string): { subject: string; html: string } {
  const subject = '✅ Inscrição Confirmada — Capoeira Barão de Mauá';
  const html = baseLayout(`
    <p style="color:#374151;font-size:1rem">Olá, <strong>${nome}</strong>!</p>
    <p style="color:#64748b;margin:0 0 20px">Sua inscrição foi recebida com sucesso. Aqui estão seus dados:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
      <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:0.85rem">Nome</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#111827">${nome}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:0.85rem">Núcleo</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:600;color:#111827">${nucleo || '—'}</td></tr>
      <tr><td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Graduação</td><td style="padding:10px 0;font-weight:600;color:#111827">${graduacao || '—'}</td></tr>
    </table>
    <p style="color:#64748b;font-size:0.88rem">Bem-vindo(a) à família Barão de Mauá! Em breve entraremos em contato. <strong>Axé! 🥋</strong></p>
  `, '#dc2626');
  return { subject, html };
}

// ─── Envio ────────────────────────────────────────────────────────────────────

async function sendViaResend(to: string, subject: string, html: string, apiKey: string, from: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[email/resend] error:', err);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email/resend] exception:', e);
    return false;
  }
}

async function sendViaSmtp(to: string, subject: string, html: string, host: string, port: string, user: string, pass: string, from: string): Promise<boolean> {
  try {
    const portNum = parseInt(port || '587');
    const secure = portNum === 465;
    const transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({ from: from || user, to, subject, html });
    return true;
  } catch (e) {
    console.error('[email/smtp] exception:', e);
    return false;
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  // 1. Tenta via env vars (prioridade máxima — Vercel/CI)
  const envResendKey = process.env.RESEND_API_KEY;
  if (envResendKey) {
    const from = process.env.RESEND_FROM || 'ACCBM <noreply@accbm.com.br>';
    const ok = await sendViaResend(to, subject, html, envResendKey, from);
    if (ok) return { sent: true };
    return { sent: false, error: 'Resend (env) configurado mas falhou.' };
  }

  const envSmtpHost = process.env.SMTP_HOST;
  const envSmtpUser = process.env.SMTP_USER;
  const envSmtpPass = process.env.SMTP_PASS;
  if (envSmtpHost && envSmtpUser && envSmtpPass) {
    const ok = await sendViaSmtp(to, subject, html, envSmtpHost, process.env.SMTP_PORT || '587', envSmtpUser, envSmtpPass, process.env.SMTP_FROM || envSmtpUser);
    if (ok) return { sent: true };
    return { sent: false, error: 'SMTP (env) configurado mas falhou.' };
  }

  // 2. Tenta via config salva no Supabase Storage (configurada pelo admin no painel)
  const cfg = await getStorageConfig();

  if (cfg.provider === 'resend' && cfg.resend_api_key) {
    const from = cfg.resend_from || 'ACCBM <noreply@accbm.com.br>';
    const ok = await sendViaResend(to, subject, html, cfg.resend_api_key, from);
    if (ok) return { sent: true };
    return { sent: false, error: 'Resend (painel) configurado mas falhou. Verifique a chave API.' };
  }

  if (cfg.provider === 'smtp' && cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass) {
    const ok = await sendViaSmtp(to, subject, html, cfg.smtp_host, cfg.smtp_port || '587', cfg.smtp_user, cfg.smtp_pass, cfg.smtp_from || cfg.smtp_user);
    if (ok) return { sent: true };
    return { sent: false, error: 'SMTP (painel) configurado mas falhou. Verifique as credenciais.' };
  }

  // 3. Nenhum serviço configurado
  return { sent: false, skipped: true };
}

// Invalida o cache de config (chamar após salvar nova config)
export function invalidateEmailConfigCache() {
  _configCache = null;
  _configCacheAt = 0;
}
