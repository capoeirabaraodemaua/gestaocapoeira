import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

// POST /api/checkins/remove  body: { date, studentId }
export async function POST(req: Request) {
  const { date, studentId } = await req.json();
  if (!date || !studentId) {
    return NextResponse.json({ success: false, error: 'date and studentId required' }, { status: 400 });
  }

  // Cria tombstone — marca como removido sem precisar deletar arquivo
  const blob = new Blob(['1'], { type: 'text/plain' });
  const { error } = await admin.storage.from(BUCKET).upload(
    `checkins/${date}/${studentId}.deleted`,
    blob,
    { upsert: true }
  );

  return NextResponse.json({ success: !error, error: error?.message });
}
