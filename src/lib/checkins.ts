import { supabase } from './supabase';

export interface CheckinRecord {
  student_id: string;
  nome_completo: string;
  graduacao: string;
  nucleo: string;
  foto_url: string | null;
  telefone: string;
  hora: string;       // HH:MM
  timestamp: string;  // ISO
}

const BUCKET = 'photos';
const fileKey = (date: string) => `checkins/${date}.json`;

export async function getCheckins(date: string): Promise<CheckinRecord[]> {
  const { data, error } = await supabase.storage.from(BUCKET).download(fileKey(date));
  if (error || !data) return [];
  try { return JSON.parse(await data.text()) as CheckinRecord[]; } catch { return []; }
}

export async function saveCheckins(date: string, records: CheckinRecord[]): Promise<void> {
  const blob = new Blob([JSON.stringify(records)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(fileKey(date), blob, { contentType: 'application/json', upsert: true });
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
