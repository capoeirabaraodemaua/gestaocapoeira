import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const MATRICULAS_KEY = 'config/matriculas.json';
const ADMIN_CPF = '09856925703';

// Lê o mapa de matrículas salvo no Storage
async function readMatriculas(): Promise<Record<string, number>> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(MATRICULAS_KEY, 10);
    if (!data?.signedUrl) return {};
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

// Salva o mapa de matrículas no Storage
async function saveMatriculas(map: Record<string, number>): Promise<boolean> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(MATRICULAS_KEY, blob, { upsert: true });
  return !error;
}

export async function GET() {
  // 1. Busca todos os alunos ordenados por created_at
  const { data: students, error } = await supabaseAdmin
    .from('students')
    .select('id, cpf, nome_completo, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!students?.length) return NextResponse.json({ ok: true, total: 0 });

  // 2. Ordena: admin primeiro, resto por created_at
  const sorted = [...students];
  const adminIdx = sorted.findIndex(s => (s.cpf || '').replace(/\D/g, '') === ADMIN_CPF);
  if (adminIdx > 0) {
    const [admin] = sorted.splice(adminIdx, 1);
    sorted.unshift(admin);
  }

  // 3. Monta o mapa id → numero
  const matriculasById: Record<string, number> = {};
  const matriculasByCpf: Record<string, number> = {};
  sorted.forEach((s, i) => {
    matriculasById[s.id] = i + 1;
    const cpf = (s.cpf || '').replace(/\D/g, '');
    if (cpf) matriculasByCpf[cpf] = i + 1;
  });

  // 4. Tenta salvar no campo ordem_inscricao do banco (pode falhar se coluna não existe)
  let dbUpdated = 0;
  for (const s of sorted) {
    const num = matriculasById[s.id];
    const { error: upErr } = await supabaseAdmin
      .from('students')
      .update({ ordem_inscricao: num })
      .eq('id', s.id);
    if (!upErr) dbUpdated++;
  }

  // 5. Sempre salva no Storage como fallback garantido
  const savedToStorage = await saveMatriculas({ ...matriculasById, ...Object.fromEntries(Object.entries(matriculasByCpf).map(([cpf, n]) => [`cpf_${cpf}`, n])) });

  return NextResponse.json({
    ok: true,
    total: sorted.length,
    dbUpdated,
    savedToStorage,
    preview: sorted.slice(0, 10).map((s, i) => `${i+1}. ${s.nome_completo}`),
  });
}

// Endpoint para buscar a matrícula de um aluno pelo ID ou CPF
export async function POST(req: Request) {
  const { id, cpf } = await req.json();
  const map = await readMatriculas();

  let num: number | null = null;
  if (id && map[id]) num = map[id];
  else if (cpf) {
    const digits = cpf.replace(/\D/g, '');
    if (map[`cpf_${digits}`]) num = map[`cpf_${digits}`];
  }

  return NextResponse.json({ matricula: num });
}
