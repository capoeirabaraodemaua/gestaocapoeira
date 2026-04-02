import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';

// POST /api/upload-foto
// Generic photo upload used by registration form and admin panel.
// Returns a long-lived signed URL stored in the students table.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const student_id = formData.get('student_id') as string | null;
    const file = formData.get('foto') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo obrigatório.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Apenas imagens são aceitas.' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Imagem deve ter no máximo 5 MB.' }, { status: 400 });
    }

    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    // Use student_id subfolder when available, otherwise use a temp path
    const path = student_id
      ? `fotos/${student_id}/perfil.${ext}`
      : `fotos/temp/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const buf = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error('upload-foto error:', uploadError);
      return NextResponse.json({ error: 'Erro ao fazer upload da foto.' }, { status: 500 });
    }

    // Use a stable proxy URL that always generates a fresh signed URL on demand.
    // This avoids storing expiring tokens in the DB.
    const foto_url = student_id
      ? `/api/foto?id=${encodeURIComponent(student_id)}`
      : null;

    // If student_id provided, update the DB record immediately
    if (student_id && foto_url) {
      await supabaseAdmin.from('students').update({ foto_url }).eq('id', student_id);
    }

    return NextResponse.json({ success: true, foto_url, path });
  } catch (err) {
    console.error('upload-foto error:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
