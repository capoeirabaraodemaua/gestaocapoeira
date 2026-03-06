import { supabaseAdmin } from './supabase';

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
const checkinKey   = (date: string, sid: string) => `checkins/${date}/${sid}.json`;
const tombstoneKey = (date: string, sid: string) => `checkins/${date}/${sid}.deleted`;
const checkinDir   = (date: string) => `checkins/${date}`;

// Todas as operações de storage usam supabaseAdmin (service_role) para
// evitar bloqueio por RLS no bucket público.

export async function getCheckins(date: string): Promise<CheckinRecord[]> {
  const { data: files, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(checkinDir(date));

  if (error || !files || files.length === 0) return [];

  // IDs que têm tombstone (.deleted) → foram removidos pelo admin
  const deletedIds = new Set(
    files
      .filter(f => f.name.endsWith('.deleted'))
      .map(f => f.name.replace('.deleted', ''))
  );

  // Apenas arquivos .json ativos (sem tombstone correspondente)
  const active = files.filter(
    f => f.name.endsWith('.json') && !deletedIds.has(f.name.replace('.json', ''))
  );

  if (active.length === 0) return [];

  const results = await Promise.all(
    active.map(async f => {
      const { data } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(`${checkinDir(date)}/${f.name}`);
      if (!data) return null;
      try { return JSON.parse(await data.text()) as CheckinRecord; }
      catch { return null; }
    })
  );

  return results.filter(Boolean) as CheckinRecord[];
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

  // Verifica tombstone e arquivo ativo
  const { data: files } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(checkinDir(today));

  if (files) {
    const names = files.map(f => f.name);
    const hasTombstone = names.includes(`${student.id}.deleted`);
    const hasCheckin   = names.includes(`${student.id}.json`);
    // Presença existente e não removida
    if (hasCheckin && !hasTombstone) {
      return { success: false, alreadyRegistered: true };
    }
  }

  const now = new Date();
  const record: CheckinRecord = {
    student_id: student.id,
    nome_completo: student.nome_completo,
    graduacao: student.graduacao,
    nucleo: student.nucleo || 'Sem núcleo',
    foto_url: student.foto_url,
    telefone: student.telefone || '',
    hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    timestamp: now.toISOString(),
  };

  const blob = new Blob([JSON.stringify(record)], { type: 'application/json' });
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(checkinKey(today, student.id), blob, {
      contentType: 'application/json',
      upsert: true, // permite re-registrar após remoção do tombstone
    });

  if (error) return { success: false, alreadyRegistered: false };
  return { success: true, alreadyRegistered: false };
}

export async function removeCheckin(date: string, studentId: string): Promise<boolean> {
  // Grava um tombstone — não precisa deletar nada, evita todo problema de cache
  const blob = new Blob(['1'], { type: 'text/plain' });
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(tombstoneKey(date, studentId), blob, { upsert: true });
  return !error;
}

// Retorna últimos N dias agrupados por student_id
export async function getHistorico(days = 30): Promise<Record<string, string[]>> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  const results = await Promise.all(
    dates.map(d => getCheckins(d).then(recs => ({ date: d, recs })))
  );
  const map: Record<string, string[]> = {};
  for (const { date, recs } of results) {
    for (const r of recs) {
      if (!map[r.student_id]) map[r.student_id] = [];
      map[r.student_id].push(date);
    }
  }
  return map;
}
