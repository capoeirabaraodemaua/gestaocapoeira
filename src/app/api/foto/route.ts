import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';

// GET /api/foto?id=student_id
// Generates a fresh signed URL for the student's profile photo and redirects.
// This avoids storing expiring signed URLs in the DB.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('id');

  if (!student_id) {
    return new NextResponse('Missing id', { status: 400 });
  }

  // Try common extensions
  const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  for (const ext of extensions) {
    const path = `fotos/${student_id}/perfil.${ext}`;
    const { data } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24); // 24h — always fresh

    if (data?.signedUrl) {
      return NextResponse.redirect(data.signedUrl, { status: 302 });
    }
  }

  return new NextResponse('Not found', { status: 404 });
}
