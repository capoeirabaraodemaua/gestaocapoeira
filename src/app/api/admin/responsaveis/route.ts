import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Write (service_role bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/responsaveis.json';

export interface ResponsavelNucleo {
  nucleo_key: string;
  nucleo_label: string;
  nome: string;
  cpf: string; // digits only
  email?: string;
  nome2?: string;
  cpf2?: string; // digits only
  email2?: string;
}

export interface ResponsaveisConfig {
  responsaveis: ResponsavelNucleo[];
  updated_at: string;
}

const DEFAULT_CONFIG: ResponsaveisConfig = {
  responsaveis: [],
  updated_at: new Date().toISOString(),
};

/** Lê o arquivo sempre fresco, sem cache, usando service_role */
async function readConfig(): Promise<ResponsaveisConfig> {
  try {
    // Gera URL pública via service_role para evitar cache do SDK
    const { data: urlData } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(KEY, 10);
    if (!urlData?.signedUrl) return DEFAULT_CONFIG;

    const res = await fetch(urlData.signedUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    if (!res.ok) return DEFAULT_CONFIG;
    return await res.json();
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function GET() {
  return NextResponse.json(await readConfig());
}

// Senhas padrão iniciais por núcleo: iniciais do núcleo + 12345
const NUCLEO_DEFAULT_PASSWORDS: Record<string, string> = {
  'edson-alves':         'edsonalves12345',
  'ipiranga':            'ipiranga12345',
  'saracuruna':          'saracuruna12345',
  'vila-urussai':        'urussai12345',
  'jayme-fichman':       'jaymefichman12345',
  'academia-mais-saude': 'academiasaude12345',
};
const DEFAULT_PASSWORD = '123456'; // fallback

const NUCLEO_PROFILES: Record<string, { label: string; color: string }> = {
  'edson-alves':   { label: 'Poliesportivo Edson Alves',  color: '#dc2626' },
  'ipiranga':      { label: 'Poliesportivo do Ipiranga',  color: '#ea580c' },
  'saracuruna':    { label: 'Núcleo Saracuruna',          color: '#16a34a' },
  'vila-urussai':  { label: 'Núcleo Vila Urussaí',        color: '#9333ea' },
  'jayme-fichman': { label: 'Núcleo Jayme Fichman',       color: '#0891b2' },
};

/** Carrega panel-credentials.json */
async function loadCreds() {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl('config/panel-credentials.json', 30);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

/** Salva panel-credentials.json */
async function saveCreds(map: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload('config/panel-credentials.json', blob, { upsert: true });
}

export async function POST(req: NextRequest) {
  const body: Partial<ResponsaveisConfig> = await req.json();
  const now = new Date().toISOString();

  const current = await readConfig();
  const novaLista: ResponsavelNucleo[] = body.responsaveis ?? current.responsaveis;

  const updated: ResponsaveisConfig = {
    responsaveis: novaLista,
    updated_at: now,
  };

  const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(KEY, blob, { upsert: true, contentType: 'application/json' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sincroniza panel-credentials: garante que cada CPF cadastrado tem conta de acesso
  try {
    const creds = await loadCreds();
    let changed = false;
    for (const resp of novaLista) {
      const profile = NUCLEO_PROFILES[resp.nucleo_key];
      if (!profile) continue;
      // CPF principal — usa chave por núcleo para suportar o mesmo CPF em múltiplos núcleos
      const cpf1 = resp.cpf?.replace(/\D/g, '');
      if (cpf1?.length === 11) {
        const credKey1 = `${cpf1}_${resp.nucleo_key}`;
        if (!creds[credKey1]) {
          creds[credKey1] = {
            nucleo: resp.nucleo_key,
            label: profile.label,
            color: profile.color,
            password: NUCLEO_DEFAULT_PASSWORDS[resp.nucleo_key] || DEFAULT_PASSWORD,
            nome: resp.nome || '',
            email: resp.email || '',
            first_login: true,
          };
          changed = true;
        } else if (resp.email && creds[credKey1].email !== resp.email) {
          creds[credKey1] = { ...creds[credKey1], email: resp.email };
          changed = true;
        }
      }
      // CPF secundário (cpf2) — usa chave por núcleo
      const cpf2 = resp.cpf2?.replace(/\D/g, '');
      if (cpf2?.length === 11) {
        const credKey2 = `${cpf2}_${resp.nucleo_key}`;
        if (!creds[credKey2]) {
          creds[credKey2] = {
            nucleo: resp.nucleo_key,
            label: profile.label,
            color: profile.color,
            password: NUCLEO_DEFAULT_PASSWORDS[resp.nucleo_key] || DEFAULT_PASSWORD,
            nome: resp.nome2 || resp.nome || '',
            email: (resp as any).email2 || '',
            first_login: true,
          };
          changed = true;
        } else if ((resp as any).email2 && creds[credKey2].email !== (resp as any).email2) {
          creds[credKey2] = { ...creds[credKey2], email: (resp as any).email2 };
          changed = true;
        }
      }
    }
    if (changed) await saveCreds(creds);
  } catch { /* não bloqueia o POST se a sincronização falhar */ }

  return NextResponse.json({ ok: true, data: updated });
}
