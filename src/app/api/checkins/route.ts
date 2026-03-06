import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const dir = (date: string) => `checkins/${date}`;
const key = (date: string, sid: string) => `checkins/${date}/${sid}.json`;

// GET /api/checkins?date=YYYY-MM-DD
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date')
    || new Date().toISOString().split('T')[0];

  const { data: files, error } = await admin.storage.from(BUCKET).list(dir(date));
  if (error || !files || files.length === 0) return NextResponse.json([]);

  const deletedIds = new Set(
    files.filter(f => f.name.endsWith('.deleted')).map(f => f.name.replace('.deleted', ''))
  );
  const active = files.filter(
    f => f.name.endsWith('.json') && !deletedIds.has(f.name.replace('.json', ''))
  );
  if (active.length === 0) return NextResponse.json([]);

  const records = await Promise.all(
    active.map(async f => {
      const { data } = await admin.storage.from(BUCKET).download(`${dir(date)}/${f.name}`);
      if (!data) return null;
      try { return JSON.parse(await data.text()); } catch { return null; }
    })
  );

  return NextResponse.json(records.filter(Boolean));
}

// POST /api/checkins  body: { student }
export async function POST(req: Request) {
  const { student } = await req.json();
  const today = new Date().toISOString().split('T')[0];

  // Verifica duplicata (ignora tombstone — se há tombstone, pode registrar novamente)
  const { data: files } = await admin.storage.from(BUCKET).list(dir(today));
  if (files) {
    const names = new Set(files.map(f => f.name));
    const hasTombstone = names.has(`${student.id}.deleted`);
    const hasCheckin   = names.has(`${student.id}.json`);
    if (hasCheckin && !hasTombstone) {
      return NextResponse.json({ success: false, alreadyRegistered: true });
    }
  }

  const now = new Date();
  const record = {
    student_id:     student.id,
    nome_completo:  student.nome_completo,
    graduacao:      student.graduacao,
    nucleo:         student.nucleo || 'Sem núcleo',
    foto_url:       student.foto_url,
    telefone:       student.telefone || '',
    hora:           now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    timestamp:      now.toISOString(),
  };

  const blob = new Blob([JSON.stringify(record)], { type: 'application/json' });
  const { error } = await admin.storage.from(BUCKET).upload(
    key(today, student.id), blob, { contentType: 'application/json', upsert: true }
  );

  if (error) return NextResponse.json({ success: false, alreadyRegistered: false });
  return NextResponse.json({ success: true, alreadyRegistered: false, record });
}
