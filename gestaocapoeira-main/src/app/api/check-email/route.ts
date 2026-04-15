import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/check-email?email=foo@bar.com&exclude_id=STUDENT_UUID
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get('email') || '').trim().toLowerCase();
  const excludeId = searchParams.get('exclude_id') || '';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ exists: false });
  }

  let query = supabaseAdmin.from('students').select('id, nome_completo').ilike('email', email);
  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query.maybeSingle();
  if (data) {
    return NextResponse.json({ exists: true, nome: data.nome_completo });
  }
  return NextResponse.json({ exists: false });
}
