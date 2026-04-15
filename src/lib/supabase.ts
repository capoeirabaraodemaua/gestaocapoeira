import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Guard: if env vars are missing (e.g. during SSR/build without .env),
// return a dummy client that won't crash the module — errors surface on actual API calls
const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeAnon = supabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient(safeUrl, safeAnon);

// Cliente admin com service_role — ignora RLS, usado para storage de presenças
export const supabaseAdmin = createClient(
  safeUrl,
  supabaseServiceKey ?? safeAnon,
);
