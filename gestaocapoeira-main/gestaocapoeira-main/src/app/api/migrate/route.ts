import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Build the DB connection string from the Supabase URL
  // Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
  const projectRef = url.replace('https://', '').replace('.supabase.co', '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Try multiple pooler regions
  const regions = ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1', 'sa-east-1'];

  for (const region of regions) {
    const dbUrl = `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
    const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });

    try {
      const client = await pool.connect();

      await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT`);
      await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE`);

      client.release();
      await pool.end();
      return NextResponse.json({ success: true, message: `Colunas adicionadas com sucesso! (região: ${region})` });
    } catch (error) {
      await pool.end().catch(() => {});
      const msg = String(error);
      if (msg.includes('Tenant or user not found') || msg.includes('timeout') || msg.includes('ECONNREFUSED')) {
        continue; // try next region
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Não foi possível conectar ao banco em nenhuma região. Use o Supabase Dashboard → SQL Editor.' }, { status: 500 });
}
