import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';
const KEY = 'config/manual-videos.json';

export type Platform = 'youtube' | 'spotify' | 'deezer' | 'tiktok' | 'kwai' | 'outro';

export type VideoLink = {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  created_at: string;
};

export function detectPlatform(url: string): Platform {
  try {
    const u = new URL(url);
    const h = u.hostname.replace('www.', '');
    if (h.includes('youtube.com') || h.includes('youtu.be')) return 'youtube';
    if (h.includes('spotify.com')) return 'spotify';
    if (h.includes('deezer.com')) return 'deezer';
    if (h.includes('tiktok.com')) return 'tiktok';
    if (h.includes('kwai.com') || h.includes('kwai.app')) return 'kwai';
  } catch {}
  return 'outro';
}

export function getPlatformEmbed(url: string, platform: Platform): string | null {
  try {
    const u = new URL(url);
    if (platform === 'youtube') {
      const vid = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.pathname.split('/').pop());
      if (vid) return `https://www.youtube.com/embed/${vid}`;
    }
    if (platform === 'spotify') {
      // https://open.spotify.com/track/xxx → https://open.spotify.com/embed/track/xxx
      const path = u.pathname.replace(/^\//, '');
      return `https://open.spotify.com/embed/${path}?utm_source=generator&theme=0`;
    }
    if (platform === 'deezer') {
      // https://www.deezer.com/track/xxx → widget embed
      const match = u.pathname.match(/\/(track|album|playlist)\/(\d+)/);
      if (match) return `https://widget.deezer.com/widget/dark/${match[1]}/${match[2]}`;
    }
  } catch {}
  return null;
}

async function loadVideos(): Promise<VideoLink[]> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!data?.signedUrl) return [];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    const raw = await res.json() as Array<VideoLink & { platform?: Platform }>;
    // Backfill platform if missing (legacy entries)
    return raw.map(v => ({ ...v, platform: v.platform || detectPlatform(v.url) }));
  } catch { return []; }
}

async function saveVideos(videos: VideoLink[]) {
  const buf = Buffer.from(JSON.stringify(videos, null, 2));
  await supabase.storage.from(BUCKET).upload(KEY, buf, { contentType: 'application/json', upsert: true });
}

/** GET — list video/music links */
export async function GET() {
  const videos = await loadVideos();
  return NextResponse.json({ videos });
}

/** POST — add a link */
export async function POST(req: NextRequest) {
  const { title, url } = await req.json();
  if (!title || !url) return NextResponse.json({ error: 'title and url required' }, { status: 400 });

  const videos = await loadVideos();
  const platform = detectPlatform(url.trim());
  const newVideo: VideoLink = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    title: title.trim(),
    url: url.trim(),
    platform,
    created_at: new Date().toISOString(),
  };
  videos.unshift(newVideo);
  await saveVideos(videos);
  return NextResponse.json({ ok: true, video: newVideo });
}

/** DELETE — remove by id */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const videos = await loadVideos();
  await saveVideos(videos.filter(v => v.id !== id));
  return NextResponse.json({ ok: true });
}
