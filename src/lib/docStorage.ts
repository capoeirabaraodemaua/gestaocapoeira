/**
 * docStorage.ts
 * Server-backed file storage for shared documents (Estatuto, Regimento, etc.).
 * All Supabase operations go through /api/docs (server-side, uses service_role).
 */

export interface StoredFile {
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
}

/** Save file to Supabase Storage via server API (overwrites if exists) */
export async function saveDocFile(key: string, file: File): Promise<void> {
  const MAX = 50 * 1024 * 1024;
  if (file.size > MAX) {
    throw new Error(`O arquivo (${(file.size / 1024 / 1024).toFixed(1)} MB) excede o limite de 50 MB.`);
  }

  const formData = new FormData();
  formData.append('key', key);
  formData.append('file', file);

  const res = await fetch('/api/docs', { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `Erro ao fazer upload (${res.status})`;
    try { const j = JSON.parse(text); msg = j.error || msg; } catch { if (text) msg = text.slice(0, 200); }
    throw new Error(msg);
  }

  cacheFileName(key, file.name);
}

/** Get stored file metadata + signed URL from server */
export async function getDocMeta(key: string): Promise<{ name: string; type: string; size: number; signedUrl?: string } | null> {
  try {
    const res = await fetch(`/api/docs?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data ?? null;
  } catch {
    return null;
  }
}

/** Download file from Supabase and trigger browser download */
export async function downloadDocFile(key: string, fallbackName = 'documento'): Promise<void> {
  const meta = await getDocMeta(key);
  if (!meta) throw new Error('Arquivo não encontrado.');

  if (!meta.signedUrl) throw new Error('Não foi possível obter o link de download.');

  const res = await fetch(meta.signedUrl);
  if (!res.ok) throw new Error('Erro ao baixar arquivo.');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
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
