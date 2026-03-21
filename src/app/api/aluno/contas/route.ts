import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const AUTH_KEY = 'config/aluno-auth.json';

// GET /api/aluno/contas — admin only: list all accounts (passwords stripped)
export async function GET() {
  try {
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(AUTH_KEY, 30);
    if (!urlData?.signedUrl) return NextResponse.json([]);

    const res = await fetch(urlData.signedUrl, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json([]);

    const map = await res.json();

    // Strip sensitive fields (password_hash, salt, pending_otp)
    const safe = Object.values(map).map((acc: any) => ({
      student_id: acc.student_id,
      username: acc.username,
      email: acc.email,
      active: acc.active,
      phone: acc.phone,
      created_at: acc.created_at,
      last_login: acc.last_login,
    }));

    return NextResponse.json(safe);
  } catch {
    return NextResponse.json([]);
  }
}
