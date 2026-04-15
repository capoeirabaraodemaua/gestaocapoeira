import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'photos';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `eventos/media/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (error) throw new Error(error.message);

    // Usar proxy interno para servir a imagem com autenticação
    const proxyUrl = `/api/eventos/imagem?path=${encodeURIComponent(fileName)}`;

    return NextResponse.json({ ok: true, url: proxyUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro no upload' }, { status: 500 });
  }
}
