import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/manual-videos.json';

type VideoLink = { id: string; title: string; url: string; created_at: string };

async function loadVideos(): Promise<VideoLink[]> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function saveVideos(videos: VideoLink[]) {
  const buf = Buffer.from(JSON.stringify(videos, null, 2));
  await supabase.storage.from(BUCKET).upload(KEY, buf, { contentType: 'application/json', upsert: true });
}

/** GET — list video links */
export async function GET() {
  const videos = await loadVideos();
  return NextResponse.json({ videos });
}

/** POST — add a video link */
export async function POST(req: NextRequest) {
  const { title, url } = await req.json();
  if (!title || !url) return NextResponse.json({ error: 'title and url required' }, { status: 400 });

  const videos = await loadVideos();
  const newVideo: VideoLink = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    title: title.trim(),
    url: url.trim(),
    created_at: new Date().toISOString(),
  };
  videos.unshift(newVideo);
  await saveVideos(videos);
  return NextResponse.json({ ok: true, video: newVideo });
}

/** DELETE — remove a video link by id */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const videos = await loadVideos();
  const filtered = videos.filter(v => v.id !== id);
  await saveVideos(filtered);
  return NextResponse.json({ ok: true });
}
