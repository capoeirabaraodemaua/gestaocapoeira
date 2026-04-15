import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendEmail, buildOtpHtml } from '@/lib/email';

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
  needs_password_reset?: boolean; // true when account was reconstructed with temp password
  _note?: string;
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
        needs_password_reset: account.needs_password_reset === true,
      });
    }

    if (action === 'register') {
      // Support both student_id (legacy) and cpf/documento (self-registration)
      let { student_id, username, email, password, phone, cpf_or_doc } = body;

      // ── Validate required fields ──────────────────────────────────────────
      if (!username || !password) {
        return NextResponse.json({ error: 'Usuário e senha são obrigatórios.' }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
      }
      // Email is required
      if (!email || !email.trim()) {
        return NextResponse.json({ error: 'E-mail é obrigatório.' }, { status: 400 });
      }
      const emailNorm = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailNorm)) {
        return NextResponse.json({ error: 'Formato de e-mail inválido.' }, { status: 400 });
      }

      // ── CPF format validation helper ──────────────────────────────────────
      function isValidCPF(cpf: string): boolean {
        const d = cpf.replace(/\D/g, '');
        if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
        let sum = 0;
        for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
        let r = (sum * 10) % 11;
        if (r === 10 || r === 11) r = 0;
        if (r !== parseInt(d[9])) return false;
        sum = 0;
        for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
        r = (sum * 10) % 11;
        if (r === 10 || r === 11) r = 0;
        return r === parseInt(d[10]);
      }

      // ── Look up student — by cpf_or_doc or student_id ────────────────────
      let student: { id: string; nome_completo: string; telefone?: string | null; email?: string | null } | null = null;

      if (cpf_or_doc) {
        const inputDigits = (cpf_or_doc as string).replace(/\D/g, '');
        const inputRaw = (cpf_or_doc as string).replace(/\s/g, '').toLowerCase();

        // If looks like CPF (11 digits), validate checksum
        if (inputDigits.length === 11 && !isValidCPF(inputDigits)) {
          return NextResponse.json({ error: 'CPF inválido. Verifique os dígitos informados.' }, { status: 400 });
        }

        const { data: allStudents } = await supabaseAdmin
          .from('students')
          .select('id, nome_completo, telefone, email, cpf, identidade');

        const found = (allStudents || []).find(s => {
          const storedCpf = (s.cpf || '').replace(/\D/g, '');
          const storedIdDigits = (s.identidade || '').replace(/\D/g, '').toLowerCase();
          const storedIdRaw = (s.identidade || '').replace(/\s/g, '').toLowerCase();
          if (inputDigits.length >= 11 && storedCpf === inputDigits) return true;
          if (inputRaw && (storedIdRaw === inputRaw || (storedIdDigits && storedIdDigits === inputDigits))) return true;
          return false;
        });
        if (!found) {
          return NextResponse.json({
            error: 'Nenhum aluno encontrado com esse CPF/documento. Verifique se seu cadastro foi realizado pela associação.',
            hint: 'nome', // hint to frontend to try name-based search
          }, { status: 404 });
        }
        student = found;
        student_id = found.id;
      } else {
        if (!student_id) {
          return NextResponse.json({ error: 'Informe seu CPF, número do documento ou o ID fornecido pelo administrador.' }, { status: 400 });
        }
        const { data: s } = await supabaseAdmin
          .from('students')
          .select('id, nome_completo, telefone, email')
          .eq('id', student_id)
          .maybeSingle();
        if (!s) {
          return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
        }
        student = s;
      }

      if (!student) {
        return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
      }

      const authMap = await loadAuthMap();

      // ── Duplicate checks ──────────────────────────────────────────────────
      if (authMap[student_id]) {
        const existing = authMap[student_id];
        if (existing.active) {
          // Active account: check if the phone in students table differs from stored phone.
          // If admin corrected the phone, we need to detect it and invalidate the old validation.
          const { data: freshStudent } = await supabaseAdmin
            .from('students').select('telefone').eq('id', student_id).maybeSingle();
          const freshPhoneDigits = ((freshStudent?.telefone || '').replace(/\D/g, ''));
          const freshPhoneNorm = freshPhoneDigits ? (freshPhoneDigits.startsWith('55') ? freshPhoneDigits : `55${freshPhoneDigits}`) : '';
          const storedPhoneDigits = (existing.phone || '').replace(/\D/g, '');
          const phoneWasCorrected = freshPhoneNorm && storedPhoneDigits && freshPhoneNorm !== storedPhoneDigits;

          if (phoneWasCorrected) {
            // Admin corrected the phone — reset validation status so student can re-register
            authMap[student_id] = { ...existing, active: false, phone: freshPhoneNorm, pending_otp: undefined, otp_expires: undefined };
            await saveAuthMap(authMap);
            // Fall through — will proceed to overwrite with new registration below
          } else {
            return NextResponse.json({ error: 'Este aluno já possui uma conta. Use a opção de recuperar senha caso tenha esquecido o acesso.' }, { status: 409 });
          }
        }
        // Inactive account (pending OTP): allow overwrite so student can re-register with corrected phone/data
        // (fall through — will overwrite the pending account below)
      }

      // Username taken?
      const usernameTaken = Object.values(authMap).find(
        a => a.username.toLowerCase() === username.trim().toLowerCase()
      );
      if (usernameTaken) {
        return NextResponse.json({ error: 'Este nome de usuário já está em uso. Escolha outro.' }, { status: 409 });
      }

      // Email taken?
      const emailTaken = Object.values(authMap).find(
        a => a.email && a.email.toLowerCase() === emailNorm
      );
      if (emailTaken) {
        return NextResponse.json({ error: 'Este e-mail já está vinculado a outra conta.' }, { status: 409 });
      }

      // ── Normalize phone ───────────────────────────────────────────────────
      const rawPhone = (phone || student.telefone || '').replace(/\D/g, '');
      const phone_to_use = rawPhone ? (rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`) : '';

      const salt = generateSalt();
      const password_hash = hashPassword(password, salt);
      const otp = generateOTP();
      const finalEmail = emailNorm || student.email || '';

      const account: AlunoAccount = {
        student_id,
        username: username.trim().toLowerCase(),
        email: finalEmail,
        password_hash,
        salt,
        active: true, // activate immediately — no OTP required
        phone: phone_to_use,
        created_at: new Date().toISOString(),
      };

      authMap[student_id] = account;
      await saveAuthMap(authMap);

      // ── Sync email to students table ──────────────────────────────────────
      if (finalEmail) {
        try {
          await supabaseAdmin.from('students').update({ email: finalEmail }).eq('id', student_id);
        } catch { /* column may not exist yet — silent fail */ }
      }

      return NextResponse.json({
        success: true,
        student_id,
        student_name: student.nome_completo.split(' ')[0],
      });
    }

    // ── REGISTER BY NAME (fallback when CPF not in DB) ────────────────────────
    if (action === 'register-by-name') {
      const { nome_completo, email, password } = body;
      if (!nome_completo || !email || !password) {
        return NextResponse.json({ error: 'Nome, e-mail e senha são obrigatórios.' }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
      }
      const emailNorm = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailNorm)) {
        return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });
      }

      // Normalize name for matching
      const normalizeName = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      const normInput = normalizeName(nome_completo);

      const { data: allStudents } = await supabaseAdmin
        .from('students')
        .select('id, nome_completo, telefone, email, cpf');

      const found = (allStudents || []).find(s =>
        normalizeName(s.nome_completo || '') === normInput
      );
      if (!found) {
        return NextResponse.json({
          error: 'Nome não encontrado no banco da associação. Verifique se seu nome está exatamente como foi cadastrado.',
          candidates: (allStudents || [])
            .filter(s => normalizeName(s.nome_completo || '').includes(normInput.split(' ')[0]))
            .slice(0, 5)
            .map(s => s.nome_completo),
        }, { status: 404 });
      }

      const authMap = await loadAuthMap();
      if (authMap[found.id]) {
        const existingByName = authMap[found.id];
        // Allow re-registration only if account is inactive (pending OTP) — phone may have been corrected
        if (existingByName.active) {
          return NextResponse.json({ error: 'Este aluno já possui uma conta. Use recuperar senha.' }, { status: 409 });
        }
        // Inactive: fall through to overwrite
      }
      const emailTaken = Object.values(authMap).find(a => a.email && a.email.toLowerCase() === emailNorm);
      if (emailTaken) {
        return NextResponse.json({ error: 'Este e-mail já está vinculado a outra conta.' }, { status: 409 });
      }

      const salt = generateSalt();
      const password_hash = hashPassword(password, salt);
      const account: AlunoAccount = {
        student_id: found.id,
        username: emailNorm,
        email: emailNorm,
        password_hash,
        salt,
        active: true, // auto-activate — no WhatsApp required
        created_at: new Date().toISOString(),
      };
      authMap[found.id] = account;
      await saveAuthMap(authMap);

      // Sync email to students table
      try { await supabaseAdmin.from('students').update({ email: emailNorm }).eq('id', found.id); } catch { /* silent */ }

      const { data: student } = await supabaseAdmin
        .from('students').select('id, nome_completo, nucleo, graduacao, tipo_graduacao, foto_url, apelido, nome_social')
        .eq('id', found.id).maybeSingle();

      return NextResponse.json({ success: true, student_id: found.id, username: emailNorm, student, student_name: found.nome_completo.split(' ')[0] });
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

      // Always fetch latest phone from students table — admin may have corrected it
      const { data: studentRecord } = await supabaseAdmin
        .from('students').select('nome_completo, telefone').eq('id', student_id).maybeSingle();

      const latestPhoneRaw = (studentRecord?.telefone || account.phone || '').replace(/\D/g, '');
      const latestPhone = latestPhoneRaw ? (latestPhoneRaw.startsWith('55') ? latestPhoneRaw : `55${latestPhoneRaw}`) : '';

      const otp = generateOTP();
      authMap[student_id] = {
        ...account,
        phone: latestPhone || account.phone, // update stored phone to latest
        pending_otp: otp,
        otp_expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
      await saveAuthMap(authMap);

      let sent = false;
      if (latestPhone) {
        sent = await sendWhatsAppOTP(latestPhone, otp, studentRecord?.nome_completo || 'Aluno');
      }

      return NextResponse.json({
        success: true,
        phone: latestPhone ? `****${latestPhone.slice(-4)}` : null,
        sent,
      });
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
        return NextResponse.json({ success: true, message: 'Se o usuário existir, você pode redefinir a senha.' });
      }

      // Return student_id directly — no OTP required, just allow password reset
      return NextResponse.json({
        success: true,
        student_id: account.student_id,
      });
    }

    if (action === 'reset-password') {
      const { student_id, new_password } = body;
      if (!new_password || new_password.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
      }
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) {
        return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });
      }

      const salt = generateSalt();
      authMap[student_id] = {
        ...account,
        password_hash: hashPassword(new_password, salt),
        salt,
        pending_otp: undefined,
        otp_expires: undefined,
        active: true,
        needs_password_reset: undefined,
        _note: undefined,
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

    // Admin: create account with auto-generated username from student name + sequential ID
    if (action === 'admin-create-auto') {
      // Accept student data directly from caller to avoid internal HTTP fetches
      const {
        student_id,
        password,
        phone: phoneArg,
        nucleo_filter,
        email: emailOverride,
        nome_completo: nomeArg,
        nucleo: nucleoArg,
        telefone: telefoneArg,
      } = body;

      if (!student_id) {
        return NextResponse.json({ error: 'student_id é obrigatório.' }, { status: 400 });
      }

      const authMap = await loadAuthMap();

      if (authMap[student_id]) {
        return NextResponse.json({ error: 'Aluno já possui conta.', existing: { username: authMap[student_id].username } }, { status: 409 });
      }

      // Try to get student info from Supabase, fall back to provided data
      let studentName: string = nomeArg || '';
      let studentPhone: string = telefoneArg || phoneArg || '';
      let studentEmail: string = emailOverride || '';
      let studentNucleo: string = nucleoArg || '';

      try {
        const { data: dbStudent } = await supabaseAdmin
          .from('students')
          .select('id, nome_completo, telefone, email, nucleo')
          .eq('id', student_id)
          .maybeSingle();
        if (dbStudent) {
          studentName = dbStudent.nome_completo || studentName;
          studentPhone = phoneArg || dbStudent.telefone || studentPhone;
          studentEmail = emailOverride || dbStudent.email || studentEmail;
          studentNucleo = dbStudent.nucleo || studentNucleo;
        }
      } catch { /* use provided data */ }

      // Require at least a name
      if (!studentName) {
        return NextResponse.json({ error: 'Aluno não encontrado. Forneça nome_completo no corpo da requisição.' }, { status: 404 });
      }

      // Security: if nucleo_filter provided, check student belongs to that nucleo
      if (nucleo_filter && studentNucleo && studentNucleo !== nucleo_filter) {
        return NextResponse.json({ error: 'Aluno não pertence a este núcleo.' }, { status: 403 });
      }

      // Assign sequential display ID directly (no internal HTTP fetch)
      let displayId = `ACCBM-${String(Date.now()).slice(-4)}`;
      try {
        const [idMap, counterRaw] = await Promise.all([
          (async () => {
            const { data: u } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl('config/aluno-id-map.json', 30);
            if (!u?.signedUrl) return {} as Record<string, string>;
            const r = await fetch(u.signedUrl, { cache: 'no-store' });
            return r.ok ? (await r.json() as Record<string, string>) : {} as Record<string, string>;
          })(),
          (async () => {
            const { data: u } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl('config/aluno-id-counter.json', 30);
            if (!u?.signedUrl) return { last_id: 0 };
            const r = await fetch(u.signedUrl, { cache: 'no-store' });
            return r.ok ? await r.json() : { last_id: 0 };
          })(),
        ]);

        if (idMap[student_id]) {
          displayId = idMap[student_id];
        } else {
          const nextId = ((counterRaw as { last_id?: number }).last_id || 0) + 1;
          displayId = `ACCBM-${String(nextId).padStart(4, '0')}`;
          idMap[student_id] = displayId;
          // Save both map and counter
          await Promise.all([
            supabaseAdmin.storage.from(BUCKET).upload('config/aluno-id-map.json', new Blob([JSON.stringify(idMap, null, 2)], { type: 'application/json' }), { upsert: true }),
            supabaseAdmin.storage.from(BUCKET).upload('config/aluno-id-counter.json', new Blob([JSON.stringify({ last_id: nextId })], { type: 'application/json' }), { upsert: true }),
          ]);
        }
      } catch { /* keep fallback displayId */ }

      // Auto-generate username from first name + display ID number
      function slugify(s: string) {
        return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
      }
      const firstName = studentName.split(' ')[0];
      const idNum = displayId.replace('ACCBM-', '');
      let username = `${slugify(firstName)}${idNum}`;
      // Ensure uniqueness
      let suffix = 0;
      while (Object.values(authMap).some(a => a.username.toLowerCase() === username.toLowerCase())) {
        suffix++;
        username = `${slugify(firstName)}${idNum}${suffix}`;
      }

      const salt = generateSalt();
      authMap[student_id] = {
        student_id,
        username,
        email: studentEmail,
        password_hash: hashPassword(password, salt),
        salt,
        active: true,
        phone: studentPhone,
        created_at: new Date().toISOString(),
      };
      await saveAuthMap(authMap);

      // Send welcome message via WhatsApp
      if (studentPhone) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://accbm.vercel.app';
        const welcomeMsg = `Olá, *${studentName.split(' ')[0]}*! 👋\n\nSua conta foi criada com sucesso! Já liberamos seu acesso à área do aluno ✅\n\nAgora você pode entrar na plataforma, registrar sua presença e utilizar todas as funcionalidades disponíveis.\n\n🔗 *${appUrl}/aluno*\n\n👤 Usuário: *${username}*\n🔑 Senha: *${password}*\n\nSeja bem-vindo(a) e bons treinos! 💪🔥\n\n_Associação Cultural de Capoeira Barão de Mauá_`;
        void sendWhatsAppMessage(studentPhone, welcomeMsg);
      }

      return NextResponse.json({ success: true, username, display_id: displayId, phone: studentPhone, email: studentEmail });
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

    // ── Update profile (email, username) — requires session token (student_id)
    if (action === 'update-profile') {
      const { student_id, new_email, new_username, current_password } = body;
      if (!student_id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

      // Verify current password
      if (!current_password || hashPassword(current_password, account.salt) !== account.password_hash) {
        return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 403 });
      }

      // Check username uniqueness if changing
      if (new_username && new_username !== account.username) {
        const taken = Object.values(authMap).find(
          a => a.student_id !== student_id && a.username.toLowerCase() === new_username.toLowerCase()
        );
        if (taken) return NextResponse.json({ error: 'Usuário já em uso.' }, { status: 409 });
        account.username = new_username;
      }

      // Update email
      if (new_email !== undefined) {
        account.email = new_email || '';
        // Also save to Supabase students table
        try {
          await supabaseAdmin.from('students').update({ email: new_email || null }).eq('id', student_id);
        } catch { /* column may not exist yet */ }
      }

      authMap[student_id] = account;
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true, username: account.username, email: account.email });
    }

    // ── Change password — requires current password verification
    if (action === 'change-password') {
      const { student_id, current_password, new_password } = body;
      if (!student_id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

      if (!current_password || hashPassword(current_password, account.salt) !== account.password_hash) {
        return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 403 });
      }
      if (!new_password || new_password.length < 6) {
        return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
      }

      const salt = generateSalt();
      authMap[student_id] = {
        ...account,
        password_hash: hashPassword(new_password, salt),
        salt,
        needs_password_reset: undefined,
        _note: undefined,
      };
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true });
    }

    // ── Delete account — removes login credentials (student record kept for history)
    if (action === 'delete-account') {
      const { student_id, current_password } = body;
      if (!student_id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

      if (!current_password || hashPassword(current_password, account.salt) !== account.password_hash) {
        return NextResponse.json({ error: 'Senha incorreta. Não é possível excluir.' }, { status: 403 });
      }

      delete authMap[student_id];
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true });
    }

    // ── Admin: edit account (username, email, phone) — no password required
    if (action === 'admin-edit-account') {
      const { student_id, new_username, new_email, new_phone } = body;
      if (!student_id) return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

      // Check username uniqueness if changing
      if (new_username && new_username.trim() !== account.username) {
        const taken = Object.values(authMap).find(
          a => a.student_id !== student_id && a.username.toLowerCase() === new_username.trim().toLowerCase()
        );
        if (taken) return NextResponse.json({ error: 'Nome de usuário já está em uso por outra conta.' }, { status: 409 });
        account.username = new_username.trim();
      }

      if (new_email !== undefined) {
        account.email = new_email || '';
        try { await supabaseAdmin.from('students').update({ email: new_email || null }).eq('id', student_id); } catch { /* column may not exist */ }
      }

      let otpSentToNewPhone = false;
      if (new_phone !== undefined) {
        const oldPhone = account.phone || '';
        const newPhoneDigits = (new_phone || '').replace(/\D/g, '');
        const newPhoneNorm = newPhoneDigits ? (newPhoneDigits.startsWith('55') ? newPhoneDigits : `55${newPhoneDigits}`) : '';
        const phoneChanged = newPhoneNorm !== oldPhone.replace(/\D/g, '');

        account.phone = newPhoneNorm;

        // When phone changes: always update students table and generate new OTP
        if (phoneChanged && newPhoneNorm) {
          // Also update students table phone
          try { await supabaseAdmin.from('students').update({ telefone: new_phone }).eq('id', student_id); } catch { /* silent */ }

          if (!account.active) {
            // Inactive account: generate new OTP for new number
            const newOtp = generateOTP();
            account.pending_otp = newOtp;
            account.otp_expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            const { data: st } = await supabaseAdmin.from('students').select('nome_completo').eq('id', student_id).maybeSingle();
            otpSentToNewPhone = await sendWhatsAppOTP(newPhoneNorm, newOtp, st?.nome_completo || 'Aluno');
          }
          // Active account: just update phone — no re-validation needed (account already active)
        }
      }

      authMap[student_id] = account;
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true, username: account.username, email: account.email, phone: account.phone, otp_resent: otpSentToNewPhone });
    }

    // ── Admin: reset phone validation — deactivates account so student can re-register with corrected phone
    if (action === 'admin-reset-phone-validation') {
      const { student_id } = body;
      if (!student_id) return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

      // Fetch latest phone from students table
      const { data: st } = await supabaseAdmin.from('students').select('nome_completo, telefone').eq('id', student_id).maybeSingle();
      const latestPhoneRaw = ((st?.telefone || account.phone || '').replace(/\D/g, ''));
      const latestPhone = latestPhoneRaw ? (latestPhoneRaw.startsWith('55') ? latestPhoneRaw : `55${latestPhoneRaw}`) : '';

      const newOtp = generateOTP();
      authMap[student_id] = {
        ...account,
        active: false,
        phone: latestPhone || account.phone,
        pending_otp: newOtp,
        otp_expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
      await saveAuthMap(authMap);

      let sent = false;
      if (latestPhone) {
        sent = await sendWhatsAppOTP(latestPhone, newOtp, st?.nome_completo || 'Aluno');
      }

      return NextResponse.json({
        success: true,
        phone: latestPhone ? `****${latestPhone.slice(-4)}` : null,
        otp_sent: sent,
        message: 'Validação resetada. Novo código enviado para o telefone atualizado.',
      });
    }

    // ── Admin: activate account — sets active: true for pending accounts
    if (action === 'admin-activate-account') {
      const { student_id } = body;
      if (!student_id) return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
      const authMap = await loadAuthMap();
      const account = authMap[student_id];
      if (!account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });
      if (account.active) return NextResponse.json({ success: true, message: 'Conta já está ativa.' });

      authMap[student_id] = {
        ...account,
        active: true,
        pending_otp: undefined,
        otp_expires: undefined,
      };
      await saveAuthMap(authMap);
      return NextResponse.json({ success: true });
    }

    // ── Admin: delete account — no password required (admin privilege)
    if (action === 'admin-delete-account') {
      const { student_id } = body;
      if (!student_id) return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
      const authMap = await loadAuthMap();
      if (!authMap[student_id]) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });
      delete authMap[student_id];
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

async function sendEmailOTP(email: string, otp: string, name: string): Promise<void> {
  try {
    const { subject, html } = buildOtpHtml(name, otp);
    await sendEmail(email, subject, html);
  } catch { /* silent fail */ }
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const digits = phone.replace(/\D/g, '');
  const fullPhone = digits.startsWith('55') ? digits : `55${digits}`;
  const zapiInstance = process.env.ZAPI_INSTANCE_ID;
  const zapiToken = process.env.ZAPI_TOKEN;
  const zapiClientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (zapiInstance && zapiToken) {
    try {
      await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(zapiClientToken ? { 'Client-Token': zapiClientToken } : {}) },
        body: JSON.stringify({ phone: fullPhone, message }),
      });
      return;
    } catch { /* fallthrough */ }
  }
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const params = new URLSearchParams({ From: `whatsapp:${twilioFrom}`, To: `whatsapp:+${fullPhone}`, Body: message });
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
    } catch { /* silent fail */ }
  }
}

async function sendWhatsAppOTP(phone: string, otp: string, name: string, isReset = false): Promise<boolean> {
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
      return true;
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
      return true;
    } catch { /* silent fail */ }
  }

  // No credentials configured — nothing was sent
  return false;
}
