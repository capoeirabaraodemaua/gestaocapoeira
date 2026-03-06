import { supabase } from './supabase';

export interface CheckinRecord {
  student_id: string;
  nome_completo: string;
  graduacao: string;
  nucleo: string;
  foto_url: string | null;
  hora: string; // HH:MM
  timestamp: string; // ISO
}

const BUCKET = 'photos';

const fileKey = (date: string) => `checkins/${date}.json`;

export async function getCheckins(date: string): Promise<CheckinRecord[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(fileKey(date));
  if (error || !data) return [];
  try {
    const text = await data.text();
    return JSON.parse(text) as CheckinRecord[];
  } catch {
    return [];
  }
}

export async function saveCheckins(date: string, records: CheckinRecord[]): Promise<void> {
  const content = JSON.stringify(records);
  const blob = new Blob([content], { type: 'application/json' });
  await supabase.storage
    .from(BUCKET)
    .upload(fileKey(date), blob, { contentType: 'application/json', upsert: true });
}

export async function registerCheckin(student: {
  id: string;
  nome_completo: string;
  graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
}): Promise<{ success: boolean; alreadyRegistered: boolean }> {
  const today = new Date().toISOString().split('T')[0];
  const records = await getCheckins(today);

  // Verifica duplicata
  if (records.some(r => r.student_id === student.id)) {
    return { success: false, alreadyRegistered: true };
  }

  const now = new Date();
  const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const newRecord: CheckinRecord = {
    student_id: student.id,
    nome_completo: student.nome_completo,
    graduacao: student.graduacao,
    nucleo: student.nucleo || 'Sem núcleo',
    foto_url: student.foto_url,
    hora,
    timestamp: now.toISOString(),
  };

  await saveCheckins(today, [...records, newRecord]);
  return { success: true, alreadyRegistered: false };
}
