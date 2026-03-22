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
  nome?: string; // nome do responsável para display
}

type CredsMap = Record<string, Credential>;

// Senhas padrão iniciais por núcleo (usadas ao criar responsável sem senha definida)
export const NUCLEO_DEFAULT_PASSWORDS: Record<string, string> = {
  'edson-alves':   'edson12345',
  'ipiranga':      'ipiranga12345',
  'saracuruna':    'sara12345',
  'vila-urussai':  'urussai12345',
  'jayme-fichman': 'jayme12345',
};

// Credenciais padrão — admin geral + conta inicial de cada núcleo (acessível pela senha padrão)
const DEFAULT_CREDS: CredsMap = {
  admin:            { nucleo: 'geral',          label: 'Admin Geral',                color: '#1d4ed8', password: 'accbm2025' },
  'edson-alves':    { nucleo: 'edson-alves',    label: 'Poliesportivo Edson Alves',  color: '#dc2626', password: 'edson12345' },
  'ipiranga':       { nucleo: 'ipiranga',       label: 'Poliesportivo do Ipiranga',  color: '#ea580c', password: 'ipiranga12345' },
  'saracuruna':     { nucleo: 'saracuruna',     label: 'Núcleo Saracuruna',          color: '#16a34a', password: 'sara12345' },
  'vila-urussai':   { nucleo: 'vila-urussai',   label: 'Núcleo Vila Urussaí',        color: '#9333ea', password: 'urussai12345' },
  'jayme-fichman':  { nucleo: 'jayme-fichman',  label: 'Núcleo Jayme Fichman',       color: '#0891b2', password: 'jayme12345' },
};

export const NUCLEO_PROFILES: Record<string, { nucleo: NucleoKey; label: string; color: string }> = {
  'edson-alves':   { nucleo: 'edson-alves',   label: 'Poliesportivo Edson Alves', color: '#dc2626' },
  'ipiranga':      { nucleo: 'ipiranga',       label: 'Poliesportivo do Ipiranga', color: '#ea580c' },
  'saracuruna':    { nucleo: 'saracuruna',     label: 'Núcleo Saracuruna',         color: '#16a34a' },
  'vila-urussai':  { nucleo: 'vila-urussai',   label: 'Núcleo Vila Urussaí',       color: '#9333ea' },
  'jayme-fichman': { nucleo: 'jayme-fichman',  label: 'Núcleo Jayme Fichman',      color: '#0891b2' },
};

// Normaliza CPF: remove pontos, traços, espaços → somente dígitos
function normalizeCpf(s: string): string {
  return s.replace(/\D/g, '');
}

// Normaliza login genérico: minúsculas, sem espaços
function normalizeKey(s: string): string {
  const clean = s.trim().toLowerCase();
  // Se parece CPF (11 dígitos após normalização), usar CPF normalizado
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

// Carrega responsáveis cadastrados no módulo responsaveis.json
interface ResponsavelEntry { nucleo_key: string; cpf: string; cpf2?: string; nome?: string; nome2?: string; }
async function loadResponsaveis(): Promise<ResponsavelEntry[]> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl('config/responsaveis.json', 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    const cfg = await res.json();
    return cfg.responsaveis || [];
  } catch { return []; }
}

// Verifica se CPF está registrado no módulo responsáveis para o núcleo informado
async function cpfAutorizadoParaNucleo(cpf: string, nucleoKey: string): Promise<boolean> {
  const lista = await loadResponsaveis();
  const cpfNorm = normalizeCpf(cpf);
  return lista.some(r =>
    r.nucleo_key === nucleoKey &&
    (normalizeCpf(r.cpf || '') === cpfNorm || normalizeCpf(r.cpf2 || '') === cpfNorm)
  );
}

async function saveCreds(map: CredsMap): Promise<void> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(CREDS_KEY, blob, { upsert: true });
}

function checkPassword(stored: string, input: string): boolean {
  return stored === input;
}

function isAdminGeral(creds: CredsMap, key: string): boolean {
  return !!creds[key] && creds[key].nucleo === 'geral';
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

    // Se for login por CPF, verificar no módulo responsáveis e auto-criar credencial se necessário
    if (isCpfLogin) {
      const lista = await loadResponsaveis();
      const cpfNorm = normalizeCpf(key);
      const entry = lista.find(r =>
        normalizeCpf(r.cpf || '') === cpfNorm || normalizeCpf(r.cpf2 || '') === cpfNorm
      );
      if (!entry)
        return NextResponse.json({ error: 'CPF não encontrado como responsável de nenhum núcleo. Solicite o cadastro ao Admin Geral.' }, { status: 403 });

      // Auto-criar credencial na primeira vez com senha padrão do núcleo
      if (!creds[cpfNorm]) {
        const profile = NUCLEO_PROFILES[entry.nucleo_key];
        if (profile) {
          const isMainCpf = normalizeCpf(entry.cpf || '') === cpfNorm;
          creds[cpfNorm] = {
            nucleo: entry.nucleo_key as NucleoKey,
            label: profile.label,
            color: profile.color,
            password: NUCLEO_DEFAULT_PASSWORDS[entry.nucleo_key] || 'acesso12345',
            nome: isMainCpf ? (entry.nome || '') : (entry.nome2 || entry.nome || ''),
          };
          await saveCreds(creds);
        }
      }

      const user = creds[cpfNorm];
      if (!user || !checkPassword(user.password, password))
        return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });

      return NextResponse.json({ ok: true, nucleo: user.nucleo, label: user.label, color: user.color, nome: user.nome || '', isGeral: false });
    }

    // Login por chave (admin, nucleo-key) — sem CPF
    const user = creds[key];
    if (!user || !checkPassword(user.password, password))
      return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    const isGeral = user.nucleo === 'geral';
    return NextResponse.json({ ok: true, nucleo: user.nucleo, label: user.label, color: user.color, nome: user.nome || '', isGeral });
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
    const adminKey = normalizeKey(admin_username);
    const targetKey = normalizeKey(target_username);
    const adminUser = creds[adminKey];
    if (!adminUser || !checkPassword(adminUser.password, admin_password))
      return NextResponse.json({ error: 'Credenciais de administrador incorretas.' }, { status: 401 });
    if (!isAdminGeral(creds, adminKey))
      return NextResponse.json({ error: 'Somente o Admin Geral pode redefinir senhas.' }, { status: 403 });
    if (!creds[targetKey])
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    creds[targetKey] = { ...creds[targetKey], password: new_password };
    await saveCreds(creds);
    return NextResponse.json({ ok: true });
  }

  // ── CRIAR RESPONSÁVEL DE NÚCLEO (login = CPF) ──
  if (action === 'create-user') {
    const { admin_username, admin_password, cpf, nome, nucleo_key } = body;
    const new_password = body.new_password || NUCLEO_DEFAULT_PASSWORDS[nucleo_key] || 'acesso12345';
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

    if (creds[cpfKey])
      return NextResponse.json({ error: `CPF já cadastrado como responsável.` }, { status: 409 });

    const profile = NUCLEO_PROFILES[nucleo_key];
    if (!profile)
      return NextResponse.json({ error: 'Núcleo inválido.' }, { status: 400 });

    // Validar que o CPF está cadastrado no módulo responsáveis para o núcleo
    const autorizado = await cpfAutorizadoParaNucleo(cpfKey, nucleo_key);
    if (!autorizado)
      return NextResponse.json({ error: `CPF não encontrado no módulo Responsáveis de Núcleo para ${profile.label}. Cadastre o responsável primeiro na aba Responsáveis.` }, { status: 422 });

    creds[cpfKey] = {
      nucleo: profile.nucleo,
      label: profile.label,
      color: profile.color,
      password: new_password,
      nome: nome?.trim() || '',
      createdBy: adminKey,
    };
    await saveCreds(creds);
    return NextResponse.json({ ok: true, cpf: cpfKey });
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

    // Máximo 3 admins gerais
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

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
