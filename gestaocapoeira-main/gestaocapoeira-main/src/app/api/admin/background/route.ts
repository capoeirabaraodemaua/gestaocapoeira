import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/background.json';

export interface BackgroundConfig {
  url: string | null;
  updated_at: string;
}

const DEFAULT: BackgroundConfig = {
  url: null,
  updated_at: '',
};

async function readConfig(): Promise<BackgroundConfig> {
  try {
    const { data: urlData } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(KEY, 10);
    if (!urlData?.signedUrl) return DEFAULT;
    const res = await fetch(urlData.signedUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    if (!res.ok) return DEFAULT;
    return await res.json();
  } catch {
    return DEFAULT;
  }
}

async function saveConfig(config: BackgroundConfig): Promise<void> {
  const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
  await supabaseAdmin.storage
    .from(BUCKET)
    .upload(KEY, blob, { upsert: true, contentType: 'application/json' });
}

export async function GET() {
  const config = await readConfig();
  return NextResponse.json({ url: config.url });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';

  // Handle file deletion
  if (contentType.includes('application/json')) {
    const body = await req.json();

    if (body._delete === true) {
      if (!body.path) {
        return NextResponse.json({ error: 'path required' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([body.path]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Save config with URL
    if (body.url === undefined) {
      return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    const config: BackgroundConfig = {
      url: body.url,
      updated_at: new Date().toISOString(),
    };
    await saveConfig(config);
    return NextResponse.json({ ok: true, url: config.url });
  }

  // Handle multipart file upload
  if (contentType.includes('multipart')) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `backgrounds/${timestamp}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, uint8, { upsert: false, contentType: file.type });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return NextResponse.json({ ok: true, url: publicUrlData.publicUrl, path });
  }

  return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
}

export async function DELETE() {
  const config: BackgroundConfig = {
    url: null,
    updated_at: new Date().toISOString(),
  };
  await saveConfig(config);
  return NextResponse.json({ ok: true, url: null });
}
