/**
 * docStorage.ts
 * Supabase Storage-backed file storage for shared documents (Estatuto, Regimento).
 * Files are stored at docs/estatuto and docs/regimento in the 'photos' bucket,
 * making them accessible to ALL users/devices.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase';

const BUCKET = 'photos';
const DOC_PREFIX = 'docs';

export interface StoredFile {
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
}

/** Map storage key → Supabase path */
function toPath(key: string): string {
  // e.g. 'accbm_estatuto' → 'docs/estatuto'
  const slug = key.replace('accbm_', '');
  return `${DOC_PREFIX}/${slug}`;
}

/** Save file to Supabase Storage (overwrites if exists) */
export async function saveDocFile(key: string, file: File): Promise<void> {
  const MAX = 50 * 1024 * 1024;
  if (file.size > MAX) {
    throw new Error(`O arquivo (${(file.size / 1024 / 1024).toFixed(1)} MB) excede o limite de 50 MB.`);
  }
  const path = toPath(key);
  // Store metadata as a separate small JSON sidecar
  const meta = { name: file.name, type: file.type || 'application/octet-stream', size: file.size };
  const metaBlob = new Blob([JSON.stringify(meta)], { type: 'application/json' });
  const { error: metaErr } = await supabase.storage.from(BUCKET).upload(
    `${path}.meta.json`, metaBlob, { upsert: true, contentType: 'application/json' }
  );
  if (metaErr) throw new Error(`Erro ao salvar metadados: ${metaErr.message}`);

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw new Error(`Erro ao fazer upload: ${error.message}`);

  // Also cache name locally for fast UI rendering
  cacheFileName(key, file.name);
}

/** Get public download URL from Supabase Storage */
export async function getDocPublicUrl(key: string): Promise<string | null> {
  const path = toPath(key);
  // Check if file exists by trying to get its metadata
  const meta = await getDocMeta(key);
  if (!meta) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** Get stored file metadata (name, type, size) from sidecar JSON */
export async function getDocMeta(key: string): Promise<{ name: string; type: string; size: number } | null> {
  const path = `${toPath(key)}.meta.json`;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

/** Download file from Supabase and trigger browser download */
export async function downloadDocFile(key: string, fallbackName = 'documento'): Promise<void> {
  const meta = await getDocMeta(key);
  if (!meta) throw new Error('Arquivo não encontrado.');

  const path = toPath(key);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error('Erro ao baixar arquivo.');

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = meta.name || fallbackName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Tiny localStorage fallback just for file *names* (for fast UI rendering) */
export function cacheFileName(key: string, name: string | null) {
  try {
    if (name) localStorage.setItem(`accbm_fname_${key}`, name);
    else localStorage.removeItem(`accbm_fname_${key}`);
  } catch {}
}
export function getCachedFileName(key: string): string | null {
  try { return localStorage.getItem(`accbm_fname_${key}`); } catch { return null; }
}
