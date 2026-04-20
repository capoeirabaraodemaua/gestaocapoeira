import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invalidateEmailConfigCache, sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET = 'photos';
const CONFIG_KEY = 'config/email-config.json';

export type EmailConfig = {
  provider: 'resend' | 'smtp' | '';
  resend_api_key?: string;
  resend_from?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
  updated_at?: string;
};

async function loadConfig(): Promise<EmailConfig> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CONFIG_KEY, 30);
    if (!data?.signedUrl) return { provider: '' };
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return { provider: '' };
    return await res.json();
  } catch { return { provider: '' }; }
}

async function saveConfig(cfg: EmailConfig): Promise<void> {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(CONFIG_KEY, blob, { upsert: true });
}

// GET — retorna config (mascara senhas)
export async function GET() {
  const cfg = await loadConfig();
  return NextResponse.json({
    ...cfg,
    resend_api_key: cfg.resend_api_key ? '***' + cfg.resend_api_key.slice(-6) : '',
    smtp_pass: cfg.smtp_pass ? '••••••••' : '',
    has_resend: !!(cfg.provider === 'resend' && cfg.resend_api_key),
    has_smtp: !!(cfg.provider === 'smtp' && cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass),
  });
}

// POST — salva config
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { provider, resend_api_key, resend_from, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from } = body;

    const current = await loadConfig();

    const updated: EmailConfig = {
      provider: provider || current.provider,
      resend_api_key: resend_api_key && resend_api_key !== '***' + (current.resend_api_key || '').slice(-6)
        ? resend_api_key
        : current.resend_api_key || '',
      resend_from: resend_from || current.resend_from || 'Sistema DEMO <noreply@demo.com>',
      smtp_host: smtp_host !== undefined ? smtp_host : current.smtp_host || '',
      smtp_port: smtp_port !== undefined ? smtp_port : current.smtp_port || '587',
      smtp_user: smtp_user !== undefined ? smtp_user : current.smtp_user || '',
      smtp_pass: smtp_pass && smtp_pass !== '••••••••'
        ? smtp_pass
        : current.smtp_pass || '',
      smtp_from: smtp_from !== undefined ? smtp_from : current.smtp_from || '',
      updated_at: new Date().toISOString(),
    };

    await saveConfig(updated);
    invalidateEmailConfigCache();

    // Se o corpo tiver test_to, envia um e-mail de teste após salvar
    if (body.test_to) {
      const result = await sendEmail(
        body.test_to,
        '✅ Teste de configuração de e-mail — Sistema DEMO',
        `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:32px;background:#f1f5f9"><div style="max-width:480px;margin:auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(0,0,0,0.1)"><h2 style="color:#1d4ed8">✅ E-mail de teste Sistema DEMO</h2><p>Parabéns! As configurações de e-mail estão funcionando corretamente.</p><p style="color:#64748b;font-size:0.85rem">Este e-mail foi enviado automaticamente pelo painel Sistema DEMO para verificar a configuração.</p></div></body></html>`
      );
      return NextResponse.json({ ok: true, test: result });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// DELETE — limpa config
export async function DELETE() {
  await saveConfig({ provider: '' });
  invalidateEmailConfigCache();
  return NextResponse.json({ ok: true });
}
