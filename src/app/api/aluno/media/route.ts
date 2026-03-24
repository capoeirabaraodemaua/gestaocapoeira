import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

function mediaFolder(student_id: string) {
  return `aluno-media/${student_id}`;
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif'];
const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'];

function fileType(name: string): 'foto' | 'video' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return VIDEO_EXTS.includes(ext) ? 'video' : 'foto';
}

/** GET /api/aluno/media?student_id=xxx — list student's uploaded media */
export async function GET(req: NextRequest) {
  const student_id = new URL(req.url).searchParams.get('student_id');
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const folder = mediaFolder(student_id);
  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = await Promise.all(
    (files || [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(async f => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(`${folder}/${f.name}`, 3600);
        return {
          name: f.name,
          url: data?.signedUrl ?? '',
          type: fileType(f.name),
          size: f.metadata?.size ?? 0,
          created_at: f.created_at ?? '',
        };
      }),
  );

  return NextResponse.json({ files: items });
}

/** POST /api/aluno/media — upload a photo or video */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const file = fd.get('file') as File | null;
  const student_id = fd.get('student_id') as string | null;

  if (!file || !student_id) return NextResponse.json({ error: 'file and student_id required' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo muito grande. Máximo 50 MB.' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const allowed = [...IMAGE_EXTS, ...VIDEO_EXTS];
  if (!allowed.includes(ext)) return NextResponse.json({ error: 'Formato não permitido.' }, { status: 400 });

  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\s+/g, '_');
  const storageName = `${ts}_${safeName}`;
  const path = `${mediaFolder(student_id)}/${storageName}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, name: storageName });
}

/** DELETE /api/aluno/media — remove a file */
export async function DELETE(req: NextRequest) {
  const { student_id, name } = await req.json();
  if (!student_id || !name) return NextResponse.json({ error: 'student_id and name required' }, { status: 400 });

  const path = `${mediaFolder(student_id)}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
