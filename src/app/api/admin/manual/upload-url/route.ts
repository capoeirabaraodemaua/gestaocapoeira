import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const FOLDER = 'manuais';

/**
 * POST /api/admin/manual/upload-url
 * Body: { filename: string }
 * Returns: { uploadUrl, token, storageKey, signedUrl }
 *
 * The browser uses the uploadUrl to PUT the file directly to Supabase Storage,
 * bypassing any proxy body-size limits.
 */
export async function POST(req: NextRequest) {
  const { filename } = await req.json();
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'pdf') {
    return NextResponse.json({ error: 'Apenas arquivos PDF são aceitos.' }, { status: 400 });
  }

  const ts = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `${FOLDER}/${ts}_${safeName}`;

  // Create a signed upload URL valid for 10 minutes
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storageKey);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Falha ao gerar URL de upload.' }, { status: 500 });
  }

  // Also create a signed read URL for later display
  const { data: readData } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, 3600);

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    token: data.token,
    storageKey,
    name: `${ts}_${safeName}`,
    readUrl: readData?.signedUrl ?? null,
  });
}
