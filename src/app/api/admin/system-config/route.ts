import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET = 'photos';
const CONFIG_KEY = 'config/system-config.json';

export interface SystemConfig {
  // Identidade do sistema
  system_name: string;           // Nome do sistema (ex: "Sistema DEMO")
  organization_name: string;     // Nome da organizacao (ex: "Associacao Cultural Demo")
  organization_short: string;    // Sigla (ex: "DEMO")
  logo_url: string;              // URL do logo
  favicon_url: string;           // URL do favicon
  
  // Cores do tema
  primary_color: string;         // Cor primaria
  secondary_color: string;       // Cor secundaria
  accent_color: string;          // Cor de destaque
  
  // Contato
  contact_email: string;
  contact_phone: string;
  contact_whatsapp: string;
  website_url: string;
  
  // Redes sociais
  instagram_url: string;
  facebook_url: string;
  youtube_url: string;
  
  // Texto do rodape
  footer_text: string;
  
  // Configuracoes de carteirinha/ID
  id_prefix: string;             // Prefixo do ID (ex: "DEMO")
  card_title: string;            // Titulo da carteirinha
  card_subtitle: string;         // Subtitulo da carteirinha
  
  // Assinatura padrao
  signature_name: string;        // Nome do assinante
  signature_role: string;        // Cargo do assinante
  signature_image_url: string;   // Imagem da assinatura
  
  // Metadados
  updated_at: string;
  updated_by: string;
}

const DEFAULT_CONFIG: SystemConfig = {
  system_name: 'Sistema DEMO',
  organization_name: 'Sistema de Gestao de Alunos - Demonstrativo',
  organization_short: 'DEMO',
  logo_url: '/logo-barao-maua.png',
  favicon_url: '/favicon.ico',
  
  primary_color: '#1d4ed8',
  secondary_color: '#7c3aed',
  accent_color: '#fbbf24',
  
  contact_email: 'contato@demo.com',
  contact_phone: '',
  contact_whatsapp: '',
  website_url: '',
  
  instagram_url: '',
  facebook_url: '',
  youtube_url: '',
  
  footer_text: 'Sistema de Gestao de Alunos - Versao Demonstrativa',
  
  id_prefix: 'DEMO',
  card_title: 'Sistema de Gestao',
  card_subtitle: 'Credencial de Aluno',
  
  signature_name: 'Administrador do Sistema',
  signature_role: 'Sistema DEMO',
  signature_image_url: '/assinatura-frazao.png',
  
  updated_at: new Date().toISOString(),
  updated_by: 'system',
};

async function loadConfig(): Promise<SystemConfig> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CONFIG_KEY, 30);
    if (!data?.signedUrl) return { ...DEFAULT_CONFIG };
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!res.ok) return { ...DEFAULT_CONFIG };
    const stored = await res.json();
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(config: SystemConfig): Promise<void> {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(CONFIG_KEY, blob, { upsert: true });
}

// GET - Carrega configuracoes
export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - Salva configuracoes (apenas Owner)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { updates, updated_by } = body;
    
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Updates obrigatorios' }, { status: 400 });
    }
    
    const currentConfig = await loadConfig();
    const newConfig: SystemConfig = {
      ...currentConfig,
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: updated_by || 'owner',
    };
    
    await saveConfig(newConfig);
    
    return NextResponse.json({ ok: true, config: newConfig });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
