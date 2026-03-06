import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Build the DB connection string from the Supabase URL
  // Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
  const projectRef = url.replace('https://', '').replace('.supabase.co', '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Supabase transaction pooler: postgres://postgres.ref:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
  // We can try the direct connection
  const dbUrl = `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS presencas (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        data_treino DATE NOT NULL,
        hora_registro VARCHAR(10) NOT NULL DEFAULT '',
        nucleo VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(student_id, data_treino)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_presencas_student_id ON presencas(student_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_presencas_data_treino ON presencas(data_treino)`);
    await client.query(`ALTER TABLE presencas ENABLE ROW LEVEL SECURITY`);
    await client.query(`
      DO $do$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='allow_all_presencas') THEN
          CREATE POLICY allow_all_presencas ON presencas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
        END IF;
      END $do$
    `);
    client.release();
    await pool.end();
    return NextResponse.json({ success: true, message: 'Table presencas created successfully!' });
  } catch (error) {
    await pool.end().catch(() => {});
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
