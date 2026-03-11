import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const studentId = formData.get('student_id') as string;
  const tipo = formData.get('tipo') as string; // 'mensalidade' | 'batizado' | 'contribuicao'
  const ref = formData.get('ref') as string; // mes or parcela number

  if (!file || !studentId) {
    return NextResponse.json({ error: 'file and student_id required' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const ts = Date.now();
  const path = `comprovantes/${studentId}/${tipo}_${ref}_${ts}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: file.type,
      upsert: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl, path });
}
