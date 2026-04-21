import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendEmail, buildResetLinkHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET = 'photos';
const CREDS_KEY = 'config/panel-credentials.json';
const TOKENS_KEY = 'config/reset-tokens.json';

type NucleoKey = 'edson-alves' | 'ipiranga' | 'saracuruna' | 'vila-urussai' | 'jayme-fichman' | 'academia-mais-saude' | 'geral';

interface Credential {
  nucleo: NucleoKey;
  label: string;
  color: string;
  password: string;
  email?: string;
  createdBy?: string;
  nome?: string;
  first_login?: boolean; // true = deve trocar senha no primeiro acesso
}

type CredsMap = Record<string, Credential>;

interface ResetToken {
  cpf: string;
  token: string;
  expires: number; // timestamp ms
}
type TokensMap = Record<string, ResetToken>; // key = token

// Senhas padrão iniciais por núcleo: iniciais do núcleo + 12345
export const NUCLEO_DEFAULT_PASSWORDS: Record<string, string> = {
  'edson-alves':         'edsonalves12345',
  'ipiranga':            'ipiranga12345',
  'saracuruna':          'saracuruna12345',
  'vila-urussai':        'urussai12345',
  'jayme-fichman':       'jaymefichman12345',
  'academia-mais-saude': 'academiasaude12345',
};

// Senha padrão única (fallback)
export const DEFAULT_PASSWORD = '123456';

// Credenciais padrao — owner, admin geral
const DEFAULT_CREDS: CredsMap = {
  owner:                   { nucleo: 'geral',                label: 'Owner (Desenvolvedor)',      color: '#7c3aed', password: 'owner123', first_login: true },
  admin:                   { nucleo: 'geral',                label: 'Admin Geral',                color: '#1d4ed8', password: 'admin123', first_login: true },
};

// NUCLEO_PROFILES agora é carregado dinamicamente do banco de dados
export const NUCLEO_PROFILES: Record<string, { nucleo: NucleoKey; label: string; color: string }> = {};

function normalizeCpf(s: string): string {
  return s.replace(/\D/g, '');
}

function normalizeKey(s: string): string {
  const clean = s.trim().toLowerCase();
  const cpf = normalizeCpf(clean);
  if (cpf.length === 11 && /^\d{11}$/.test(cpf)) return cpf;
  return clean;
}

async function loadCreds(): Promise<CredsMap> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CREDS_KEY, 30);
    if (!data?.signedUrl) return { ...DEFAULT_CREDS };
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return { ...DEFAULT_CREDS };
    const stored = await res.json();
    return { ...DEFAULT_CREDS, ...stored };
  } catch { return { ...DEFAULT_CREDS }; }
}

async function loadResponsaveis(): Promise<Array<{ nucleo_key: string; cpf: string; cpf2?: string; nome?: string; nome2?: string; email?: string }>> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl('config/responsaveis.json', 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    const cfg = await res.json();
    return cfg.responsaveis || [];
  } catch { return []; }
}

async function cpfAutorizadoParaNucleo(cpf: string, nucleoKey: string): Promise<boolean> {
  const lista = await loadResponsaveis();
  const cpfNorm = normalizeCpf(cpf);
  return lista.some(r =>
    r.nucleo_key === nucleoKey &&
    (normalizeCpf(r.cpf || '') === cpfNorm || normalizeCpf(r.cpf2 || '') === cpfNorm)
  );
}

// Busca e-mail do responsável no módulo responsaveis.json
async function getEmailResponsavel(cpfNorm: string): Promise<string | null> {
  const lista = await loadResponsaveis();
  for (const r of lista) {
    if (normalizeCpf(r.cpf || '') === cpfNorm || normalizeCpf(r.cpf2 || '') === cpfNorm) {
      return r.email || null;
    }
  }
  return null;
}

async function saveCreds(map: CredsMap): Promise<void> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(CREDS_KEY, blob, { upsert: true });
}

async function loadTokens(): Promise<TokensMap> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(TOKENS_KEY, 30);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function saveTokens(map: TokensMap): Promise<void> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(TOKENS_KEY, blob, { upsert: true });
}

function checkPassword(stored: string, input: string): boolean {
  return stored === input;
}

function isAdminGeral(creds: CredsMap, key: string): boolean {
  return !!creds[key] && creds[key].nucleo === 'geral';
}

// Envia e-mail de redefinição de senha (Resend → SMTP fallback)
async function sendResetEmail(to: string, nome: string, resetUrl: string): Promise<boolean> {
  try {
    const { subject, html } = buildResetLinkHtml(nome, resetUrl);
    const result = await sendEmail(to, subject, html);
    return result.sent === true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  // ── LOGIN ──
  if (action === 'login') {
    const { username, password } = body;
    if (!username || !password)
      return NextResponse.json({ error: 'Usuário/CPF e senha obrigatórios.' }, { status: 400 });

    const creds = await loadCreds();
    const key = normalizeKey(username);
    const isCpfLogin = /^\d{11}$/.test(key);

    if (isCpfLogin) {
      const lista = await loadResponsaveis();
      const cpfNorm = normalizeCpf(key);
      // Coleta TODAS as entradas onde este CPF aparece (pode ser responsável de múltiplos núcleos)
      const entries = lista.filter(r =>
        normalizeCpf(r.cpf || '') === cpfNorm || normalizeCpf(r.cpf2 || '') === cpfNorm
      );
      if (!entries.length)
        return NextResponse.json({ error: 'CPF não encontrado como responsável de nenhum núcleo. Solicite o cadastro ao Admin Geral.' }, { status: 403 });

      // Determina o núcleo alvo (pode ser qualquer núcleo ao qual o CPF pertence)
      const nucleoTarget = body.nucleo_target as string | undefined;
      const nucleosByCpf = entries.map(e => e.nucleo_key);

      // Verifica que o CPF pertence ao núcleo alvo (quando especificado)
      if (nucleoTarget && !nucleosByCpf.includes(nucleoTarget))
        return NextResponse.json({ error: 'Acesso não autorizado para este núcleo.' }, { status: 403 });

      // Usa chave específica por núcleo quando nucleo_target é fornecido e válido
      // Formato: cpf_nucleokey (ex: 17515705760_jayme-fichman)
      const nucleoEfetivo = nucleoTarget || entries[0].nucleo_key;
      const credKeyNucleo = `${cpfNorm}_${nucleoEfetivo}`;
      const credKeyLegacy = cpfNorm; // chave antiga (sem sufixo de núcleo)

      // Garante existência de credencial específica por núcleo
      let credChanged = false;
      if (!creds[credKeyNucleo]) {
        const entryForNucleo = entries.find(e => e.nucleo_key === nucleoEfetivo) || entries[0];
        const profile = NUCLEO_PROFILES[nucleoEfetivo];
        if (profile) {
          const isMainCpf = normalizeCpf(entryForNucleo.cpf || '') === cpfNorm;
          // Herda senha da credencial legada se existir (mesma senha para todos os núcleos do CPF)
          const inheritedPassword = creds[credKeyLegacy]?.password;
          creds[credKeyNucleo] = {
            nucleo: nucleoEfetivo as NucleoKey,
            label: profile.label,
            color: profile.color,
            password: inheritedPassword || NUCLEO_DEFAULT_PASSWORDS[nucleoEfetivo] || DEFAULT_PASSWORD,
            nome: isMainCpf ? (entryForNucleo.nome || '') : (entryForNucleo.nome2 || entryForNucleo.nome || ''),
            email: entryForNucleo.email || '',
            first_login: inheritedPassword ? (creds[credKeyLegacy]?.first_login ?? true) : true,
          };
          credChanged = true;
        }
      }

      // Também garante credencial para todos os outros núcleos do CPF
      for (const e of entries) {
        const otherKey = `${cpfNorm}_${e.nucleo_key}`;
        if (!creds[otherKey]) {
          const profile = NUCLEO_PROFILES[e.nucleo_key];
          if (profile) {
            const inheritedPassword = creds[credKeyLegacy]?.password;
            const isMainCpf = normalizeCpf(e.cpf || '') === cpfNorm;
            creds[otherKey] = {
              nucleo: e.nucleo_key as NucleoKey,
              label: profile.label,
              color: profile.color,
              password: inheritedPassword || NUCLEO_DEFAULT_PASSWORDS[e.nucleo_key] || DEFAULT_PASSWORD,
              nome: isMainCpf ? (e.nome || '') : (e.nome2 || e.nome || ''),
              email: e.email || '',
              first_login: inheritedPassword ? (creds[credKeyLegacy]?.first_login ?? true) : true,
            };
            credChanged = true;
          }
        }
      }
      if (credChanged) await saveCreds(creds);

      const user = creds[credKeyNucleo];
      if (!user || !checkPassword(user.password, password))
        return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });

      // Verifica que o CPF tem acesso ao núcleo target
      if (!nucleosByCpf.includes(nucleoEfetivo))
        return NextResponse.json({ error: 'Acesso não autorizado para este núcleo.' }, { status: 403 });

      const profile = NUCLEO_PROFILES[nucleoEfetivo];

      return NextResponse.json({
        ok: true,
        nucleo: nucleoEfetivo,
        label: profile?.label || user.label,
        color: profile?.color || user.color,
        nome: user.nome || '',
        isGeral: false,
        first_login: user.first_login === true,
      });
    }

    // Login por chave (admin, nucleo-key)
    const user = creds[key];
    if (!user || !checkPassword(user.password, password))
      return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    const isGeral = user.nucleo === 'geral';
    const isOwner = key === 'owner';
    return NextResponse.json({
      ok: true,
      nucleo: user.nucleo,
      label: user.label,
      color: user.color,
      nome: user.nome || '',
      isGeral,
      isOwner,
      first_login: user.first_login === true,
    });
  }

  // ── ALTERAR MINHA SENHA ──
  if (action === 'change-password') {
    const { username, current_password, new_password } = body;
    if (!username || !current_password || !new_password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    if (new_password.length < 6)
      return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
    const creds = await loadCreds();
    const key = normalizeKey(username);
    const isCpfKey = /^\d{11}$/.test(key);

    if (isCpfKey) {
      // Busca qualquer credencial do CPF (chave cpf_nucleo ou cpf legado)
      const allKeys = Object.keys(creds).filter(k => k === key || k.startsWith(key + '_'));
      const validKey = allKeys.find(k => checkPassword(creds[k].password, current_password));
      if (!validKey)
        return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 401 });
      // Atualiza senha em TODAS as credenciais do CPF (mantém sincronizadas)
      let changed = false;
      for (const k of allKeys) {
        if (checkPassword(creds[k].password, current_password)) {
          creds[k] = { ...creds[k], password: new_password, first_login: false };
          changed = true;
        }
      }
      if (changed) await saveCreds(creds);
      return NextResponse.json({ ok: true });
    }

    const user = creds[key];
    if (!user || !checkPassword(user.password, current_password))
      return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 401 });
    creds[key] = { ...user, password: new_password, first_login: false };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  // ── SOLICITAR REDEFINIÇÃO DE SENHA (envia e-mail) ──
  if (action === 'forgot-password') {
    const { cpf } = body;
    if (!cpf) return NextResponse.json({ error: 'CPF obrigatório.' }, { status: 400 });
    const cpfNorm = normalizeCpf(cpf);
    if (cpfNorm.length !== 11) return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 });

    const creds = await loadCreds();
    // Busca credencial do CPF (nova chave com núcleo ou legada)
    const allCpfKeys = Object.keys(creds).filter(k => k === cpfNorm || k.startsWith(cpfNorm + '_'));
    const user = allCpfKeys.length > 0 ? creds[allCpfKeys[0]] : undefined;

    // Busca e-mail no módulo responsaveis ou nas credentials
    let email = user?.email || '';
    if (!email) {
      email = (await getEmailResponsavel(cpfNorm)) || '';
    }

    // Gera token mesmo se não achar e-mail (para poder retornar token em dev)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 30 * 60 * 1000; // 30 min

    const tokens = await loadTokens();
    // Remove tokens antigos do mesmo CPF
    for (const [k, v] of Object.entries(tokens)) {
      if (v.cpf === cpfNorm) delete tokens[k];
    }
    tokens[token] = { cpf: cpfNorm, token, expires };
    await saveTokens(tokens);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
    const resetUrl = `${baseUrl}/nucleo/reset-senha?token=${token}`;

    const hasResend = !!process.env.RESEND_API_KEY;

    if (email) {
      const nome = user?.nome || '';
      const sent = await sendResetEmail(email, nome, resetUrl);
      if (sent) {
        return NextResponse.json({ ok: true, message: `E-mail de redefinição enviado para ${email.replace(/(.{2}).+(@.+)/, '$1****$2')}.` });
      }
    }

    // Sem e-mail ou envio falhou — Admin Geral pode usar o link diretamente
    return NextResponse.json({
      ok: true,
      no_email: !email,
      no_resend: !hasResend,
      message: !email
        ? 'CPF sem e-mail cadastrado. O Admin Geral pode usar o link abaixo para redefinir a senha.'
        : !hasResend
          ? 'Serviço de e-mail não configurado (RESEND_API_KEY). O Admin Geral pode usar o link abaixo.'
          : 'Falha ao enviar o e-mail. Tente novamente ou use o link abaixo.',
      // Link de redefinição sempre disponível para uso administrativo
      reset_url: resetUrl,
      dev_token: token,
    });
  }

  // ── VALIDAR TOKEN DE RESET ──
  if (action === 'validate-reset-token') {
    const { token } = body;
    if (!token) return NextResponse.json({ error: 'Token obrigatório.' }, { status: 400 });
    const tokens = await loadTokens();
    const entry = tokens[token];
    if (!entry || entry.expires < Date.now())
      return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 400 });
    // Busca nome do responsável (chave por núcleo ou legada)
    const creds = await loadCreds();
    const cpfEntry = entry.cpf;
    const allKeys = Object.keys(creds).filter(k => k === cpfEntry || k.startsWith(cpfEntry + '_'));
    const user = allKeys.length > 0 ? creds[allKeys[0]] : undefined;
    return NextResponse.json({ ok: true, cpf: cpfEntry, nome: user?.nome || '', nucleo: user?.nucleo });
  }

  // ── REDEFINIR SENHA VIA TOKEN ──
  if (action === 'reset-by-token') {
    const { token, new_password } = body;
    if (!token || !new_password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    if (new_password.length < 6)
      return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 });

    const tokens = await loadTokens();
    const entry = tokens[token];
    if (!entry || entry.expires < Date.now())
      return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 400 });

    const creds = await loadCreds();
    const cpfKey = entry.cpf;

    // Atualiza todas as credenciais do CPF (chave legada e chaves por núcleo)
    const allCpfCredsKeys = Object.keys(creds).filter(k => k === cpfKey || k.startsWith(cpfKey + '_'));
    if (allCpfCredsKeys.length === 0) {
      // Nenhuma credencial ainda — cria para todos os núcleos do responsável
      const lista = await loadResponsaveis();
      const respEntries = lista.filter(r =>
        normalizeCpf(r.cpf || '') === cpfKey || normalizeCpf(r.cpf2 || '') === cpfKey
      );
      if (!respEntries.length)
        return NextResponse.json({ error: 'Responsável não encontrado.' }, { status: 404 });
      for (const respEntry of respEntries) {
        const profile = NUCLEO_PROFILES[respEntry.nucleo_key];
        if (!profile) continue;
        const isMain = normalizeCpf(respEntry.cpf || '') === cpfKey;
        creds[`${cpfKey}_${respEntry.nucleo_key}`] = {
          nucleo: respEntry.nucleo_key as NucleoKey,
          label: profile.label,
          color: profile.color,
          password: new_password,
          nome: isMain ? (respEntry.nome || '') : (respEntry.nome2 || respEntry.nome || ''),
          first_login: false,
        };
      }
    } else {
      // Atualiza todas as credenciais existentes do CPF
      for (const k of allCpfCredsKeys) {
        creds[k] = { ...creds[k], password: new_password, first_login: false };
      }
    }

    await saveCreds(creds);

    // Remove token usado
    delete tokens[token];
    await saveTokens(tokens);

    return NextResponse.json({ ok: true });
  }

  // ── RESETAR SENHA (Admin Geral redefine senha de qualquer usuário) ──
  if (action === 'reset-password') {
    const { admin_username, admin_password, target_username, new_password } = body;
    if (!admin_username || !admin_password || !target_username || !new_password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    if (new_password.length < 6)
      return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
    const creds = await loadCreds();
    const adminKey = normalizeKey(admin_username);
    const targetKey = normalizeKey(target_username);
    const adminUser = creds[adminKey];
    if (!adminUser || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (!isAdminGeral(creds, adminKey))
      return NextResponse.json({ error: 'Somente o Admin Geral pode redefinir senhas.' }, { status: 403 });
    if (!creds[targetKey])
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    creds[targetKey] = { ...creds[targetKey], password: new_password, first_login: true };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  // ── CRIAR RESPONSÁVEL DE NÚCLEO (login = CPF) ──
  if (action === 'create-user') {
    const { admin_username, admin_password, cpf, nome, nucleo_key } = body;
    const new_password = body.new_password || DEFAULT_PASSWORD;
    if (!admin_username || !admin_password || !cpf || !nucleo_key)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    if (new_password.length < 6)
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });

    const cpfKey = normalizeCpf(cpf);
    if (cpfKey.length !== 11 || !/^\d{11}$/.test(cpfKey))
      return NextResponse.json({ error: 'CPF inválido. Digite os 11 dígitos.' }, { status: 400 });

    const creds = await loadCreds();
    const adminKey = normalizeKey(admin_username);
    if (!creds[adminKey] || !checkPassword(creds[adminKey].password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (!isAdminGeral(creds, adminKey))
      return NextResponse.json({ error: 'Somente o Admin Geral pode criar usuários.' }, { status: 403 });

    // Verifica se já existe credencial para este CPF neste núcleo
    const credKeyForNucleo = `${cpfKey}_${nucleo_key}`;
    if (creds[credKeyForNucleo] || creds[cpfKey])
      return NextResponse.json({ error: `CPF já cadastrado como responsável neste núcleo.` }, { status: 409 });

    const profile = NUCLEO_PROFILES[nucleo_key];
    if (!profile)
      return NextResponse.json({ error: 'Núcleo inválido.' }, { status: 400 });

    const autorizado = await cpfAutorizadoParaNucleo(cpfKey, nucleo_key);
    if (!autorizado) {
      // Auto-register the CPF in responsaveis.json so the user can log in right away
      try {
        const { data: respUrlData } = await supabase.storage.from(BUCKET).createSignedUrl('config/responsaveis.json', 10);
        let respList: Array<Record<string, unknown>> = [];
        if (respUrlData?.signedUrl) {
          const respRes = await fetch(respUrlData.signedUrl, { cache: 'no-store' });
          if (respRes.ok) { const j = await respRes.json(); respList = j.responsaveis || []; }
        }
        const existing = respList.findIndex((r: any) => r.nucleo_key === nucleo_key);
        const newEntry = existing >= 0
          ? { ...respList[existing], cpf: cpfKey, nome: (respList[existing] as any).nome || nome?.trim() || '' }
          : { nucleo_key, nucleo_label: profile.label, nome: nome?.trim() || '', cpf: cpfKey };
        if (existing >= 0) respList[existing] = newEntry;
        else respList.push(newEntry);
        const blob = new Blob([JSON.stringify({ responsaveis: respList, updated_at: new Date().toISOString() })], { type: 'application/json' });
        await supabase.storage.from(BUCKET).upload('config/responsaveis.json', blob, { upsert: true });
      } catch { /* non-blocking */ }
    }

    // Usa chave por núcleo para suportar o mesmo CPF em múltiplos núcleos
    creds[credKeyForNucleo] = {
      nucleo: profile.nucleo,
      label: profile.label,
      color: profile.color,
      password: new_password,
      nome: nome?.trim() || '',
      createdBy: adminKey,
      first_login: true,
    };
    await saveCreds(creds);
    return NextResponse.json({ ok: true, cpf: cpfKey, message: 'Cadastro realizado com sucesso!' });
  }

  // ── CRIAR ADMIN GERAL ADICIONAL (máx. 3 no total) ──
  if (action === 'create-geral') {
    const { admin_username, admin_password, new_username, new_password, nome } = body;
    if (!admin_username || !admin_password || !new_username || !new_password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    if (new_password.length < 6)
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });

    const newKey = new_username.trim().toLowerCase().replace(/\s+/g, '_');
    if (newKey.length < 3)
      return NextResponse.json({ error: 'Login deve ter pelo menos 3 caracteres.' }, { status: 400 });

    const creds = await loadCreds();
    const adminKey = normalizeKey(admin_username);
    if (!creds[adminKey] || !checkPassword(creds[adminKey].password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (!isAdminGeral(creds, adminKey))
      return NextResponse.json({ error: 'Somente o Admin Geral pode criar outros admins.' }, { status: 403 });

    const totalGeral = Object.values(creds).filter(c => c.nucleo === 'geral').length;
    if (totalGeral >= 3)
      return NextResponse.json({ error: 'Limite de 3 administradores gerais atingido.' }, { status: 400 });

    if (creds[newKey])
      return NextResponse.json({ error: `Login "${newKey}" já existe.` }, { status: 409 });

    creds[newKey] = {
      nucleo: 'geral',
      label: 'Admin Geral',
      color: '#1d4ed8',
      password: new_password,
      nome: nome?.trim() || '',
      createdBy: adminKey,
    };
    await saveCreds(creds);
    return NextResponse.json({ ok: true, username: newKey });
  }

  // ── REMOVER USUÁRIO ──
  if (action === 'delete-user') {
    const { admin_username, admin_password, target_username } = body;
    if (!admin_username || !admin_password || !target_username)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    const creds = await loadCreds();
    const adminKey = normalizeKey(admin_username);
    const targetKey = normalizeKey(target_username);
    if (!creds[adminKey] || !checkPassword(creds[adminKey].password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (!isAdminGeral(creds, adminKey))
      return NextResponse.json({ error: 'Somente o Admin Geral pode remover usuários.' }, { status: 403 });
    if (targetKey === 'admin')
      return NextResponse.json({ error: 'Não é possível remover o Admin Geral principal.' }, { status: 400 });
    if (targetKey === adminKey)
      return NextResponse.json({ error: 'Você não pode remover sua própria conta.' }, { status: 400 });
    if (!creds[targetKey])
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    delete creds[targetKey];
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  // ── LISTAR USUÁRIOS ──
  if (action === 'list-users') {
    const { admin_username, admin_password } = body;
    const creds = await loadCreds();
    const adminKey = normalizeKey(admin_username || '');
    const adminUser = creds[adminKey];
    if (!adminUser || !isAdminGeral(creds, adminKey) || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    const list = Object.entries(creds).map(([u, c]) => ({
      username: u,
      label: c.label,
      nucleo: c.nucleo,
      color: c.color,
      email: c.email || '',
      createdBy: c.createdBy || '',
      nome: c.nome || '',
      first_login: c.first_login || false,
    }));
    return NextResponse.json(list);
  }

  // ── ATUALIZAR EMAIL ──
  if (action === 'update-email') {
    const { username, password, email } = body;
    if (!username || !password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    const creds = await loadCreds();
    const key = normalizeKey(username);
    const user = creds[key];
    if (!user || !checkPassword(user.password, password))
      return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
    creds[key] = { ...user, email: email || '' };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  // ── RESETAR TODOS OS RESPONSÁVEIS PARA SENHA PADRÃO (Admin Geral) ──
  if (action === 'reset-all-to-default') {
    const { admin_username, admin_password } = body;
    if (!admin_username || !admin_password)
      return NextResponse.json({ error: 'Credenciais obrigatórias.' }, { status: 400 });
    const creds = await loadCreds();
    const adminKey = normalizeKey(admin_username);
    if (!creds[adminKey] || !checkPassword(creds[adminKey].password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (!isAdminGeral(creds, adminKey))
      return NextResponse.json({ error: 'Somente o Admin Geral pode executar esta ação.' }, { status: 403 });

    let count = 0;
    for (const [key, cred] of Object.entries(creds)) {
      if (cred.nucleo !== 'geral') {
        creds[key] = { ...cred, password: DEFAULT_PASSWORD, first_login: true };
        count++;
      }
    }
    await saveCreds(creds);
    return NextResponse.json({ ok: true, count });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
