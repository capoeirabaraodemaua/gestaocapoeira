import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // Strip any sensitive admin-only fields
  const { ...safeStudent } = student;

  return NextResponse.json({ student: safeStudent });
}
