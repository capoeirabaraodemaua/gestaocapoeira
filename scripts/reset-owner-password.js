// Script para resetar a senha do owner para owner123
// Execute: node --env-file-if-exists=/vercel/share/.env.project scripts/reset-owner-password.js

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'photos';
const CREDS_KEY = 'config/panel-credentials.json';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.error('Variaveis de ambiente nao configuradas');
    process.exit(1);
  }
  
  const supabase = createClient(url, key);
  
  // Carrega credenciais existentes
  let creds = {};
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(CREDS_KEY, 30);
    if (data?.signedUrl) {
      const res = await fetch(data.signedUrl, { cache: 'no-store' });
      if (res.ok) creds = await res.json();
    }
  } catch (e) {
    console.log('Arquivo de credenciais nao existe, criando novo...');
  }
  
  // Reseta owner para padrao
  creds.owner = {
    nucleo: 'geral',
    label: 'Owner (Desenvolvedor)',
    color: '#7c3aed',
    password: 'owner123',
    first_login: true,
  };
  
  // Garante admin tambem
  if (!creds.admin) {
    creds.admin = {
      nucleo: 'geral',
      label: 'Admin Geral',
      color: '#1d4ed8',
      password: 'admin123',
      first_login: true,
    };
  }
  
  // Salva
  const blob = new Blob([JSON.stringify(creds, null, 2)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(CREDS_KEY, blob, { upsert: true });
  
  if (error) {
    console.error('Erro ao salvar:', error);
    process.exit(1);
  }
  
  console.log('Senha do owner resetada com sucesso!');
  console.log('Login: owner');
  console.log('Senha: owner123');
  console.log('Voce sera solicitado a trocar a senha no primeiro login.');
}

main();
