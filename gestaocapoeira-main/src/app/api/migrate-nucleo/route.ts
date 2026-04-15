import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from('students')
    .update({ nucleo: 'Poliesportivo Edson Alves' })
    .eq('nucleo', 'Mauá')
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data?.length ?? 0 });
}
