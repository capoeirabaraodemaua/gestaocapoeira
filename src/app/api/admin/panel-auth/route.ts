import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET = 'photos';
const CREDS_KEY = 'config/panel-credentials.json';

type NucleoKey = 'edson-alves' | 'ipiranga' | 'saracuruna' | 'vila-urussai' | 'jayme-fichman' | 'geral';

interface Credential {
  nucleo: NucleoKey;
  label: string;
  color: string;
  password: string;
  email?: string;
  createdBy?: string;
}

type CredsMap = Record<string, Credential>;

// Usuários fixos — Admin Geral sempre existe
const DEFAULT_CREDS: CredsMap = {
  admin: { nucleo: 'geral', label: 'Admin Geral', color: '#1d4ed8', password: 'accbm2025' },
};

// Perfis de núcleo disponíveis para novos usuários
export const NUCLEO_PROFILES: Record<string, { nucleo: NucleoKey; label: string; color: string }> = {
  'edson-alves':   { nucleo: 'edson-alves',   label: 'Poliesportivo Edson Alves', color: '#dc2626' },
  'ipiranga':      { nucleo: 'ipiranga',       label: 'Poliesportivo do Ipiranga', color: '#ea580c' },
  'saracuruna':    { nucleo: 'saracuruna',     label: 'Núcleo Saracuruna',         color: '#16a34a' },
  'vila-urussai':  { nucleo: 'vila-urussai',   label: 'Núcleo Vila Urussaí',       color: '#9333ea' },
  'jayme-fichman': { nucleo: 'jayme-fichman',  label: 'Núcleo Jayme Fichman',      color: '#0891b2' },
};

async function loadCreds(): Promise<CredsMap> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CREDS_KEY, 30);
    if (!data?.signedUrl) return { ...DEFAULT_CREDS };
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return { ...DEFAULT_CREDS };
    const stored = await res.json();
    // Admin Geral sempre existe — merge defaults only for admin key
    return { ...DEFAULT_CREDS, ...stored };
  } catch { return { ...DEFAULT_CREDS }; }
}

async function saveCreds(map: CredsMap): Promise<void> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(CREDS_KEY, blob, { upsert: true });
}

function checkPassword(stored: string, input: string): boolean {
  return stored === input;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  // ── LOGIN ──
  if (action === 'login') {
    const { username, password } = body;
    if (!username || !password)
      return NextResponse.json({ error: 'Usuário e senha obrigatórios.' }, { status: 400 });
    const creds = await loadCreds();
    const user = creds[username.trim().toLowerCase()];
    if (!user || !checkPassword(user.password, password))
      return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    return NextResponse.json({ ok: true, nucleo: user.nucleo, label: user.label, color: user.color });
  }

  // ── ALTERAR SENHA (usuário logado muda a própria senha) ──
  if (action === 'change-password') {
    const { username, current_password, new_password } = body;
    if (!username || !current_password || !new_password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    if (new_password.length < 6)
      return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
    const creds = await loadCreds();
    const key = username.trim().toLowerCase();
    const user = creds[key];
    if (!user || !checkPassword(user.password, current_password))
      return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 401 });
    creds[key] = { ...user, password: new_password };
    await saveCreds(creds);
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
    const adminKey = admin_username.trim().toLowerCase();
    const targetKey = target_username.trim().toLowerCase();
    const adminUser = creds[adminKey];
    if (!adminUser || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (adminUser.nucleo !== 'geral')
      return NextResponse.json({ error: 'Somente o Admin Geral pode redefinir senhas.' }, { status: 403 });
    if (!creds[targetKey])
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    creds[targetKey] = { ...creds[targetKey], password: new_password };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  // ── CRIAR RESPONSÁVEL DE NÚCLEO (Admin Geral cria novo usuário) ──
  if (action === 'create-user') {
    const { admin_username, admin_password, new_username, new_password, nucleo_key } = body;
    if (!admin_username || !admin_password || !new_username || !new_password || !nucleo_key)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    if (new_password.length < 6)
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 });

    const usernameClean = new_username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (usernameClean.length < 3)
      return NextResponse.json({ error: 'Login deve ter pelo menos 3 caracteres (apenas letras e números).' }, { status: 400 });

    const creds = await loadCreds();
    const adminUser = creds[admin_username.trim().toLowerCase()];
    if (!adminUser || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (adminUser.nucleo !== 'geral')
      return NextResponse.json({ error: 'Somente o Admin Geral pode criar usuários.' }, { status: 403 });

    if (creds[usernameClean])
      return NextResponse.json({ error: `Login "${usernameClean}" já existe.` }, { status: 409 });

    const profile = NUCLEO_PROFILES[nucleo_key];
    if (!profile)
      return NextResponse.json({ error: 'Núcleo inválido.' }, { status: 400 });

    creds[usernameClean] = {
      nucleo: profile.nucleo,
      label: profile.label,
      color: profile.color,
      password: new_password,
      createdBy: admin_username.trim().toLowerCase(),
    };
    await saveCreds(creds);
    return NextResponse.json({ ok: true, username: usernameClean });
  }

  // ── REMOVER USUÁRIO (Admin Geral remove responsável de núcleo) ──
  if (action === 'delete-user') {
    const { admin_username, admin_password, target_username } = body;
    if (!admin_username || !admin_password || !target_username)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    const creds = await loadCreds();
    const adminUser = creds[admin_username.trim().toLowerCase()];
    if (!adminUser || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (adminUser.nucleo !== 'geral')
      return NextResponse.json({ error: 'Somente o Admin Geral pode remover usuários.' }, { status: 403 });
    const targetKey = target_username.trim().toLowerCase();
    if (targetKey === 'admin')
      return NextResponse.json({ error: 'Não é possível remover o Admin Geral.' }, { status: 400 });
    if (!creds[targetKey])
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    delete creds[targetKey];
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  // ── LISTAR USUÁRIOS (Admin Geral) ──
  if (action === 'list-users') {
    const { admin_username, admin_password } = body;
    const creds = await loadCreds();
    const adminUser = creds[admin_username?.trim().toLowerCase()];
    if (!adminUser || adminUser.nucleo !== 'geral' || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    const list = Object.entries(creds).map(([u, c]) => ({
      username: u,
      label: c.label,
      nucleo: c.nucleo,
      color: c.color,
      email: c.email || '',
      createdBy: c.createdBy || '',
    }));
    return NextResponse.json(list);
  }

  // ── ATUALIZAR EMAIL ──
  if (action === 'update-email') {
    const { username, password, email } = body;
    if (!username || !password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    const creds = await loadCreds();
    const key = username.trim().toLowerCase();
    const user = creds[key];
    if (!user || !checkPassword(user.password, password))
      return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
    creds[key] = { ...user, email: email || '' };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
