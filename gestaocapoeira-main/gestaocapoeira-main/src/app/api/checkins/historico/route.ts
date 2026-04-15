import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

async function getActiveIdsForDate(date: string): Promise<string[]> {
  const { data: files, error } = await admin.storage.from(BUCKET).list(`checkins/${date}`);
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

  // Listar subpastas existentes em checkins/
  const { data: folders } = await admin.storage.from(BUCKET).list('checkins');
  if (!folders) return NextResponse.json({});

  // Filtrar apenas pastas de datas (não arquivos .json soltos)
  const brNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const cutoff = new Date(brNow);
  cutoff.setDate(cutoff.getDate() - days);

  const dateFolders = folders
    .filter(f => f.metadata === null && /^\d{4}-\d{2}-\d{2}$/.test(f.name))
    .filter(f => new Date(f.name) >= cutoff)
    .map(f => f.name);

  const results = await Promise.all(
    dateFolders.map(async date => {
      const ids = await getActiveIdsForDate(date);
      return { date, ids };
    })
  );

  const map: Record<string, string[]> = {};
  for (const { date, ids } of results) {
    for (const sid of ids) {
      if (!map[sid]) map[sid] = [];
      map[sid].push(date);
    }
  }

  return NextResponse.json(map);
}
