import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';

function playlistKey(student_id: string) {
  return `playlists/${student_id}.json`;
}

type PlaylistItem = {
  id: string;
  title: string;
  url: string;
  platform: string;
  created_at: string;
};

async function loadPlaylist(student_id: string): Promise<PlaylistItem[]> {
  try {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(playlistKey(student_id), 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function savePlaylist(student_id: string, items: PlaylistItem[]): Promise<void> {
  const blob = new Blob([JSON.stringify(items)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET).upload(playlistKey(student_id), blob, { upsert: true });
}

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('spotify.com')) return 'spotify';
  if (u.includes('deezer.com')) return 'deezer';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('kwai.com')) return 'kwai';
  if (u.includes('tiktok.com')) return 'tiktok';
  return 'link';
}

// GET /api/aluno/playlist?student_id=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('student_id');
  if (!student_id) return NextResponse.json({ error: 'student_id obrigatório.' }, { status: 400 });
  const items = await loadPlaylist(student_id);
  return NextResponse.json(items);
}

// POST /api/aluno/playlist — add item
export async function POST(req: NextRequest) {
  const { student_id, title, url } = await req.json();
  if (!student_id || !url) return NextResponse.json({ error: 'student_id e url são obrigatórios.' }, { status: 400 });

  // Basic URL validation
  try { new URL(url); } catch { return NextResponse.json({ error: 'URL inválida.' }, { status: 400 }); }

  const items = await loadPlaylist(student_id);
  if (items.length >= 100) return NextResponse.json({ error: 'Limite de 100 itens atingido.' }, { status: 400 });

  const newItem: PlaylistItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: (title || url).trim().slice(0, 120),
    url: url.trim(),
    platform: detectPlatform(url),
    created_at: new Date().toISOString(),
  };

  await savePlaylist(student_id, [newItem, ...items]);
  return NextResponse.json({ ok: true, item: newItem });
}

// PUT /api/aluno/playlist — edit item
export async function PUT(req: NextRequest) {
  const { student_id, id, title, url } = await req.json();
  if (!student_id || !id) return NextResponse.json({ error: 'student_id e id são obrigatórios.' }, { status: 400 });

  const items = await loadPlaylist(student_id);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });

  if (url) { try { new URL(url); } catch { return NextResponse.json({ error: 'URL inválida.' }, { status: 400 }); } }

  items[idx] = {
    ...items[idx],
    title: title ? title.trim().slice(0, 120) : items[idx].title,
    url: url ? url.trim() : items[idx].url,
    platform: url ? detectPlatform(url) : items[idx].platform,
  };

  await savePlaylist(student_id, items);
  return NextResponse.json({ ok: true, item: items[idx] });
}

// DELETE /api/aluno/playlist
export async function DELETE(req: NextRequest) {
  const { student_id, id } = await req.json();
  if (!student_id || !id) return NextResponse.json({ error: 'student_id e id são obrigatórios.' }, { status: 400 });

  const items = await loadPlaylist(student_id);
  const filtered = items.filter(i => i.id !== id);
  await savePlaylist(student_id, filtered);
  return NextResponse.json({ ok: true });
}
