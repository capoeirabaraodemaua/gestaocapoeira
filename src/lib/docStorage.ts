/**
 * docStorage.ts
 * Server-backed file storage for shared documents (Estatuto, Regimento, etc.).
 * Files are uploaded DIRECTLY to Supabase Storage via signed upload URLs,
 * bypassing the Next.js server body limit entirely.
 */

export interface StoredFile {
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
}

/**
 * Save file to Supabase Storage via a two-step signed-URL upload.
 * Step 1: server generates a signed upload URL (tiny JSON request).
 * Step 2: browser PUTs the file directly to Supabase (no proxy, no size limit).
 */
export async function saveDocFile(key: string, file: File): Promise<void> {
  const MAX = 50 * 1024 * 1024;
  if (file.size > MAX) {
    throw new Error(`O arquivo (${(file.size / 1024 / 1024).toFixed(1)} MB) excede o limite de 50 MB.`);
  }

  // Step 1 — get a signed upload URL from the server (JSON only, no file)
  const urlRes = await fetch('/api/docs/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, filename: file.name, type: file.type, size: file.size }),
  });

  if (!urlRes.ok) {
    const err = await urlRes.json().catch(() => ({}));
    throw new Error(err.error || `Erro ao obter URL de upload (${urlRes.status})`);
  }

  const { uploadUrl } = await urlRes.json();
  if (!uploadUrl) throw new Error('URL de upload não recebida.');

  // Step 2 — PUT the file directly to Supabase Storage (no proxy, no body limit)
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => `HTTP ${uploadRes.status}`);
    throw new Error(`Erro no upload: ${errText.slice(0, 200)}`);
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
