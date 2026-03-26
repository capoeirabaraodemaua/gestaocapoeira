import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

export interface EvolucaoEntry {
  date: string;
  nucleo: string | null;
  local_nome: string | null;
  hora: string | null;
}

// GET /api/aluno/evolucao?student_id=...&days=365
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('student_id');
  if (!student_id) return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });

  const days = parseInt(searchParams.get('days') || '365', 10);

  // List all date folders in checkins/
  const { data: folders, error } = await admin.storage.from(BUCKET).list('checkins');
  if (error || !folders) return NextResponse.json({ dates: [], entries: [] });

  const brNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const cutoff = new Date(brNow);
  cutoff.setDate(cutoff.getDate() - days);

  const dateFolders = folders
    .filter(f => f.metadata === null && /^\d{4}-\d{2}-\d{2}$/.test(f.name))
    .filter(f => new Date(f.name) >= cutoff)
    .map(f => f.name)
    .sort();

  // For each date, check if this student has a checkin and read its content
  const checks = await Promise.all(
    dateFolders.map(async (date): Promise<EvolucaoEntry | null> => {
      const { data: files } = await admin.storage.from(BUCKET).list(`checkins/${date}`);
      if (!files) return null;
      const hasFile = files.some(f => f.name === `${student_id}.json`);
      if (!hasFile) return null;

      // Read the checkin JSON to get venue info
      try {
        const { data: signedData } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(`checkins/${date}/${student_id}.json`, 30);
        if (!signedData?.signedUrl) return { date, nucleo: null, local_nome: null, hora: null };
        const res = await fetch(signedData.signedUrl, { cache: 'no-store' });
        if (!res.ok) return { date, nucleo: null, local_nome: null, hora: null };
        const record = await res.json();
        return {
          date,
          nucleo: record.nucleo || null,
          local_nome: record.local_nome || null,
          hora: record.hora || null,
        };
      } catch {
        return { date, nucleo: null, local_nome: null, hora: null };
      }
    })
  );

  const entries = checks.filter(Boolean) as EvolucaoEntry[];
  // Keep backward compat: also return plain dates array
  const dates = entries.map(e => e.date);

  return NextResponse.json({ dates, entries });
}
