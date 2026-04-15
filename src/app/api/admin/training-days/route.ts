import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/training-days.json';

// days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
export interface TrainingDaysConfig {
  [nucleo: string]: number[]; // array of weekday numbers
}

async function getConfig(): Promise<TrainingDaysConfig> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${KEY}?t=${Date.now()}`;
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

async function saveConfig(config: TrainingDaysConfig) {
  const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(KEY, blob, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
}

export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nucleo, days } = body;

  if (!nucleo || !Array.isArray(days)) {
    return NextResponse.json({ error: 'nucleo e days são obrigatórios' }, { status: 400 });
  }

  const config = await getConfig();
  config[nucleo] = days.map(Number).filter(d => d >= 0 && d <= 6);
  await saveConfig(config);

  return NextResponse.json({ ok: true, config });
}
