import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

// GET /api/aluno/evolucao?student_id=...&days=365
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('student_id');
  if (!student_id) return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });

  const days = parseInt(searchParams.get('days') || '365', 10);

  // List all date folders in checkins/
  const { data: folders, error } = await admin.storage.from(BUCKET).list('checkins');
  if (error || !folders) return NextResponse.json({ dates: [] });

  const brNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const cutoff = new Date(brNow);
  cutoff.setDate(cutoff.getDate() - days);

  const dateFolders = folders
    .filter(f => f.metadata === null && /^\d{4}-\d{2}-\d{2}$/.test(f.name))
    .filter(f => new Date(f.name) >= cutoff)
    .map(f => f.name)
    .sort();

  // Check which dates have a checkin for this student
  const checks = await Promise.all(
    dateFolders.map(async date => {
      const { data } = await admin.storage.from(BUCKET).list(`checkins/${date}`);
      if (!data) return null;
      const hasFile = data.some(f => f.name === `${student_id}.json`);
      return hasFile ? date : null;
    })
  );

  const dates = checks.filter(Boolean) as string[];

  return NextResponse.json({ dates });
}
