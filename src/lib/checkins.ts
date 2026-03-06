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

// Cada check-in é um arquivo próprio: checkins/YYYY-MM-DD/{student_id}.json
// Isso garante que deletar é simplesmente remover o arquivo — sem cache stale.
const checkinKey = (date: string, studentId: string) => `checkins/${date}/${studentId}.json`;
const checkinDir = (date: string) => `checkins/${date}`;

export async function getCheckins(date: string): Promise<CheckinRecord[]> {
  // Lista os arquivos na pasta do dia — esta chamada nunca usa CDN
  const { data: files, error } = await supabase.storage.from(BUCKET).list(checkinDir(date));
  if (error || !files || files.length === 0) return [];

  const jsonFiles = files.filter(f => f.name.endsWith('.json'));
  if (jsonFiles.length === 0) return [];

  // Baixa cada arquivo individualmente em paralelo
  const results = await Promise.all(
    jsonFiles.map(async f => {
      const { data } = await supabase.storage
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
  const key = checkinKey(today, student.id);

  // Verifica se já existe arquivo para este aluno hoje
  const { data: existing } = await supabase.storage.from(BUCKET).download(key);
  if (existing) {
    return { success: false, alreadyRegistered: true };
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
  const { error } = await supabase.storage.from(BUCKET).upload(key, blob, {
    contentType: 'application/json',
    upsert: false, // não deve sobrescrever — protege contra duplo clique
  });

  if (error) {
    // Se falhou por já existir (conflict), é presença duplicada
    if (error.message?.includes('already exists') || error.statusCode === '409') {
      return { success: false, alreadyRegistered: true };
    }
    return { success: false, alreadyRegistered: false };
  }

  return { success: true, alreadyRegistered: false };
}

export async function removeCheckin(date: string, studentId: string): Promise<boolean> {
  // Deleta apenas o arquivo do aluno específico — sem read-modify-write, sem cache
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([checkinKey(date, studentId)]);
  return !error;
}

// Retorna últimos N dias de check-ins agrupados por student_id
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
