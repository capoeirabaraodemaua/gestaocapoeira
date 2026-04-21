'use client';

import { useState, useEffect } from 'react';

export interface SystemConfig {
  system_name: string;
  organization_name: string;
  organization_short: string;
  id_prefix: string;
  card_title: string;
  card_subtitle: string;
  signature_name: string;
  signature_role: string;
  contact_email: string;
  contact_phone: string;
  contact_whatsapp: string;
  website_url: string;
  instagram_url: string;
  facebook_url: string;
  youtube_url: string;
  footer_text: string;
  logo_url: string;
  signature_image_url: string;
}

const DEFAULT_CONFIG: SystemConfig = {
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

// Cache global para evitar multiplas requisicoes
let globalConfig: SystemConfig | null = null;
let loadingPromise: Promise<SystemConfig> | null = null;

async function fetchConfig(): Promise<SystemConfig> {
  try {
    const res = await fetch('/api/public/config', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

export function useSystemConfig() {
  const [config, setConfig] = useState<SystemConfig>(globalConfig || DEFAULT_CONFIG);
  const [loading, setLoading] = useState(!globalConfig);

  useEffect(() => {
    if (globalConfig) {
      setConfig(globalConfig);
      setLoading(false);
      return;
    }

    if (!loadingPromise) {
      loadingPromise = fetchConfig();
    }

    loadingPromise.then(cfg => {
      globalConfig = cfg;
      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  return { config, loading };
}

// Funcao para invalidar cache (chamar apos salvar config)
export function invalidateConfigCache() {
  globalConfig = null;
  loadingPromise = null;
}

// Export default config para uso estatico
export { DEFAULT_CONFIG };
