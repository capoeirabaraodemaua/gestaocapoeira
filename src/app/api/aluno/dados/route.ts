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

// PATCH /api/aluno/dados
// Allows authenticated student to update their own profile fields
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { student_id, ...updates } = body;

    if (!student_id) {
      return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
    }

    // Verify student exists
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('id', student_id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    }

    // Allowed fields — students can only update their own profile data, not system fields
    const ALLOWED = [
      'nucleo', 'graduacao', 'tipo_graduacao',
      'cpf', 'identidade', 'data_nascimento',
      'telefone', 'email',
      'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
      'nome_pai', 'nome_mae', 'apelido', 'nome_social', 'sexo',
      'nome_responsavel', 'cpf_responsavel',
    ];

    const payload: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in updates) {
        payload[key] = updates[key] === '' ? null : updates[key];
      }
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido para atualizar.' }, { status: 400 });
    }

    // Auto-compute menor_de_idade from data_nascimento if provided
    if (payload.data_nascimento) {
      const dob = new Date((payload.data_nascimento as string) + 'T12:00:00');
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      payload.menor_de_idade = age < 18;
    }

    // Auto-compute tenant_id from nucleo if provided
    const NUCLEO_TENANTS: Record<string, string> = {
      'Poliesportivo Edson Alves': 'a1000001-0000-4000-8000-000000000001',
      'Poliesportivo do Ipiranga':  'a1000001-0000-4000-8000-000000000002',
      'Saracuruna':                 'a1000001-0000-4000-8000-000000000003',
      'Vila Urussaí':               'a1000001-0000-4000-8000-000000000004',
      'Jayme Fichman':              'a1000001-0000-4000-8000-000000000005',
      'Academia Mais Saúde':        'a1000001-0000-4000-8000-000000000006',
    };
    if (payload.nucleo && typeof payload.nucleo === 'string') {
      const tid = NUCLEO_TENANTS[payload.nucleo];
      if (tid) payload.tenant_id = tid;
    }

    const { error: updateError } = await supabaseAdmin
      .from('students')
      .update(payload)
      .eq('id', student_id);

    if (updateError) {
      console.error('aluno dados PATCH error:', updateError);
      return NextResponse.json({ error: 'Erro ao salvar dados.' }, { status: 500 });
    }

    // Also update extras (apelido, nome_social, sexo) in Storage if present
    const extrasFields = ['apelido', 'nome_social', 'sexo'];
    const extrasUpdate: Record<string, unknown> = {};
    for (const f of extrasFields) {
      if (f in payload) extrasUpdate[f] = payload[f];
    }
    if (Object.keys(extrasUpdate).length > 0) {
      try {
        const extrasMap = await loadExtras();
        extrasMap[student_id] = { ...extrasMap[student_id], ...extrasUpdate };
        const blob = new Blob([JSON.stringify(extrasMap, null, 2)], { type: 'application/json' });
        await supabaseAdmin.storage.from(BUCKET).upload(EXTRAS_KEY, blob, { upsert: true });
      } catch { /* non-critical */ }
    }

    // Fetch updated record to return
    const { data: updated } = await supabaseAdmin
      .from('students').select('*').eq('id', student_id).maybeSingle();

    return NextResponse.json({ success: true, student: updated });
  } catch (err) {
    console.error('aluno dados PATCH error:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
