import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/background.json';

export interface BackgroundConfig {
  url: string | null;   // kept for legacy reads
  path: string | null;  // storage path — used to generate fresh signed URLs
  updated_at: string;
}

const DEFAULT: BackgroundConfig = { url: null, path: null, updated_at: '' };

async function readConfig(): Promise<BackgroundConfig> {
  try {
    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!signed?.signedUrl) return DEFAULT;
    const res = await fetch(signed.signedUrl, { cache: 'no-store' });
    if (!res.ok) return DEFAULT;
    return await res.json();
  } catch {
    return DEFAULT;
  }
}

async function saveConfig(config: BackgroundConfig): Promise<void> {
  const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload(KEY, blob, { upsert: true, contentType: 'application/json' });
}

// GET — returns a fresh signed URL (1 year) so the image always loads
export async function GET() {
  const config = await readConfig();

  // Prefer path-based signed URL; fallback to legacy url field
  const storagePath = config.path;
  if (storagePath) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year
    if (!error && data?.signedUrl) {
      return NextResponse.json({ url: data.signedUrl }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }

  // Legacy: return stored url as-is
  return NextResponse.json({ url: config.url ?? null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  // JSON: delete old file or save config with url/path
  if (contentType.includes('application/json')) {
    const body = await req.json();

    if (body._delete === true) {
      if (!body.path) return NextResponse.json({ error: 'path required' }, { status: 400 });
      await supabaseAdmin.storage.from(BUCKET).remove([body.path]);
      return NextResponse.json({ ok: true });
    }

    if (body.url === undefined && body.path === undefined) {
      return NextResponse.json({ error: 'url or path required' }, { status: 400 });
    }

    await saveConfig({
      url: body.url ?? null,
      path: body.path ?? null,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  }

  // Multipart: upload new background image
  if (contentType.includes('multipart')) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

    const timestamp = Date.now();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeName = `${timestamp}.${ext}`;
    const path = `backgrounds/${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Remove old background file if exists
    const oldConfig = await readConfig();
    if (oldConfig.path && oldConfig.path !== path) {
      await supabaseAdmin.storage.from(BUCKET).remove([oldConfig.path]).catch(() => {});
    }

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, uint8, { upsert: true, contentType: file.type });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Save config with path
    await saveConfig({ url: null, path, updated_at: new Date().toISOString() });

    // Return fresh signed URL
    const { data: signedData } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    return NextResponse.json({ ok: true, url: signedData?.signedUrl ?? null, path });
  }

  return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
}

export async function DELETE() {
  const config = await readConfig();
  if (config.path) {
    await supabaseAdmin.storage.from(BUCKET).remove([config.path]).catch(() => {});
  }
  await saveConfig({ url: null, path: null, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, url: null });
}
