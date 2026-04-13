import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const KEY = 'config/admin-credentials.json';

// Stores custom credentials for admin profiles (overrides defaults stored in localStorage)
// { [nucleo_key]: { user: string, pass: string } }
type CredMap = Record<string, { user: string; pass: string; label: string; color: string }>;

async function loadCreds(): Promise<CredMap> {
  try {
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!urlData?.signedUrl) return {};
    const res = await fetch(urlData.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function saveCreds(map: CredMap): Promise<void> {
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
}

export async function GET() {
  const creds = await loadCreds();
  // Strip passwords from response for security
  const safe: Record<string, { label: string; color: string; user: string; has_pass: boolean }> = {};
  for (const [k, v] of Object.entries(creds)) {
    safe[k] = { label: v.label, color: v.color, user: v.user, has_pass: !!v.pass };
  }
  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, nucleo_key, user, pass, label, color } = body;

    if (action === 'set') {
      if (!nucleo_key || !user || !pass) {
        return NextResponse.json({ error: 'nucleo_key, user e pass são obrigatórios.' }, { status: 400 });
      }
      const creds = await loadCreds();
      creds[nucleo_key] = { user: user.trim(), pass, label: label || nucleo_key, color: color || '#1d4ed8' };
      await saveCreds(creds);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const creds = await loadCreds();
      delete creds[nucleo_key];
      await saveCreds(creds);
      return NextResponse.json({ success: true });
    }

    if (action === 'get-all') {
      // Full list with passwords — admin only
      return NextResponse.json(await loadCreds());
    }

    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
