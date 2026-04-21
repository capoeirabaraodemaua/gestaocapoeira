import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET = 'photos';
const LOCAIS_KEY = 'config/locais.json';

export interface Local {
  id: string;
  nome: string;
  endereco: string;
  nucleo: string;
  lat: number;
  lng: number;
  mapUrl: string;
  ativo: boolean;
}

// Locais padrao (fallback)
const DEFAULT_LOCAIS: Local[] = [];

async function loadLocais(): Promise<Local[]> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(LOCAIS_KEY, 30);
    if (!data?.signedUrl) return [...DEFAULT_LOCAIS];
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [...DEFAULT_LOCAIS];
    const stored = await res.json();
    return Array.isArray(stored) ? stored : [...DEFAULT_LOCAIS];
  } catch {
    return [...DEFAULT_LOCAIS];
  }
}

async function saveLocais(locais: Local[]): Promise<void> {
  const blob = new Blob([JSON.stringify(locais, null, 2)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(LOCAIS_KEY, blob, { upsert: true });
}

// GET - Lista todos os locais
export async function GET() {
  try {
    const locais = await loadLocais();
    return NextResponse.json(locais);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - Adiciona ou atualiza local
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, local } = body;
    
    const locais = await loadLocais();
    
    if (action === 'add') {
      // Adiciona novo local
      const newLocal: Local = {
        id: local.id || `local-${Date.now()}`,
        nome: local.nome,
        endereco: local.endereco || '',
        nucleo: local.nucleo || '',
        lat: local.lat || 0,
        lng: local.lng || 0,
        mapUrl: local.mapUrl || `https://maps.google.com/?q=${local.lat || 0},${local.lng || 0}`,
        ativo: local.ativo !== false,
      };
      locais.push(newLocal);
      await saveLocais(locais);
      return NextResponse.json({ ok: true, local: newLocal });
    }
    
    if (action === 'update') {
      const idx = locais.findIndex(l => l.id === local.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Local nao encontrado' }, { status: 404 });
      }
      locais[idx] = { ...locais[idx], ...local };
      await saveLocais(locais);
      return NextResponse.json({ ok: true, local: locais[idx] });
    }
    
    if (action === 'delete') {
      const idx = locais.findIndex(l => l.id === local.id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Local nao encontrado' }, { status: 404 });
      }
      locais.splice(idx, 1);
      await saveLocais(locais);
      return NextResponse.json({ ok: true });
    }
    
    return NextResponse.json({ error: 'Acao invalida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
