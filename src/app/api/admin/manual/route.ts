import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // allow up to 60s for large PDF uploads

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const FOLDER = 'manuais';

/** GET /api/admin/manual — list available manuals */
export async function GET() {
  const { data: files, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(FOLDER, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = await Promise.all(
    (files || [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(async f => {
        const { data } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(`${FOLDER}/${f.name}`, 3600);
        return {
          name: f.name,
          size: f.metadata?.size ?? 0,
          created_at: f.created_at,
          url: data?.signedUrl ?? null,
        };
      }),
  );

  return NextResponse.json({ files: items });
}

/** POST /api/admin/manual — upload a PDF file (multipart/form-data) */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
  if (!['pdf'].includes(ext)) {
    return NextResponse.json({ error: 'Apenas arquivos PDF são aceitos.' }, { status: 400 });
  }

  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `${FOLDER}/${ts}_${safeName}`;

  const buffer = await file.arrayBuffer();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storageKey, buffer, { contentType: 'application/pdf', upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, 3600);

  return NextResponse.json({ ok: true, name: `${ts}_${safeName}`, url: signed?.signedUrl });
}

/** DELETE /api/admin/manual — remove a manual file */
export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([`${FOLDER}/${name}`]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
