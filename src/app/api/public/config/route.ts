import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configuracoes padrao para fallback
const DEFAULT_CONFIG = {
  system_name: 'Sistema de Gestao de Alunos DEMO',
  organization_name: 'Organizacao Demo',
  organization_short: 'DEMO',
  id_prefix: 'DEMO',
  card_title: 'Carteira de Identificacao',
  card_subtitle: 'Membro Ativo',
  signature_name: 'Administrador',
  signature_role: 'Coordenador Geral',
  contact_email: 'contato@demo.com',
  contact_phone: '',
  contact_whatsapp: '',
  website_url: '',
  instagram_url: '',
  facebook_url: '',
  youtube_url: '',
  footer_text: 'Sistema de Gestao - Versao Demo',
  logo_url: '',
  signature_image_url: '',
};

// Cache em memoria para evitar consultas frequentes
let cachedConfig: any = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minuto

export async function GET() {
  try {
    // Verifica cache
    if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json(cachedConfig);
    }

    // Busca configuracoes do banco
    const { data, error } = await supabaseAdmin
      .from('system_config')
      .select('*')
      .single();

    if (error || !data) {
      // Retorna config padrao se nao existir
      return NextResponse.json(DEFAULT_CONFIG);
    }

    // Mescla com defaults para garantir todos os campos
    const config = { ...DEFAULT_CONFIG, ...data };
    
    // Atualiza cache
    cachedConfig = config;
    cacheTime = Date.now();

    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}
