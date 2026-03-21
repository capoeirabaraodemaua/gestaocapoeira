import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const AUTH_KEY = 'config/aluno-auth.json';

type AlunoAccount = {
  student_id: string;
  username: string; // can be email or custom username
  email?: string;
  password_hash: string; // sha256 of password
  salt: string;
  active: boolean;
  pending_otp?: string; // WhatsApp OTP if pending
  otp_expires?: string;
  phone?: string;
  created_at: string;
  last_login?: string;
};

function hashPassword(password: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function loadAuthMap(): Promise<Record<string, AlunoAccount>> {
  try {
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(AUTH_KEY, 30);
    if (!urlData?.signedUrl) return {};
    const res = await fetch(urlData.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function saveAuthMap(map: Record<string, AlunoAccount>): Promise<void> {
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload(AUTH_KEY, blob, { upsert: true });
}

// POST /api/aluno/auth
// Actions: login, register, verify-otp, forgot-password, reset-password, change-password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) {
        return NextResponse.json({ error: 'Usuário e senha obrigatórios.' }, { status: 400 });
      }

      const authMap = await loadAuthMap();
      // Find by username or email
      const account = Object.values(authMap).find(
        a => a.username.toLowerCase() === username.toLowerCase() ||
             (a.email && a.email.toLowerCase() === username.toLowerCase())
      );

      if (!account) {
        return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
      }

      if (!account.active) {
        return NextResponse.json({
          error: 'Conta pendente de ativação. Verifique o código enviado no WhatsApp.',
          pending: true,
          phone: account.phone,
          student_id: account.student_id,
        }, { status: 403 });
      }

      const hash = hashPassword(password, account.salt);
      if (hash !== account.password_hash) {
        return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
      }

      // Update last_login
      authMap[account.student_id] = { ...account, last_login: new Date().toISOString() };
      await saveAuthMap(authMap);

      // Get student data (minimal, for session)
      const { data: student } = await supabaseAdmin
        .from('students')
        .select('id, nome_completo, nucleo, graduacao, tipo_graduacao, foto_url, apelido, nome_social')
        .eq('id', account.student_id)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        student_id: account.student_id,
        username: account.username,
        student,
      });
    }

    if (action === 'register') {
      const { student_id, username, email, password, phone } = body;
      if (!student_id || !username || !password) {
        return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
      }

      // Check student exists
      const { data: student } = await supabaseAdmin
        .from('students')
        .select('id, nome_completo, telefone, email')
        .eq('id', student_id)
        .maybeSingle();
      if (!student) {
        return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
      }

      const authMap = await loadAuthMap();

      // Check username/email not taken
      const taken = Object.values(authMap).find(
        a => a.username.toLowerCase() === username.toLowerCase() ||
             (email && a.email && a.email.toLowerCase() === email.toLowerCase())
      );
      if (taken) {
        return NextResponse.json({ error: 'Usuário ou e-mail já em uso.' }, { status: 409 });
      }
      if (authMap[student_id]) {
        return NextResponse.json({ error: 'Este aluno já possui uma conta.' }, { status: 409 });
      }

      const salt = generateSalt();
      const password_hash = hashPassword(password, salt);
      const otp = generateOTP();
      const phone_to_use = phone || student.telefone || '';

      const account: AlunoAccount = {
        student_id,
        username,
        email: email || student.email || '',
        password_hash,
        salt,
        active: false, // pending OTP
        pending_otp: otp,
        otp_expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
        phone: phone_to_use,
        created_at: new Date().toISOString(),
      };

      authMap[student_id] = account;
      await saveAuthMap(authMap);

      // Send OTP via WhatsApp if phone available
      if (phone_to_use) {
        await sendWhatsAppOTP(phone_to_use, otp, student.nome_completo);
      }

      return NextResponse.json({
        success: true,
        pending_otp: true,
        phone: phone_to_use,
        student_id,
        // Return OTP in dev mode only
        ...(process.env.NODE_ENV === 'development' ? { otp } : {}),
      });
    }

    if (action === 'verify-otp') {
      const { student_id, otp } = body;
      const authMap = await loadAuthMap();
      const account = authMap[student_id];

      if (!account) {
        return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });
      }
      if (account.active) {
        return NextResponse.json({ success: true, message: 'Conta já ativada.' });
      }
      if (!account.pending_otp || account.pending_otp !== otp) {
        return NextResponse.json({ error: 'Código inválido.' }, { status: 400 });
      }
      if (account.otp_expires && new Date(account.otp_expires) < new Date()) {
        return NextResponse.json({ error: 'Código expirado. Solicite um novo.' }, { status: 400 });
      }

      authMap[student_id] = {
        ...account,
        active: true,
        pending_otp: undefined,
        otp_expires: undefined,
      };
      await saveAuthMap(authMap);

      return NextResponse.json({ success: true });
    }

    if (action === 'resend-otp') {
      const { student_id } = body;
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });
      if (account.active) return NextResponse.json({ error: 'Conta já ativada.' }, { status: 400 });

      const otp = generateOTP();
      authMap[student_id] = {
        ...account,
        pending_otp: otp,
        otp_expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
      await saveAuthMap(authMap);

      if (account.phone) {
        const { data: student } = await supabaseAdmin
          .from('students').select('nome_completo').eq('id', student_id).maybeSingle();
        await sendWhatsAppOTP(account.phone, otp, student?.nome_completo || 'Aluno');
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'forgot-password') {
      const { username_or_email } = body;
      const authMap = await loadAuthMap();
      const account = Object.values(authMap).find(
        a => a.username.toLowerCase() === (username_or_email || '').toLowerCase() ||
             (a.email && a.email.toLowerCase() === (username_or_email || '').toLowerCase())
      );

      if (!account) {
        // Don't reveal if account exists
        return NextResponse.json({ success: true, message: 'Se o usuário existir, você receberá um código no WhatsApp.' });
      }

      const otp = generateOTP();
      authMap[account.student_id] = {
        ...account,
        pending_otp: otp,
        otp_expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
      await saveAuthMap(authMap);

      if (account.phone) {
        const { data: student } = await supabaseAdmin
          .from('students').select('nome_completo').eq('id', account.student_id).maybeSingle();
        await sendWhatsAppOTP(account.phone, otp, student?.nome_completo || 'Aluno', true);
      }

      return NextResponse.json({
        success: true,
        student_id: account.student_id,
        phone: account.phone ? `****${account.phone.slice(-4)}` : null,
      });
    }

    if (action === 'reset-password') {
      const { student_id, otp, new_password } = body;
      if (new_password?.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
      }
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account || account.pending_otp !== otp) {
        return NextResponse.json({ error: 'Código inválido.' }, { status: 400 });
      }
      if (account.otp_expires && new Date(account.otp_expires) < new Date()) {
        return NextResponse.json({ error: 'Código expirado.' }, { status: 400 });
      }

      const salt = generateSalt();
      authMap[student_id] = {
        ...account,
        password_hash: hashPassword(new_password, salt),
        salt,
        pending_otp: undefined,
        otp_expires: undefined,
        active: true,
      };
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true });
    }

    if (action === 'get-status') {
      const { student_id } = body;
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ has_account: false });
      return NextResponse.json({ has_account: true, active: account.active, username: account.username });
    }

    // Admin: create account for existing student (admin-initiated)
    if (action === 'admin-create') {
      const { student_id, username, password, phone } = body;
      const authMap = await loadAuthMap();

      if (authMap[student_id]) {
        return NextResponse.json({ error: 'Aluno já possui conta.' }, { status: 409 });
      }

      const taken = Object.values(authMap).find(a => a.username.toLowerCase() === username.toLowerCase());
      if (taken) return NextResponse.json({ error: 'Usuário já em uso.' }, { status: 409 });

      const salt = generateSalt();
      authMap[student_id] = {
        student_id,
        username,
        password_hash: hashPassword(password, salt),
        salt,
        active: true, // Admin-created accounts are immediately active
        phone,
        created_at: new Date().toISOString(),
      };
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true });
    }

    // Admin: reset password
    if (action === 'admin-reset-password') {
      const { student_id, new_password } = body;
      const authMap = await loadAuthMap();
      if (!authMap[student_id]) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

      const salt = generateSalt();
      authMap[student_id] = {
        ...authMap[student_id],
        password_hash: hashPassword(new_password, salt),
        salt,
      };
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('aluno/auth error:', msg);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

async function sendWhatsAppOTP(phone: string, otp: string, name: string, isReset = false): Promise<void> {
  // Clean phone number
  const digits = phone.replace(/\D/g, '');
  const fullPhone = digits.startsWith('55') ? digits : `55${digits}`;

  const message = isReset
    ? `Olá ${name}! Seu código de recuperação de senha é: *${otp}*. Válido por 15 minutos. Se não foi você, ignore esta mensagem.`
    : `Olá ${name}! Bem-vindo(a) à ACCBM! Seu código de ativação é: *${otp}*. Válido por 10 minutos. Digite este código para ativar sua conta.`;

  // Try Z-API first
  const zapiInstance = process.env.ZAPI_INSTANCE_ID;
  const zapiToken = process.env.ZAPI_TOKEN;
  const zapiClientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (zapiInstance && zapiToken) {
    try {
      await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(zapiClientToken ? { 'Client-Token': zapiClientToken } : {}),
        },
        body: JSON.stringify({ phone: fullPhone, message }),
      });
      return;
    } catch { /* fallthrough */ }
  }

  // Fallback: Twilio WhatsApp
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const params = new URLSearchParams({
        From: `whatsapp:${twilioFrom}`,
        To: `whatsapp:+${fullPhone}`,
        Body: message,
      });
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });
    } catch { /* silent fail */ }
  }
}
