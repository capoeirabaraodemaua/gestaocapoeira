import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const dir = (date: string) => `checkins/${date}`;

async function getCheckinsForDate(date: string): Promise<string[]> {
  const { data: files, error } = await admin.storage.from(BUCKET).list(dir(date));
  if (error || !files || files.length === 0) return [];

  const deletedIds = new Set(
    files.filter(f => f.name.endsWith('.deleted')).map(f => f.name.replace('.deleted', ''))
  );
  return files
    .filter(f => f.name.endsWith('.json') && !deletedIds.has(f.name.replace('.json', '')))
    .map(f => f.name.replace('.json', ''));
}

// GET /api/checkins/historico?days=30
export async function GET(req: Request) {
  const days = parseInt(new URL(req.url).searchParams.get('days') || '30', 10);

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const results = await Promise.all(
    dates.map(async date => {
      const studentIds = await getCheckinsForDate(date);
      return { date, studentIds };
    })
  );

  // Agrupa por student_id → lista de datas
  const map: Record<string, string[]> = {};
  for (const { date, studentIds } of results) {
    for (const sid of studentIds) {
      if (!map[sid]) map[sid] = [];
      map[sid].push(date);
    }
  }

  return NextResponse.json(map);
}
