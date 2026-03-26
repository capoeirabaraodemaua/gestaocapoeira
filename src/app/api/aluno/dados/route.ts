import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const EXTRAS_KEY = 'extras/student-extras.json';
const AUTH_KEY = 'config/aluno-auth.json';

async function loadExtras(): Promise<Record<string, { apelido?: string; nome_social?: string; sexo?: string }>> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(EXTRAS_KEY, 30);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function loadAuthEmail(student_id: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(AUTH_KEY, 30);
    if (!data?.signedUrl) return null;
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const map = await res.json();
    return map[student_id]?.email || null;
  } catch { return null; }
}

// GET /api/aluno/dados?student_id=xxx
// Returns ONLY the requesting student's own data — never another student's
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('student_id');

  if (!student_id) {
    return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
  }

  const { data: student, error } = await supabaseAdmin
    .from('students')
    .select('*')
    .eq('id', student_id)
    .maybeSingle();

  if (error || !student) {
    return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  }

  // Merge student-extras (apelido, nome_social, sexo) — Storage is source of truth
  // Also merge auth map email — auth map is the authoritative source for login email
  const [extrasMap, authEmail] = await Promise.all([loadExtras(), loadAuthEmail(student_id)]);
  const ext = extrasMap[student_id];
  const safeStudent = {
    ...student,
    apelido:     ext?.apelido     || student.apelido     || null,
    nome_social: ext?.nome_social || student.nome_social || null,
    sexo:        ext?.sexo        || student.sexo        || null,
    // Auth map email takes priority as it's what the user set in their account
    email:       authEmail ?? student.email ?? null,
  };

  return NextResponse.json({ student: safeStudent });
}
