import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const AUTH_KEY = 'config/aluno-auth.json';
const ID_MAP_KEY = 'config/aluno-id-map.json';

async function loadFromStorage(key: string): Promise<Record<string, unknown>> {
  try {
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(key, 30);
    if (!urlData?.signedUrl) return {};
    const res = await fetch(urlData.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

export async function GET() {
  try {
    const [authMap, idMap] = await Promise.all([
      loadFromStorage(AUTH_KEY),
      loadFromStorage(ID_MAP_KEY),
    ]);

    const safe = Object.values(authMap).map((acc: any) => ({
      student_id: acc.student_id,
      username: acc.username,
      email: acc.email,
      active: acc.active,
      phone: acc.phone,
      created_at: acc.created_at,
      last_login: acc.last_login,
      display_id: (idMap as Record<string, string>)[acc.student_id] || null,
      needs_password_reset: acc.needs_password_reset === true,
    }));

    return NextResponse.json(safe);
  } catch {
    return NextResponse.json([]);
  }
}
