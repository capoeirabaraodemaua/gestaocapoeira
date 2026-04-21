import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET = 'photos';
const CREDS_KEY = 'config/panel-credentials.json';

// Reset owner password to default (owner123) with first_login: true
export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json();
    
    // Seguranca: requer secret ou env var
    const resetSecret = process.env.OWNER_RESET_SECRET || 'reset-owner-demo-2024';
    if (secret !== resetSecret) {
      return NextResponse.json({ error: 'Secret invalido' }, { status: 403 });
    }

    // Carrega credenciais existentes
    let creds: Record<string, any> = {};
    try {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CREDS_KEY, 30);
      if (data?.signedUrl) {
        const res = await fetch(data.signedUrl, { cache: 'no-store' });
        if (res.ok) creds = await res.json();
      }
    } catch {}

    // Reseta owner para padrao
    creds.owner = {
      nucleo: 'geral',
      label: 'Owner (Desenvolvedor)',
      color: '#7c3aed',
      password: 'owner123',
      first_login: true,
    };

    // Salva
    const blob = new Blob([JSON.stringify(creds)], { type: 'application/json' });
    await supabase.storage.from(BUCKET).upload(CREDS_KEY, blob, { upsert: true });

    return NextResponse.json({ ok: true, message: 'Senha do owner resetada para owner123' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
