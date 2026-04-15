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

// Fetch training days config from storage
async function getTrainingDaysConfig(): Promise<Record<string, number[]>> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/photos/config/training-days.json?t=${Date.now()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) return {};
    return JSON.parse(await res.text());
  } catch {
    return {};
  }
}

// POST /api/checkins  body: { student }
export async function POST(req: Request) {
  const { student } = await req.json();

  // Data/hora em horário de Brasília
  const now = new Date();
  const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = `${brDate.getFullYear()}-${String(brDate.getMonth()+1).padStart(2,'0')}-${String(brDate.getDate()).padStart(2,'0')}`;
  const hora = brDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const todayWeekday = brDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  await ensureBucket();

  // ── Validate training day ─────────────────────────────────────────────────
  const trainingConfig = await getTrainingDaysConfig();
  const studentNucleo: string = student.nucleo || '';
  // Check if the student's nucleo has configured days
  const nucleoKeys = Object.keys(trainingConfig);
  // Try exact match first, then partial match
  let configuredDays: number[] | undefined;
  for (const key of nucleoKeys) {
    if (studentNucleo === key || studentNucleo.includes(key) || key.includes(studentNucleo)) {
      configuredDays = trainingConfig[key];
      break;
    }
  }
  if (!configuredDays) {
    // fallback: check 'Todos' / 'geral' key
    configuredDays = trainingConfig['Todos'] || trainingConfig['geral'];
  }

  if (configuredDays && configuredDays.length > 0) {
    if (!configuredDays.includes(todayWeekday)) {
      const dayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
      const configuredNames = configuredDays.map(d => dayNames[d]).join(', ');
      return NextResponse.json({
        success: false,
        notTrainingDay: true,
        message: `Hoje não é dia de treino para ${studentNucleo || 'seu núcleo'}. Dias configurados: ${configuredNames}.`,
      });
    }
  }

  // ── Validate GPS proximity (100m from any registered venue) ─────────────
  const lat = student.lat ?? null;
  const lng = student.lng ?? null;

  if (lat !== null && lng !== null) {
    // Haversine inline (no browser import)
    const VENUES = [
      { nucleo: 'Poliesportivo Edson Alves',   lat: -22.7077527, lng: -43.1451925 },
      { nucleo: 'Poliesportivo do Ipiranga',   lat: -22.7157655, lng: -43.1791247 },
      { nucleo: 'Saracuruna',                  lat: -22.6746110, lng: -43.2577859 },
      { nucleo: 'Vila Urussaí',                lat: -22.6681359, lng: -43.2545703 },
      { nucleo: 'Jayme Fichman',               lat: -22.6757683, lng: -43.2487348 },
      { nucleo: 'Academia Mais Saúde',         lat: -22.6757683, lng: -43.2487348 },
    ];
    const haversine = (la1: number, lo1: number, la2: number, lo2: number) => {
      const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
      const dLat = toRad(la2 - la1), dLng = toRad(lo2 - lo1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Find the venue matching this student's nucleo (or any venue if nucleo not specified)
    const studentNucleoForGps = student.nucleo || '';
    const targetVenue = VENUES.find(v => v.nucleo === studentNucleoForGps) || null;

    if (targetVenue) {
      const dist = haversine(lat, lng, targetVenue.lat, targetVenue.lng);
      if (dist > 100) {
        return NextResponse.json({
          success: false,
          tooFar: true,
          distance: Math.round(dist),
          message: `Você está a ${Math.round(dist)}m do local de treino. É necessário estar dentro de 100m para registrar presença.`,
        });
      }
    }
  }

  const { data: files } = await admin.storage.from(BUCKET).list(dir(today));
  if (files) {
    const names = new Set(files.map(f => f.name));
    const hasDeleted = names.has(`${student.id}.deleted`);
    const hasJson    = names.has(`${student.id}.json`);

    if (hasDeleted) {
      // Remove tombstone para permitir novo registro
      await admin.storage.from(BUCKET).remove([delKey(today, student.id)]);
    }
    if (hasJson && !hasDeleted) {
      return NextResponse.json({ success: false, alreadyRegistered: true });
    }
  }

  // Build fallback Google Maps URL from GPS coords if no venue URL was provided
  const fallbackMapUrl = (lat !== null && lng !== null)
    ? `https://maps.google.com/?q=${lat},${lng}`
    : null;

  const record = {
    student_id:     student.id,
    nome_completo:  student.nome_completo,
    graduacao:      student.graduacao || '',
    nucleo:         student.nucleo || 'Sem núcleo',
    foto_url:       student.foto_url || null,
    telefone:       student.telefone || '',
    hora,
    timestamp:      now.toISOString(),
    // Localização
    local_nome:     student.local_nome || null,
    local_endereco: student.local_endereco || null,
    local_map_url:  student.local_map_url || fallbackMapUrl,
    lat,
    lng,
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
