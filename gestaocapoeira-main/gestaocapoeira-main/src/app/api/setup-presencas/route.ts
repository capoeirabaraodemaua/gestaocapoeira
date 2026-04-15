import { NextResponse } from 'next/server';

export async function GET() {
  // This endpoint provides the SQL to create the presencas table.
  // Run this SQL in your Supabase SQL Editor:
  const sql = `
CREATE TABLE IF NOT EXISTS presencas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  data_treino DATE NOT NULL,
  hora_registro VARCHAR(10) NOT NULL,
  nucleo VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, data_treino)
);
CREATE INDEX IF NOT EXISTS idx_presencas_student_id ON presencas(student_id);
CREATE INDEX IF NOT EXISTS idx_presencas_data_treino ON presencas(data_treino);
ALTER TABLE presencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all" ON presencas FOR ALL USING (true) WITH CHECK (true);
  `.trim();

  return NextResponse.json({ sql, instructions: 'Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)' });
}
