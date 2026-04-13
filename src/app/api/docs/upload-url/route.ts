import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const DOC_PREFIX = 'docs';

function toPath(key: string): string {
  return `${DOC_PREFIX}/${key.replace('accbm_', '')}`;
}

/**
 * POST /api/docs/upload-url
 * Body: { key, filename, type, size }
 * Returns: { uploadUrl, token, metaPath }
 *
 * Client uses uploadUrl to PUT the file DIRECTLY to Supabase (no proxy body limit).
 * After upload, client calls POST /api/docs/confirm to save the metadata sidecar.
 */
export async function POST(req: NextRequest) {
  const { key, filename, type, size } = await req.json();
  if (!key || !filename) {
    return NextResponse.json({ error: 'key and filename required' }, { status: 400 });
  }

  const MAX = 50 * 1024 * 1024;
  if (size && size > MAX) {
    return NextResponse.json({ error: `Arquivo (${(size / 1024 / 1024).toFixed(1)} MB) excede limite de 50 MB.` }, { status: 413 });
  }

  const filePath = toPath(key);

  // Create signed upload URL (valid 10 min) — client PUTs directly to Supabase
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(filePath);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Falha ao gerar URL de upload.' }, { status: 500 });
  }

  // Pre-save metadata sidecar so it's ready after upload
  const meta = { name: filename, type: type || 'application/octet-stream', size: size || 0 };
  const metaBlob = new Blob([JSON.stringify(meta)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(`${filePath}.meta.json`, metaBlob, {
    upsert: true, contentType: 'application/json',
  });

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    token: data.token,
    filePath,
  });
}
