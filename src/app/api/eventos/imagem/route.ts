import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'photos';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// GET /api/eventos/imagem?path=eventos/media/xxx.jpg
// Proxy autenticado para imagens de eventos no Supabase Storage
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path || !path.startsWith('eventos/media/')) {
    return new NextResponse('Caminho inválido', { status: 400 });
  }

  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return new NextResponse('Não encontrado', { status: 404 });

    const buffer = await data.arrayBuffer();
    const ext = path.split('.').pop()?.toLowerCase() || 'jpg';
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4',
      mov: 'video/quicktime', avi: 'video/x-msvideo',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Erro interno', { status: 500 });
  }
}
