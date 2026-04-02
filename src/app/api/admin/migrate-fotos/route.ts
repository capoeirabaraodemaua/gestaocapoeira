import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/admin/migrate-fotos
// Migrates all students with old signed foto_urls to the new stable /api/foto?id= format.
export async function POST(req: NextRequest) {
  try {
    // Fetch all students that have a foto_url but not the new proxy format
    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select('id, foto_url')
      .not('foto_url', 'is', null)
      .not('foto_url', 'ilike', '/api/foto%');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!students || students.length === 0) {
      return NextResponse.json({ message: 'Nenhuma foto para migrar.', migrated: 0 });
    }

    // For each student, check if their photo actually exists in storage,
    // then update to the stable proxy URL
    let migrated = 0;
    let notFound = 0;

    for (const student of students) {
      const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      let found = false;

      for (const ext of extensions) {
        const path = `fotos/${student.id}/perfil.${ext}`;
        const { data } = await supabaseAdmin.storage
          .from('photos')
          .createSignedUrl(path, 60);

        if (data?.signedUrl) {
          // File exists — update to stable proxy URL
          await supabaseAdmin
            .from('students')
            .update({ foto_url: `/api/foto?id=${encodeURIComponent(student.id)}` })
            .eq('id', student.id);
          migrated++;
          found = true;
          break;
        }
      }

      if (!found) {
        // File doesn't exist in storage — clear the broken URL
        await supabaseAdmin
          .from('students')
          .update({ foto_url: null })
          .eq('id', student.id);
        notFound++;
      }
    }

    return NextResponse.json({
      message: `Migração concluída. ${migrated} fotos migradas, ${notFound} URLs inválidas limpas.`,
      migrated,
      notFound,
    });
  } catch (err) {
    console.error('migrate-fotos error:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
