import { supabase } from './supabase';

export interface CheckinRecord {
  student_id: string;
  nome_completo: string;
  graduacao: string;
  nucleo: string;
  foto_url: string | null;
  telefone: string;
  hora: string;
  timestamp: string;
}

const BUCKET = 'photos';
const fileKey = (date: string) => `checkins/${date}.json`;

// Baixa o arquivo JSON ignorando cache CDN (adiciona timestamp na URL)
export async function getCheckins(date: string): Promise<CheckinRecord[]> {
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileKey(date));
  if (!urlData?.publicUrl) return [];
  try {
    const res = await fetch(`${urlData.publicUrl}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
    });
    if (!res.ok) return [];
    return await res.json() as CheckinRecord[];
  } catch { return []; }
}

// Salva: remove o arquivo antigo e faz novo upload
export async function saveCheckins(date: string, records: CheckinRecord[]): Promise<void> {
  const blob = new Blob([JSON.stringify(records)], { type: 'application/json' });
  const key = fileKey(date);

  // Remove primeiro para forçar novo arquivo sem CDN stale
  await supabase.storage.from(BUCKET).remove([key]);

  // Aguarda breve instante para o storage propagar a remoção
  await new Promise(r => setTimeout(r, 300));

  const { error } = await supabase.storage.from(BUCKET).upload(key, blob, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw new Error(`Erro ao salvar presenças: ${error.message}`);
}

export async function registerCheckin(student: {
  id: string;
  nome_completo: string;
  graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
  telefone: string;
}): Promise<{ success: boolean; alreadyRegistered: boolean }> {
  const today = new Date().toISOString().split('T')[0];
  const records = await getCheckins(today);
  if (records.some(r => r.student_id === student.id)) {
    return { success: false, alreadyRegistered: true };
  }
  const now = new Date();
  await saveCheckins(today, [...records, {
    student_id: student.id,
    nome_completo: student.nome_completo,
    graduacao: student.graduacao,
    nucleo: student.nucleo || 'Sem núcleo',
    foto_url: student.foto_url,
    telefone: student.telefone || '',
    hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    timestamp: now.toISOString(),
  }]);
  return { success: true, alreadyRegistered: false };
}

export async function removeCheckin(date: string, studentId: string): Promise<boolean> {
  const records = await getCheckins(date);
  const updated = records.filter(r => r.student_id !== studentId);
  if (updated.length === records.length) return false;
  await saveCheckins(date, updated);
  return true;
}

// Retorna últimos N dias de check-ins agrupados por student_id
export async function getHistorico(days = 30): Promise<Record<string, string[]>> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  const results = await Promise.all(dates.map(d => getCheckins(d).then(recs => ({ date: d, recs }))));
  const map: Record<string, string[]> = {};
  for (const { date, recs } of results) {
    for (const r of recs) {
      if (!map[r.student_id]) map[r.student_id] = [];
      map[r.student_id].push(date);
    }
  }
  return map;
}
