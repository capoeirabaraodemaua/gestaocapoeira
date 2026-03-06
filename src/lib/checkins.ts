// Todas as operações de storage passam por API routes server-side
// que usam SUPABASE_SERVICE_ROLE_KEY com permissão total.

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

export async function getCheckins(date: string): Promise<CheckinRecord[]> {
  try {
    const res = await fetch(`/api/checkins?date=${date}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json() as CheckinRecord[];
  } catch { return []; }
}

export async function registerCheckin(student: {
  id: string;
  nome_completo: string;
  graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
  telefone: string;
}): Promise<{ success: boolean; alreadyRegistered: boolean }> {
  try {
    const res = await fetch('/api/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student }),
    });
    if (!res.ok) return { success: false, alreadyRegistered: false };
    return await res.json();
  } catch { return { success: false, alreadyRegistered: false }; }
}

export async function removeCheckin(date: string, studentId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/checkins/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, studentId }),
    });
    if (!res.ok) return false;
    const { success } = await res.json();
    return success;
  } catch { return false; }
}

export async function getHistorico(days = 30): Promise<Record<string, string[]>> {
  try {
    const res = await fetch(`/api/checkins/historico?days=${days}`, { cache: 'no-store' });
    if (!res.ok) return {};
    return await res.json() as Record<string, string[]>;
  } catch { return {}; }
}
