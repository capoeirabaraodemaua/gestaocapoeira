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

  // Deleta o arquivo .json diretamente (remoção real, sem tombstone)
  const { error } = await admin.storage.from(BUCKET).remove([
    `checkins/${date}/${studentId}.json`,
  ]);

  // Também remove tombstone se existir (limpeza)
  await admin.storage.from(BUCKET).remove([`checkins/${date}/${studentId}.deleted`]);

  return NextResponse.json({ success: !error, error: error?.message });
}
