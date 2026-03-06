import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/setup — creates checkins table if not exists
export async function GET() {
  const sql = `
    CREATE TABLE IF NOT EXISTS checkins (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      student_id text NOT NULL,
      nome_completo text NOT NULL,
      graduacao text NOT NULL DEFAULT '',
      nucleo text NOT NULL DEFAULT 'Sem núcleo',
      foto_url text,
      telefone text NOT NULL DEFAULT '',
      hora text NOT NULL DEFAULT '',
      timestamp timestamptz NOT NULL DEFAULT now(),
      data date NOT NULL,
      UNIQUE(student_id, data)
    );
    ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'checkins' AND policyname = 'service_role_all'
      ) THEN
        CREATE POLICY service_role_all ON checkins FOR ALL TO service_role USING (true);
      END IF;
    END $$;
  `;

  const { error } = await admin.rpc('exec_sql', { sql }).single();

  // exec_sql might not exist; try direct query as fallback info
  if (error) {
    return NextResponse.json({
      message: 'Could not auto-create table. Run the SQL below in Supabase Dashboard → SQL Editor.',
      sql: `
CREATE TABLE IF NOT EXISTS checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id text NOT NULL,
  nome_completo text NOT NULL,
  graduacao text NOT NULL DEFAULT '',
  nucleo text NOT NULL DEFAULT 'Sem núcleo',
  foto_url text,
  telefone text NOT NULL DEFAULT '',
  hora text NOT NULL DEFAULT '',
  timestamp timestamptz NOT NULL DEFAULT now(),
  data date NOT NULL,
  UNIQUE(student_id, data)
);
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON checkins FOR ALL TO service_role USING (true);
      `.trim(),
      error: error.message,
    });
  }

  return NextResponse.json({ success: true });
}
