import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const dir = (date: string) => `checkins/${date}`;
const jsonKey = (date: string, sid: string) => `checkins/${date}/${sid}.json`;
const delKey  = (date: string, sid: string) => `checkins/${date}/${sid}.deleted`;

async function ensureBucket() {
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some(b => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: false });
  }
}

// GET /api/checkins?date=YYYY-MM-DD
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date')
    || new Date().toISOString().split('T')[0];

  await ensureBucket();

  const { data: files, error } = await admin.storage.from(BUCKET).list(dir(date));

  if (error) {
    console.error('[checkins GET] storage error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!files || files.length === 0) return NextResponse.json([]);

  // Coletar IDs que têm arquivo .deleted
  const deletedIds = new Set(
    files.filter(f => f.name.endsWith('.deleted')).map(f => f.name.replace('.deleted', ''))
  );
  // Apenas .json que NÃO têm .deleted
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

  // Data/hora em horário de Brasília
  const now = new Date();
  const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = `${brDate.getFullYear()}-${String(brDate.getMonth()+1).padStart(2,'0')}-${String(brDate.getDate()).padStart(2,'0')}`;
  const hora = brDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  await ensureBucket();

  const { data: files } = await admin.storage.from(BUCKET).list(dir(today));
  if (files) {
    const names = new Set(files.map(f => f.name));
    const hasDeleted = names.has(`${student.id}.deleted`);
    const hasJson    = names.has(`${student.id}.json`);

    // Se tem .deleted E .json → já foi removido, pode re-registrar: deleta o .deleted primeiro
    if (hasDeleted) {
      await admin.storage.from(BUCKET).remove([delKey(today, student.id)]);
    }
    // Se tem .json e NÃO tinha .deleted → já registrado hoje
    if (hasJson && !hasDeleted) {
      return NextResponse.json({ success: false, alreadyRegistered: true });
    }
  }

  const record = {
    student_id:    student.id,
    nome_completo: student.nome_completo,
    graduacao:     student.graduacao || '',
    nucleo:        student.nucleo || 'Sem núcleo',
    foto_url:      student.foto_url || null,
    telefone:      student.telefone || '',
    hora,
    timestamp:     now.toISOString(),
  };

  const blob = new Blob([JSON.stringify(record)], { type: 'application/json' });
  const { error } = await admin.storage.from(BUCKET).upload(
    jsonKey(today, student.id), blob, { contentType: 'application/json', upsert: true }
  );

  if (error) {
    console.error('[checkins POST] upload error:', error);
    return NextResponse.json({ success: false, alreadyRegistered: false, error: error.message });
  }
  return NextResponse.json({ success: true, alreadyRegistered: false, record });
}
