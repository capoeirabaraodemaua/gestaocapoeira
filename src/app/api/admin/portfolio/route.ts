import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const META_KEY = 'config/portfolio.json';
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

type PortfolioItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  mime: string;
  uploaded_at: string;
};

async function loadMeta(): Promise<PortfolioItem[]> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(META_KEY, 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function saveMeta(items: PortfolioItem[]): Promise<void> {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload(META_KEY, blob, { upsert: true });
}

// GET — list portfolio items with signed URLs
export async function GET() {
  const items = await loadMeta();
  const withUrls = await Promise.all(items.map(async item => {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(item.path, 3600);
    return { ...item, url: data?.signedUrl || null };
  }));
  return NextResponse.json(withUrls);
}

// POST — upload a new portfolio file
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Arquivo muito grande. Máximo 50 MB.' }, { status: 413 });
  }

  const ext = file.name.split('.').pop() || 'bin';
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `portfolio/${id}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const blob = new Blob([buffer], { type: file.type });

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, blob, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const item: PortfolioItem = {
    id,
    name: file.name,
    path,
    size: file.size,
    mime: file.type,
    uploaded_at: new Date().toISOString(),
  };

  const items = await loadMeta();
  items.push(item);
  await saveMeta(items);

  const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return NextResponse.json({ ...item, url: urlData?.signedUrl || null });
}

// DELETE — remove a portfolio item
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 });

  const items = await loadMeta();
  const item = items.find(i => i.id === id);
  if (!item) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });

  await supabaseAdmin.storage.from(BUCKET).remove([item.path]);
  const updated = items.filter(i => i.id !== id);
  await saveMeta(updated);

  return NextResponse.json({ success: true });
}
