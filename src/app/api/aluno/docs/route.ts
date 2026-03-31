import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

function docsFolder(student_id: string) {
  return `aluno-docs/${student_id}`;
}

const DOC_ICONS: Record<string, string> = {
  pdf:  '📄',
  docx: '📝',
  doc:  '📝',
  xlsx: '📊',
  xls:  '📊',
  pptx: '📊',
  ppt:  '📊',
  jpg:  '🖼️',
  jpeg: '🖼️',
  png:  '🖼️',
  mp4:  '🎬',
  zip:  '📦',
};

function getIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return DOC_ICONS[ext] || '📎';
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** GET /api/aluno/docs?student_id=xxx — list personal documents */
export async function GET(req: NextRequest) {
  const student_id = new URL(req.url).searchParams.get('student_id');
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const folder = docsFolder(student_id);
  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return NextResponse.json({ docs: [] });

  const docs = await Promise.all(
    (files || [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(async f => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(`${folder}/${f.name}`, 3600 * 24); // 24h link
        return {
          name: f.name,
          displayName: f.name.replace(/^\d+_/, '').replace(/_/g, ' '),
          url: data?.signedUrl ?? '',
          icon: getIcon(f.name),
          size: formatSize(f.metadata?.size ?? 0),
          sizeBytes: f.metadata?.size ?? 0,
          created_at: f.created_at ?? '',
          ext: f.name.split('.').pop()?.toLowerCase() || '',
        };
      }),
  );

  return NextResponse.json({ docs });
}

/** DELETE /api/aluno/docs — remove a document */
export async function DELETE(req: NextRequest) {
  const { student_id, name } = await req.json();
  if (!student_id || !name) return NextResponse.json({ error: 'student_id and name required' }, { status: 400 });

  const path = `${docsFolder(student_id)}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
