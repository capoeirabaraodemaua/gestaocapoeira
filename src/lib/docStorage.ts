/**
 * docStorage.ts
 * IndexedDB-backed file storage — supports files up to ~50 MB per entry.
 * Falls back to a "too large" error message instead of silently failing.
 */

const DB_NAME    = 'accbm_docs';
const DB_VERSION = 1;
const STORE      = 'files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export interface StoredFile {
  name: string;
  type: string;
  size: number;          // bytes
  data: ArrayBuffer;
}

export async function saveDocFile(key: string, file: File): Promise<void> {
  const MAX = 50 * 1024 * 1024; // 50 MB
  if (file.size > MAX) {
    throw new Error(`O arquivo (${(file.size / 1024 / 1024).toFixed(1)} MB) excede o limite de 50 MB.`);
  }
  const data = await file.arrayBuffer();
  const record: StoredFile = { name: file.name, type: file.type, size: file.size, data };
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const put = tx.objectStore(STORE).put(record, key);
    put.onsuccess = () => resolve();
    put.onerror   = () => reject(put.error);
  });
}

export async function getDocFile(key: string): Promise<StoredFile | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const get = tx.objectStore(STORE).get(key);
    get.onsuccess = () => resolve(get.result ?? null);
    get.onerror   = () => reject(get.error);
  });
}

export async function getDocFileName(key: string): Promise<string | null> {
  const f = await getDocFile(key);
  return f ? f.name : null;
}

export function downloadDocFile(file: StoredFile): void {
  const blob = new Blob([file.data], { type: file.type || 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Tiny localStorage fallback just for file *names* (for fast UI rendering) */
export function cacheFileName(key: string, name: string | null) {
  try {
    if (name) localStorage.setItem(`accbm_fname_${key}`, name);
    else       localStorage.removeItem(`accbm_fname_${key}`);
  } catch {}
}
export function getCachedFileName(key: string): string | null {
  try { return localStorage.getItem(`accbm_fname_${key}`); } catch { return null; }
}
