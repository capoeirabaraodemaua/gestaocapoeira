import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const DOC_PREFIX = 'docs';

function toPath(key: string): string {
  const slug = key.replace('accbm_', '');
  return `${DOC_PREFIX}/${slug}`;
}

// GET /api/docs?key=accbm_estatuto — returns signed URL + metadata
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const metaPath = `${toPath(key)}.meta.json`;
  const { data: metaData, error: metaError } = await supabaseAdmin.storage.from(BUCKET).download(metaPath);
  if (metaError || !metaData) return NextResponse.json(null);

  try {
    const meta = JSON.parse(await metaData.text());
    // Return signed URL for the actual file (60 min)
    const filePath = toPath(key);
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    return NextResponse.json({ ...meta, signedUrl: urlData?.signedUrl ?? null });
  } catch {
    return NextResponse.json(null);
  }
}

// POST /api/docs — uploads file + meta sidecar
// Accepts multipart/form-data with fields: key, file
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const key = formData.get('key') as string | null;
  const file = formData.get('file') as File | null;

  if (!key || !file) return NextResponse.json({ error: 'key and file required' }, { status: 400 });

  const MAX = 50 * 1024 * 1024;
  if (file.size > MAX) {
    return NextResponse.json({ error: `Arquivo (${(file.size / 1024 / 1024).toFixed(1)} MB) excede limite de 50 MB.` }, { status: 413 });
  }

  const path = toPath(key);

  // Save metadata sidecar
  const meta = { name: file.name, type: file.type || 'application/octet-stream', size: file.size };
  const metaBlob = new Blob([JSON.stringify(meta)], { type: 'application/json' });
  const { error: metaErr } = await supabaseAdmin.storage.from(BUCKET).upload(
    `${path}.meta.json`, metaBlob, { upsert: true, contentType: 'application/json' }
  );
  if (metaErr) return NextResponse.json({ error: `Erro ao salvar metadados: ${metaErr.message}` }, { status: 500 });

  // Save file
  const buffer = await file.arrayBuffer();
  const fileBlob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, fileBlob, {
    upsert: true,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) return NextResponse.json({ error: `Erro ao fazer upload: ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, ...meta });
}

// DELETE /api/docs?key=accbm_estatuto — removes file + meta
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const path = toPath(key);
  await supabaseAdmin.storage.from(BUCKET).remove([path, `${path}.meta.json`]);
  return NextResponse.json({ ok: true });
}
