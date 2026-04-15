import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

/**
 * POST /api/financeiro/comprovante
 * Body (JSON): { student_id, tipo, ref, filename, filetype }
 * Returns: { uploadUrl, path, publicUrl }
 *
 * Client PUTs the file directly to Supabase using uploadUrl — no proxy body limit.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // Legacy formData support (fallback, may still hit size limits for large files)
  if (!body) {
    return NextResponse.json({ error: 'Envie os dados como JSON com { student_id, tipo, ref, filename, filetype }.' }, { status: 400 });
  }

  const { student_id, tipo, ref, filename, filetype } = body;
  if (!student_id || !filename) {
    return NextResponse.json({ error: 'student_id and filename required' }, { status: 400 });
  }

  const ext = (filename as string).split('.').pop()?.toLowerCase() || 'jpg';
  const ts = Date.now();
  const path = `comprovantes/${student_id}/${tipo || 'doc'}_${ref || ts}_${ts}.${ext}`;

  // Generate signed upload URL — client uploads directly, no proxy
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Falha ao gerar URL de upload.' }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: urlData.publicUrl,
  });
}
