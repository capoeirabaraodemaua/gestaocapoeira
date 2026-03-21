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
  password: string; // stored hashed: salt:hash
  email?: string;
}

type CredsMap = Record<string, Credential>; // key = username

const DEFAULT_CREDS: CredsMap = {
  edsonalves:   { nucleo: 'edson-alves',   label: 'Poliesportivo Edson Alves', color: '#dc2626', password: 'edson2025' },
  ipiranga:     { nucleo: 'ipiranga',       label: 'Poliesportivo do Ipiranga', color: '#ea580c', password: 'ipiranga2025' },
  saracuruna:   { nucleo: 'saracuruna',     label: 'Núcleo Saracuruna',         color: '#16a34a', password: 'sara2025' },
  vilaurussai:  { nucleo: 'vila-urussai',   label: 'Núcleo Vila Urussaí',       color: '#9333ea', password: 'urussai2025' },
  jaymefichman: { nucleo: 'jayme-fichman',  label: 'Núcleo Jayme Fichman',      color: '#0891b2', password: 'fichman2025' },
  admin:        { nucleo: 'geral',          label: 'Admin Geral',               color: '#1d4ed8', password: 'accbm2025' },
};

async function loadCreds(): Promise<CredsMap> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CREDS_KEY, 30);
    if (!data?.signedUrl) return DEFAULT_CREDS;
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return DEFAULT_CREDS;
    const stored = await res.json();
    // Merge with defaults so new users always exist
    return { ...DEFAULT_CREDS, ...stored };
  } catch { return DEFAULT_CREDS; }
}

async function saveCreds(map: CredsMap): Promise<void> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(CREDS_KEY, blob, { upsert: true });
}

function checkPassword(stored: string, input: string): boolean {
  // Stored passwords can be plain (legacy) or "salt:hash" format
  return stored === input;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'login') {
    const { username, password } = body;
    if (!username || !password) return NextResponse.json({ error: 'Usuário e senha obrigatórios.' }, { status: 400 });
    const creds = await loadCreds();
    const user = creds[username.trim().toLowerCase()];
    if (!user || !checkPassword(user.password, password)) {
      return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    }
    return NextResponse.json({ ok: true, nucleo: user.nucleo, label: user.label, color: user.color });
  }

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

  if (action === 'reset-password') {
    // Admin geral resets any user's password
    const { admin_username, admin_password, target_username, new_password } = body;
    if (!admin_username || !admin_password || !target_username || !new_password)
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    const creds = await loadCreds();
    const adminUser = creds[admin_username.trim().toLowerCase()];
    if (!adminUser || adminUser.nucleo !== 'geral' || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador geral incorretas.' }, { status: 401 });
    const targetKey = target_username.trim().toLowerCase();
    if (!creds[targetKey]) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    creds[targetKey] = { ...creds[targetKey], password: new_password };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  if (action === 'update-email') {
    const { username, password, email } = body;
    if (!username || !password) return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
    const creds = await loadCreds();
    const key = username.trim().toLowerCase();
    const user = creds[key];
    if (!user || !checkPassword(user.password, password))
      return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
    creds[key] = { ...user, email: email || '' };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  if (action === 'list-users') {
    // Admin geral only — returns all usernames and their nucleos
    const { admin_username, admin_password } = body;
    const creds = await loadCreds();
    const adminUser = creds[admin_username?.trim().toLowerCase()];
    if (!adminUser || adminUser.nucleo !== 'geral' || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    const list = Object.entries(creds).map(([u, c]) => ({ username: u, label: c.label, nucleo: c.nucleo, email: c.email || '' }));
    return NextResponse.json(list);
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
