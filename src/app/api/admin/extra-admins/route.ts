import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/extra-admins.json';
const CREDS_KEY = 'config/panel-credentials.json';
const MAX_EXTRA_ADMINS = 3;

export type ExtraAdmin = {
  id: string;
  username: string;
  nome: string;
  email?: string;
  created_at: string;
};

async function loadExtraAdmins(): Promise<ExtraAdmin[]> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function saveExtraAdmins(admins: ExtraAdmin[]) {
  const buf = Buffer.from(JSON.stringify(admins, null, 2));
  await supabase.storage.from(BUCKET).upload(KEY, buf, { contentType: 'application/json', upsert: true });
}

async function loadCreds(): Promise<Record<string, unknown>> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CREDS_KEY, 30);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function saveCreds(creds: Record<string, unknown>) {
  const buf = Buffer.from(JSON.stringify(creds, null, 2));
  await supabase.storage.from(BUCKET).upload(CREDS_KEY, buf, { contentType: 'application/json', upsert: true });
}

/** GET — list extra admins */
export async function GET() {
  const admins = await loadExtraAdmins();
  return NextResponse.json({ admins });
}

/** POST — add an extra admin (max 3) */
export async function POST(req: NextRequest) {
  const { username, nome, email, password } = await req.json();
  if (!username || !nome || !password) {
    return NextResponse.json({ error: 'username, nome e password são obrigatórios' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 });
  }

  const admins = await loadExtraAdmins();
  if (admins.length >= MAX_EXTRA_ADMINS) {
    return NextResponse.json({ error: `Limite de ${MAX_EXTRA_ADMINS} administradores gerais atingido.` }, { status: 400 });
  }

  // Check username collision
  const creds = await loadCreds();
  const userKey = username.trim().toLowerCase();
  if (creds[userKey]) {
    return NextResponse.json({ error: 'Esse nome de usuário já está em uso.' }, { status: 400 });
  }
  if (admins.some(a => a.username.toLowerCase() === userKey)) {
    return NextResponse.json({ error: 'Esse nome de usuário já existe.' }, { status: 400 });
  }

  const newAdmin: ExtraAdmin = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username: userKey,
    nome: nome.trim(),
    email: email?.trim() || undefined,
    created_at: new Date().toISOString(),
  };

  admins.push(newAdmin);
  await saveExtraAdmins(admins);

  // Register in credentials as geral admin
  creds[userKey] = {
    nucleo: 'geral',
    label: nome.trim(),
    color: '#1d4ed8',
    password,
    email: email?.trim() || undefined,
    nome: nome.trim(),
    first_login: false,
  };
  await saveCreds(creds);

  return NextResponse.json({ ok: true, admin: newAdmin });
}

/** DELETE — remove an extra admin */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admins = await loadExtraAdmins();
  const target = admins.find(a => a.id === id);
  if (!target) return NextResponse.json({ error: 'Admin não encontrado' }, { status: 404 });

  // Remove from extra-admins
  const filtered = admins.filter(a => a.id !== id);
  await saveExtraAdmins(filtered);

  // Remove from credentials
  const creds = await loadCreds();
  delete creds[target.username];
  await saveCreds(creds);

  return NextResponse.json({ ok: true });
}
