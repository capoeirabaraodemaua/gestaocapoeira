'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getCordaColors, graduacoes, nomenclaturaGraduacao } from '@/lib/graduacoes';
import { getCheckins, getHistorico, removeCheckin, CheckinRecord } from '@/lib/checkins';
import Link from 'next/link';
import Carteirinha from '@/components/Carteirinha';
import DocumentsBar from '@/components/DocumentsBar';

interface PresencaCount {
  student_id: string;
  count: number;
}

interface TermoEnviado {
  sent_at: string;   // ISO timestamp
  sent_count: number;
}

const hoje = () => {
  const now = new Date();
  const br = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${br.getFullYear()}-${String(br.getMonth()+1).padStart(2,'0')}-${String(br.getDate()).padStart(2,'0')}`;
};

const BUCKET = 'photos';

async function registrarTermoEnviado(studentId: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const key = `termos-enviados/${studentId}.json`;
  // Lê registro anterior para incrementar contagem
  let prev: TermoEnviado = { sent_at: '', sent_count: 0 };
  const { data } = await admin.storage.from(BUCKET).download(key);
  if (data) {
    try { prev = JSON.parse(await data.text()); } catch {}
  }
  const record: TermoEnviado = {
    sent_at: new Date().toISOString(),
    sent_count: (prev.sent_count || 0) + 1,
  };
  await admin.storage.from(BUCKET).upload(
    key,
    new Blob([JSON.stringify(record)], { type: 'application/json' }),
    { upsert: true },
  );
  return record;
}

async function carregarTermosEnviados(studentIds: string[]): Promise<Record<string, TermoEnviado>> {
  if (!studentIds.length) return {};
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const result: Record<string, TermoEnviado> = {};
  await Promise.all(studentIds.map(async (id) => {
    const { data } = await admin.storage.from(BUCKET).download(`termos-enviados/${id}.json`);
    if (data) {
      try { result[id] = JSON.parse(await data.text()); } catch {}
    }
  }));
  return result;
}

interface Student {
  id: string;
  nome_completo: string;
  cpf: string;
  identidade: string;
  data_nascimento: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  graduacao: string;
  tipo_graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
  nome_pai: string;
  nome_mae: string;
  autoriza_imagem: boolean;
  menor_de_idade: boolean;
  nome_responsavel: string | null;
  cpf_responsavel: string | null;
  assinatura_responsavel: boolean;
  created_at: string;
  ultimo_checkin?: string | null;
  checkin_nucleo?: string | null;
}

type EditForm = Partial<Student>;

// ─── Auth helpers ────────────────────────────────────────────────────────────
type NucleoKey = 'maua' | 'saracuruna' | 'geral';
interface Profile { user: string; pass: string; nucleo: NucleoKey; label: string; color: string; }

const PROFILES_KEY = 'accbm_admin_profiles';
const DEFAULT_PROFILES: Profile[] = [
  { nucleo: 'maua',        label: 'Núcleo Mauá',        color: '#dc2626', user: 'maua',        pass: 'maua2025'        },
  { nucleo: 'saracuruna',  label: 'Núcleo Saracuruna',  color: '#16a34a', user: 'saracuruna',  pass: 'sara2025'        },
  { nucleo: 'geral',       label: 'Admin Geral',         color: '#1d4ed8', user: 'admin',       pass: 'accbm2025'       },
];

function getProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_PROFILES;
}
function saveProfiles(profiles: Profile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [activeNucleo, setActiveNucleo] = useState<NucleoKey | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPass, setShowPass] = useState(false);
  // Change-credentials modal
  const [showChangeCreds, setShowChangeCreds] = useState(false);
  const [editingProfile, setEditingProfile] = useState<NucleoKey>('maua');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeDone, setChangeDone] = useState(false);

  // Check session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_auth');
    if (saved) { setAuthed(true); setActiveNucleo(saved as NucleoKey); }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const profiles = getProfiles();
    const match = profiles.find(p => p.user === loginUser.trim() && p.pass === loginPass);
    if (match) {
      sessionStorage.setItem('admin_auth', match.nucleo);
      setAuthed(true);
      setActiveNucleo(match.nucleo);
      setLoginError('');
    } else {
      setLoginError('Usuário ou senha incorretos.');
    }
  };

  const handleChangeCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.trim()) { setChangeError('Informe o novo usuário.'); return; }
    if (newPass.length < 6) { setChangeError('Senha deve ter ao menos 6 caracteres.'); return; }
    if (newPass !== newPassConfirm) { setChangeError('As senhas não coincidem.'); return; }
    const profiles = getProfiles();
    const updated = profiles.map(p => p.nucleo === editingProfile ? { ...p, user: newUser.trim(), pass: newPass } : p);
    saveProfiles(updated);
    setChangeDone(true);
    setTimeout(() => {
      setChangeDone(false); setShowChangeCreds(false);
      setNewUser(''); setNewPass(''); setNewPassConfirm(''); setChangeError('');
    }, 2000);
  };

  const currentProfile = getProfiles().find(p => p.nucleo === activeNucleo);

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterNucleo, setFilterNucleo] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'alunos' | 'presencas' | 'relatorio' | 'ranking' | 'certificado'>('alunos');
  const [relatorioHistorico, setRelatorioHistorico] = useState<Record<string, string[]>>({});
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [relDias, setRelDias] = useState(30);
  const [presencas, setPresencas] = useState<PresencaCount[]>([]);
  const [totalTreinos, setTotalTreinos] = useState(0);
  const [filterPresencaNucleo, setFilterPresencaNucleo] = useState('');
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [historico, setHistorico] = useState<Record<string, string[]>>({});
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [chartStudent, setChartStudent] = useState<Student | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<CheckinRecord | null>(null);
  const [removing, setRemoving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingCheckins, setLoadingCheckins] = useState(false);
  const [checkinsError, setCheckinsError] = useState<string | null>(null);
  const [termosEnviados, setTermosEnviados] = useState<Record<string, TermoEnviado>>({});
  const [presencaDate, setPresencaDate] = useState(hoje());
  const [undoStack, setUndoStack] = useState<CheckinRecord[]>([]);
  const [undoVisible, setUndoVisible] = useState(false);
  const [showCarteirinha, setShowCarteirinha] = useState(false);
  const adminCardRef = useRef<HTMLDivElement>(null);
  const certRef = useRef<HTMLDivElement>(null);

  // ── Certificado state ─────────────────────────────────────────────────────
  const [certStudent, setCertStudent] = useState<Student | null>(null);
  const [certGraduacao, setCertGraduacao] = useState('');
  const [certEvento, setCertEvento] = useState('');
  const [certLocal, setCertLocal] = useState('');
  const [certData, setCertData] = useState(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  });
  const [certSearch, setCertSearch] = useState('');
  const [certFilteredStudents, setCertFilteredStudents] = useState<Student[]>([]);
  const [certTemplateUrl, setCertTemplateUrl] = useState<string | null>(null);
  const [certTemplateName, setCertTemplateName] = useState<string | null>(null);
  const certTemplateInputRef = useRef<HTMLInputElement>(null);

  // ── Offline sync validation state ──────────────────────────────────────────
  const OFFLINE_QUEUE_KEY = 'accbm_offline_checkins';
  const [offlinePending, setOfflinePending] = useState<Array<{ student: { id: string; nome_completo: string; graduacao: string; nucleo: string | null; foto_url: string | null }; date: string; hora: string; localNome: string | null }>>([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [syncOfflineResult, setSyncOfflineResult] = useState<{ ok: number; fail: number } | null>(null);
  const [rankingNucleoTab, setRankingNucleoTab] = useState<'todos' | 'maua' | 'saracuruna'>('todos');

  const printAdminCard = (nome: string) => {
    const el = adminCardRef.current;
    if (!el) return;
    const pw = window.open('', '_blank');
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Credencial — ${nome}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
      @page { size: A6 landscape; margin: 6mm; }
      html,body { width:100%; height:100%; background:#1a1a2e; display:flex; justify-content:center; align-items:center; font-family:Inter,Arial,sans-serif; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      @media print {
        html, body { background:#1a1a2e !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
        * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
      }
    </style>
    </head><body>${el.innerHTML}<script>window.onload=()=>{window.print();setTimeout(()=>pw.close(),1500);}<\/script></body></html>`);
    pw.document.close();
  };

  useEffect(() => {
    fetchStudents();
    fetchPresencas();
    // Load offline queue for admin validation
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (raw) setOfflinePending(JSON.parse(raw));
    } catch {}
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const list = data as Student[];
      setStudents(list);
      // Carrega registros de termos enviados para alunos menores
      const menoresIds = list.filter(s => s.menor_de_idade).map(s => s.id);
      if (menoresIds.length) {
        carregarTermosEnviados(menoresIds).then(setTermosEnviados);
      }
    }
    setLoading(false);
  };

  const fetchPresencas = async (showSpinner = false, dateOverride?: string) => {
    if (showSpinner) setRefreshing(true);
    setLoadingCheckins(true);
    setCheckinsError(null);
    const fetchDate = dateOverride || presencaDate;
    try {
      const res = await fetch(`/api/checkins?date=${fetchDate}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCheckinsError(body.error || `Erro HTTP ${res.status}`);
        setCheckins([]);
      } else {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCheckins(data);
        } else {
          setCheckinsError(data.error || 'Resposta inesperada da API');
          setCheckins([]);
        }
      }
    } catch (e: unknown) {
      setCheckinsError(e instanceof Error ? e.message : 'Erro ao buscar presenças');
      setCheckins([]);
    } finally {
      setLoadingCheckins(false);
      if (showSpinner) setRefreshing(false);
    }
  };

  const fetchHistorico = async () => {
    setLoadingHistorico(true);
    const hist = await getHistorico(30);
    setHistorico(hist);
    setLoadingHistorico(false);
  };

  // Restrict students by login profile (Mauá or Saracuruna see only their own)
  const nucleoFilter = activeNucleo === 'maua' ? 'Mauá' : activeNucleo === 'saracuruna' ? 'Saracuruna' : null;
  const filtered = students.filter(s => {
    const matchSearch =
      s.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
      s.cpf.includes(search) ||
      (s.graduacao || '').toLowerCase().includes(search.toLowerCase());
    const matchNucleo = !filterNucleo || s.nucleo === filterNucleo;
    const matchProfile = !nucleoFilter || s.nucleo === nucleoFilter;
    return matchSearch && matchNucleo && matchProfile;
  });

  const menores = students.filter(s => s.menor_de_idade).length;

  const openEdit = (student: Student) => {
    setEditing(student);
    setEditForm({ ...student });
    setSelected(null);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from('students')
      .update({
        nome_completo: editForm.nome_completo,
        cpf: editForm.cpf,
        identidade: editForm.identidade,
        data_nascimento: editForm.data_nascimento,
        telefone: editForm.telefone,
        cep: editForm.cep,
        endereco: editForm.endereco,
        numero: editForm.numero,
        complemento: editForm.complemento,
        bairro: editForm.bairro,
        cidade: editForm.cidade,
        estado: editForm.estado,
        graduacao: editForm.graduacao,
        tipo_graduacao: editForm.tipo_graduacao,
        nucleo: editForm.nucleo,
        nome_pai: editForm.nome_pai,
        nome_mae: editForm.nome_mae,
        nome_responsavel: editForm.nome_responsavel,
        cpf_responsavel: editForm.cpf_responsavel,
      })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      alert('Erro ao salvar. Tente novamente.');
    } else {
      setEditing(null);
      fetchStudents();
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase.from('students').delete().eq('id', deleteConfirm.id);
    if (error) {
      alert('Erro ao excluir. Tente novamente.');
    } else {
      setDeleteConfirm(null);
      setSelected(null);
      fetchStudents();
    }
  };

  const fetchRelatorio = async (dias: number) => {
    setLoadingRelatorio(true);
    const hist = await getHistorico(dias);
    setRelatorioHistorico(hist);
    setLoadingRelatorio(false);
  };

  const syncAllOfflineNow = async () => {
    if (!offlinePending.length) return;
    setSyncingOffline(true);
    let ok = 0; let fail = 0;
    const remaining: typeof offlinePending = [];
    for (const item of offlinePending) {
      try {
        const res = await fetch('/api/checkins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student: item.student, date: item.date }),
        });
        if (res.ok) { ok++; } else { fail++; remaining.push(item); }
      } catch { fail++; remaining.push(item); }
    }
    setOfflinePending(remaining);
    try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining)); } catch {}
    setSyncingOffline(false);
    setSyncOfflineResult({ ok, fail });
    setTimeout(() => setSyncOfflineResult(null), 6000);
    if (ok > 0) fetchPresencas(false, offlinePending[0]?.date);
  };

  const confirmRemoveCheckin = async () => {
    if (!removeConfirm) return;
    setRemoving(true);
    const studentId = removeConfirm.student_id;
    const removedRecord = removeConfirm;
    try {
      await removeCheckin(presencaDate, studentId);
      await new Promise(r => setTimeout(r, 600));
      const fresh = await getCheckins(presencaDate);
      setCheckins(fresh);
      setRemoveConfirm(null);
      // push to undo stack
      setUndoStack(prev => [...prev, removedRecord]);
      setUndoVisible(true);
      setTimeout(() => setUndoVisible(false), 8000);
    } catch {
      alert('Erro ao remover presença. Tente novamente.');
    }
    setRemoving(false);
  };

  const handleUndoCheckin = async (record: CheckinRecord) => {
    try {
      const res = await fetch('/api/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: { id: record.student_id, ...record }, date: presencaDate }),
      });
      if (res.ok) {
        await new Promise(r => setTimeout(r, 600));
        const fresh = await getCheckins(presencaDate);
        setCheckins(fresh);
        setUndoStack(prev => prev.filter(r => r.student_id !== record.student_id));
      }
    } catch {}
  };

  // ── Change-creds modal (shared between login screen and panel) ──────────────
  const ChangeCrendsModal = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 16px', color: '#1e3a8a', fontWeight: 800, fontSize: '1rem' }}>Alterar Login e Senha</h3>
        {changeDone ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>✅ Credenciais salvas!</div>
        ) : (
          <form onSubmit={handleChangeCreds} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Profile selector */}
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>Perfil a alterar</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {getProfiles().map(p => (
                  <button key={p.nucleo} type="button" onClick={() => setEditingProfile(p.nucleo)}
                    style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: `2px solid ${editingProfile === p.nucleo ? p.color : '#e2e8f0'}`, background: editingProfile === p.nucleo ? p.color : '#f8fafc', color: editingProfile === p.nucleo ? '#fff' : '#64748b', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', transition: 'all .15s' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Novo usuário</label>
              <input value={newUser} onChange={e => setNewUser(e.target.value)} placeholder={`ex: ${editingProfile}`} autoFocus
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Nova senha (mín. 6 caracteres)</label>
              <div style={{ position: 'relative' }}>
                <input type={showNewPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••"
                  style={{ width: '100%', padding: '10px 38px 10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                <button type="button" onClick={() => setShowNewPass(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                  {showNewPass ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Confirmar nova senha</label>
              <input type="password" value={newPassConfirm} onChange={e => setNewPassConfirm(e.target.value)} placeholder="••••••••"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {changeError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>⚠ {changeError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => setShowChangeCreds(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#64748b' }}>Cancelar</button>
              <button type="submit" style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>Salvar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (!authed) {
    const profiles = getProfiles();
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e3a8a 50%,#0f172a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-maua.png" alt="ACCBM" style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 10 }} />
          <div style={{ background: 'linear-gradient(90deg,#dc2626,#2563eb,#16a34a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: '1.3rem', fontWeight: 900, letterSpacing: '0.03em' }}>Painel Administrativo</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', marginTop: 4 }}>Associação Cultural de Capoeira Barão de Mauá</div>
        </div>

        {/* Profile cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          {profiles.map(p => (
            <div key={p.nucleo} style={{ background: 'rgba(255,255,255,0.07)', border: `2px solid ${p.color}44`, borderRadius: 12, padding: '14px 20px', textAlign: 'center', minWidth: 110 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, margin: '0 auto 6px' }} />
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>{p.label}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem', marginTop: 2 }}>usuário: {p.user}</div>
            </div>
          ))}
        </div>

        {/* Login form */}
        <div style={{ width: '100%', maxWidth: 360, background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', padding: '28px 24px' }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 5 }}>Usuário</label>
              <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Digite seu usuário" autoFocus
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: '0.95rem', outline: 'none', color: '#fff', background: 'rgba(255,255,255,0.1)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 5 }}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••••"
                  style={{ width: '100%', padding: '11px 40px 11px 14px', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: '0.95rem', outline: 'none', color: '#fff', background: 'rgba(255,255,255,0.1)', boxSizing: 'border-box' }} />
                <button type="button" onClick={() => setShowPass(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0 }}>
                  {showPass ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>
            {loginError && <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 8, padding: '8px 12px', color: '#fca5a5', fontSize: '0.82rem', fontWeight: 600 }}>⚠ {loginError}</div>}
            <button type="submit" style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', marginTop: 4 }}>Entrar</button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { setShowChangeCreds(true); setChangeError(''); setChangeDone(false); setEditingProfile('maua'); }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
              Alterar login / senha
            </button>
          </div>
        </div>

        {showChangeCreds && <ChangeCrendsModal />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="container-wide">
        <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" className="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Voltar ao formulário
          </Link>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Current profile badge */}
            {currentProfile && (
              <div style={{ padding: '4px 10px', borderRadius: 20, background: `${currentProfile.color}22`, border: `1px solid ${currentProfile.color}55`, color: currentProfile.color, fontSize: '0.75rem', fontWeight: 700 }}>
                {currentProfile.label}
              </div>
            )}
            <button
              onClick={() => { setShowChangeCreds(true); setChangeError(''); setChangeDone(false); setEditingProfile(activeNucleo || 'maua'); setNewUser(''); setNewPass(''); setNewPassConfirm(''); }}
              style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.3)', color: '#1d4ed8', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Alterar senha
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('admin_auth'); setAuthed(false); setActiveNucleo(null); }}
              style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sair
            </button>
          </div>
          {showChangeCreds && <ChangeCrendsModal />}
        </div>

        <div className="admin-header">
          <div>
            <h1 style={{
              background: 'linear-gradient(90deg, #dc2626 0%, #2563eb 45%, #16a34a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontSize: '1.9rem',
              fontWeight: 900,
              letterSpacing: '0.03em',
              textShadow: 'none',
              filter: 'drop-shadow(0 2px 8px rgba(37,99,235,0.25))',
            }}>
              Painel Administrativo
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
              Associação Cultural de Capoeira Barão de Mauá
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/presenca" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem' }}>
              ✓ Registrar Presença
            </Link>
            {activeTab === 'alunos' && <>
              <input
                className="search-input"
                placeholder="Buscar por nome, CPF ou graduação..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="search-input"
                style={{ width: 160 }}
                value={filterNucleo}
                onChange={(e) => setFilterNucleo(e.target.value)}
              >
                <option value="">Todos os núcleos</option>
                <option value="Saracuruna">Saracuruna</option>
                <option value="Mauá">Mauá</option>
              </select>
            </>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
          {(['alunos', 'presencas', 'relatorio', 'ranking', 'certificado'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'presencas') fetchPresencas();
                if ((tab === 'relatorio' || tab === 'ranking') && Object.keys(relatorioHistorico).length === 0) fetchRelatorio(relDias);
              }}
              style={{
                padding: '10px 20px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #dc2626' : '2px solid transparent',
                marginBottom: -2,
                color: activeTab === tab ? '#dc2626' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.2s',
              }}
            >
              {tab === 'alunos' ? '👥 Alunos' : tab === 'presencas' ? '📊 Presenças' : tab === 'relatorio' ? '📋 Relatório' : tab === 'ranking' ? '🏆 Ranking' : '🎓 Certificado'}
            </button>
          ))}
        </div>

        {/* ── Documentos ACCBM — after tabs (admin always unlocked) ────── */}
        <DocumentsBar
          adminAlwaysUnlocked
          students={students.map(s => ({ id: s.id, nome_completo: s.nome_completo, telefone: s.telefone, nucleo: s.nucleo, email: (s as any).email }))}
        />

        {activeTab === 'alunos' && (
          <div>
          <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-value">{students.length}</div>
            <div className="stat-label">Total de Alunos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{students.filter(s => s.nucleo === 'Saracuruna').length}</div>
            <div className="stat-label">Núcleo Saracuruna</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{students.filter(s => s.nucleo === 'Mauá').length}</div>
            <div className="stat-label">Núcleo Mauá</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{menores}</div>
            <div className="stat-label">Menores de Idade</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            Carregando alunos...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            {search || filterNucleo ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado ainda.'}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="student-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Nome</th>
                  <th>Núcleo</th>
                  <th>Graduação</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(student => {
                  const colors = getCordaColors(student.graduacao);
                  return (
                    <tr key={student.id}>
                      <td>
                        {student.foto_url ? (
                          <img src={student.foto_url} alt="" className="student-avatar" />
                        ) : (
                          <div className="student-avatar" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{student.nome_completo}</td>
                      <td>
                        <span className={`badge ${student.nucleo === 'Saracuruna' ? 'badge-saracuruna' : student.nucleo === 'Mauá' ? 'badge-maua' : ''}`}>
                          {student.nucleo || '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', width: 40, height: 10, borderRadius: 5, overflow: 'hidden' }}>
                              {colors.map((c, i) => (
                                <div key={i} style={{ flex: 1, background: c }} />
                              ))}
                            </div>
                            <span style={{ fontSize: '0.85rem' }}>{student.graduacao}</span>
                          </div>
                          {nomenclaturaGraduacao[student.graduacao] && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.2)', alignSelf: 'flex-start' }}>
                              {nomenclaturaGraduacao[student.graduacao]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className={`badge ${student.menor_de_idade ? 'badge-minor' : 'badge-adult'}`}>
                            {student.menor_de_idade ? 'Menor' : 'Adulto'}
                          </span>
                          {student.menor_de_idade && (() => {
                            const assinado = student.assinatura_responsavel;
                            const enviado = termosEnviados[student.id];
                            if (assinado) return (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(22,163,74,0.15)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.3)' }}>
                                ✅ Termo assinado
                              </span>
                            );
                            if (enviado) return (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.3)' }}
                                title={`Enviado em ${new Date(enviado.sent_at).toLocaleString('pt-BR')}`}>
                                📨 Enviado {enviado.sent_count > 1 ? `(${enviado.sent_count}×)` : ''} — aguardando assinatura
                              </span>
                            );
                            return null;
                          })()}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(student.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setSelected(student)}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--accent)', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Ver
                          </button>
                          <button
                            onClick={() => openEdit(student)}
                            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => { setChartStudent(student); fetchHistorico(); }}
                            style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            📊
                          </button>
                          {student.menor_de_idade && !student.assinatura_responsavel && (
                            <button
                              onClick={async () => {
                                const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                                const url = `${base}/termo?id=${student.id}`;
                                const phone = (student.telefone || '').replace(/\D/g, '');
                                const br = phone.startsWith('55') ? phone : `55${phone}`;
                                const msg = encodeURIComponent(
`📋 *Termo de Autorização — Capoeira Barão de Mauá*

Olá! Para concluir a inscrição de *${student.nome_completo}*, pedimos que o responsável legal assine o Termo de Autorização pelo link abaixo:

🔗 ${url}

Basta acessar o link, preencher os dados e assinar eletronicamente.

_Associação Cultural de Capoeira Barão de Mauá_`
                                );
                                window.open(`https://wa.me/${br}?text=${msg}`, '_blank');
                                // Registra o envio e atualiza badge
                                const record = await registrarTermoEnviado(student.id);
                                setTermosEnviados(prev => ({ ...prev, [student.id]: record }));
                              }}
                              title="Enviar termo pelo WhatsApp"
                              style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.35)', color: '#25d366', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
                            >
                              📋
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteConfirm(student)}
                            style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </div>
        )}

        {/* ===== ABA PRESENÇAS ===== */}
        {activeTab === 'presencas' && (
          <div>
            {/* Stats */}
            <div className="admin-stats">
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#16a34a' }}>{checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length}</div>
                <div className="stat-label">Presentes {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length}</div>
                <div className="stat-label">Total de Alunos</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#dc2626' }}>
                  {students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length -
                    checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length}
                </div>
                <div className="stat-label">Ausentes {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length > 0
                    ? Math.round((checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length /
                        students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length) * 100)
                    : 0}%
                </div>
                <div className="stat-label">Frequência {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
              </div>
            </div>

            {/* Filtro + data + botão */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="date"
                className="search-input"
                style={{ width: 170 }}
                value={presencaDate}
                max={hoje()}
                onChange={e => {
                  const d = e.target.value;
                  setPresencaDate(d);
                  fetchPresencas(false, d);
                }}
              />
              <select className="search-input" style={{ width: 180 }} value={filterPresencaNucleo} onChange={e => setFilterPresencaNucleo(e.target.value)}>
                <option value="">Todos os núcleos</option>
                <option value="Saracuruna">Saracuruna</option>
                <option value="Mauá">Mauá</option>
              </select>
              <button
                onClick={() => fetchPresencas(true)}
                disabled={refreshing}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: refreshing ? '#16a34a' : 'var(--text-secondary)', padding: '8px 14px', borderRadius: 8, cursor: refreshing ? 'default' : 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
              >
                <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
                {refreshing ? 'Atualizando...' : 'Atualizar'}
              </button>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              <Link href="/presenca" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
                + Registrar Presença
              </Link>
            </div>

            {/* Undo toast */}
            {undoVisible && undoStack.length > 0 && (
              <div style={{ background: 'rgba(30,30,40,0.97)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>
                  Presença de <strong>{undoStack[undoStack.length-1].nome_completo}</strong> removida.
                </span>
                <button
                  onClick={() => handleUndoCheckin(undoStack[undoStack.length-1])}
                  style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)', color: '#a78bfa', padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}
                >
                  ↩ Desfazer
                </button>
                <button
                  onClick={() => setUndoVisible(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', marginLeft: 'auto' }}
                >×</button>
              </div>
            )}

            {/* Lista de presentes */}
            {loadingCheckins ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                Carregando presenças...
              </div>
            ) : checkinsError ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#f87171', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Erro ao carregar presenças</div>
                <div style={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>{checkinsError}</div>
                <button onClick={() => fetchPresencas()} style={{ marginTop: 14, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>Tentar novamente</button>
              </div>
            ) : checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length > 0 ? (
              <div>
                <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  ✓ Presentes {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} ({checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {checkins
                    .filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo)
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map((c, i) => (
                      <div key={c.student_id + i} style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        {c.foto_url
                          ? <img src={c.foto_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(22,163,74,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                            </div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{c.nome_completo}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {c.graduacao} · {c.nucleo}
                          </div>
                          {c.local_nome && (
                            <a
                              href={c.local_map_url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.74rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}
                            >
                              📍 {c.local_nome}
                              {c.local_endereco && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>— {c.local_endereco}</span>}
                            </a>
                          )}
                          {!c.local_nome && c.lat && c.lng && (
                            <a
                              href={`https://maps.google.com/?q=${c.lat},${c.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.74rem', color: '#f59e0b', textDecoration: 'none' }}
                            >
                              📍 Ver no mapa ({c.lat?.toFixed(4)}, {c.lng?.toFixed(4)})
                            </a>
                          )}
                          {!c.local_nome && !c.lat && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              📍 Localização não disponível
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 700 }}>{c.hora}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>check-in</div>
                        </div>
                        <button
                          onClick={() => setRemoveConfirm(c)}
                          title="Remover presença"
                          style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}
                        >
                          🗑
                        </button>
                      </div>
                    ))
                  }
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                Nenhuma presença registrada hoje ainda.
                <br />
                <Link href="/presenca" style={{ color: '#16a34a', fontWeight: 600 }}>Registrar presença →</Link>
              </div>
            )}
          </div>
        )}
      {/* ===== ABA RANKING ===== */}
      {activeTab === 'ranking' && (() => {
        // Núcleo filter
        const rankNucleoLabel = rankingNucleoTab === 'maua' ? 'Mauá' : rankingNucleoTab === 'saracuruna' ? 'Saracuruna' : null;
        const rankStudents = rankNucleoLabel ? students.filter(s => s.nucleo === rankNucleoLabel) : students;

        const rankData = rankStudents.map(s => {
          const dias = relatorioHistorico[s.id] || [];
          return { student: s, presencas: dias.length, pct: Math.round((dias.length / Math.max(relDias, 1)) * 100) };
        });
        const topPresentes = [...rankData].sort((a,b) => b.presencas - a.presencas).slice(0, 15);
        const topFaltas = [...rankData].sort((a,b) => a.presencas - b.presencas).slice(0, 15);
        const medalColors = ['#fbbf24','#94a3b8','#b45309'];
        const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;

        const RankItem = ({ item, i, mode }: { item: typeof rankData[0]; i: number; mode: 'presenca' | 'falta' }) => (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
            background: mode === 'presenca' && i < 3 ? ['rgba(251,191,36,0.1)','rgba(148,163,184,0.1)','rgba(180,83,9,0.08)'][i] : 'var(--bg-input)',
            border: `1px solid ${mode === 'presenca' && i < 3 ? ['rgba(251,191,36,0.35)','rgba(148,163,184,0.3)','rgba(180,83,9,0.25)'][i] : 'var(--border)'}`,
          }}>
            <div style={{ fontSize: mode === 'presenca' && i < 3 ? '1.3rem' : '0.85rem', fontWeight: 700, minWidth: 30, textAlign: 'center', color: mode === 'presenca' && i < 3 ? medalColors[i] : 'var(--text-secondary)' }}>
              {mode === 'presenca' ? medal(i) : `${i+1}º`}
            </div>
            {item.student.foto_url
              ? <img src={item.student.foto_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                </div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.student.nome_completo}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {item.student.graduacao}
                {rankingNucleoTab === 'todos' && <span style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.62rem', fontWeight: 700, background: item.student.nucleo === 'Mauá' ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.1)', color: item.student.nucleo === 'Mauá' ? '#dc2626' : '#16a34a' }}>{item.student.nucleo || '—'}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: mode === 'presenca' ? '#16a34a' : '#dc2626' }}>
                {mode === 'presenca' ? item.presencas : relDias - item.presencas}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{mode === 'presenca' ? `${item.pct}%` : `${item.presencas} pres.`}</div>
            </div>
          </div>
        );

        return (
          <div>
            {/* Offline pending alert */}
            {offlinePending.length > 0 && (
              <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.45)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem' }}>☁️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#b45309' }}>
                    {offlinePending.length} presença(s) offline pendentes de validação
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Registradas sem internet pelos alunos. Clique em "Validar e Sincronizar" para computar no painel.
                  </div>
                  {syncOfflineResult && (
                    <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 700, color: syncOfflineResult.fail === 0 ? '#16a34a' : '#b45309' }}>
                      {syncOfflineResult.fail === 0 ? `✅ ${syncOfflineResult.ok} sincronizada(s) com sucesso!` : `⚠ ${syncOfflineResult.ok} ok, ${syncOfflineResult.fail} falhou.`}
                    </div>
                  )}
                </div>
                <button onClick={syncAllOfflineNow} disabled={syncingOffline}
                  style={{ padding: '9px 16px', background: '#b45309', border: 'none', color: '#fff', borderRadius: 8, cursor: syncingOffline ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: syncingOffline ? 0.7 : 1 }}>
                  {syncingOffline ? '⏳ Sincronizando...' : '✓ Validar e Sincronizar'}
                </button>
              </div>
            )}

            {/* Controls row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Núcleo tabs */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
                {([['todos', '🌐 Todos'], ['maua', '🔴 Mauá'], ['saracuruna', '🟢 Saracuruna']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setRankingNucleoTab(key)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: rankingNucleoTab === key ? 700 : 500,
                      background: rankingNucleoTab === key ? (key === 'maua' ? '#dc2626' : key === 'saracuruna' ? '#16a34a' : '#1d4ed8') : 'transparent',
                      color: rankingNucleoTab === key ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Period */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Período:</span>
                {[7, 15, 30, 60].map(d => (
                  <button key={d} onClick={() => { setRelDias(d); fetchRelatorio(d); }}
                    style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: relDias === d ? 700 : 500,
                      background: relDias === d ? 'var(--accent)' : 'var(--bg-input)',
                      border: relDias === d ? 'none' : '1px solid var(--border)',
                      color: relDias === d ? '#fff' : 'var(--text-secondary)' }}
                  >{d}d</button>
                ))}
                <button onClick={() => fetchRelatorio(relDias)} disabled={loadingRelatorio}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: loadingRelatorio ? '#16a34a' : 'var(--text-secondary)', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
                  <span style={{ display: 'inline-block', animation: loadingRelatorio ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
                </button>
              </div>
            </div>

            {loadingRelatorio ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Carregando ranking...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#16a34a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🏆 Mais Presentes — {relDias} dias
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>({rankStudents.length} alunos)</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {topPresentes.map((item, i) => <RankItem key={item.student.id} item={item} i={i} mode="presenca" />)}
                    {topPresentes.length === 0 && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Sem dados.</div>}
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#dc2626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ⚠ Mais Faltas — {relDias} dias
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>({rankStudents.length} alunos)</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {topFaltas.map((item, i) => <RankItem key={item.student.id} item={item} i={i} mode="falta" />)}
                    {topFaltas.length === 0 && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Sem dados.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== ABA CERTIFICADO ===== */}
      {activeTab === 'certificado' && (() => {
        const profiles = getProfiles();
        const currentProf = profiles.find(p => p.nucleo === activeNucleo);
        const sig = certStudent
          ? (certStudent.nucleo === 'Mauá'
            ? { nome: 'Mestre Márcio da Silva Frazão', cargo: 'Presidente — ACCBM', img: '/assinatura-frazao.png' }
            : { nome: 'Mestre Elionaldo Pontes de Lima', cargo: 'Vice-Presidente — ACCBM', img: '/assinatura-naldo.png' })
          : null;

        const printCertificado = async () => {
          const el = certRef.current;
          if (!el || !certStudent) return;
          const pw = window.open('', '_blank');
          if (!pw) return;
          // Embed template image as base64 if needed
          let templateStyle = '';
          if (certTemplateUrl && certTemplateName?.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            try {
              const resp = await fetch(certTemplateUrl);
              const blob = await resp.blob();
              const b64 = await new Promise<string>(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              templateStyle = `background: url('${b64}') center/cover no-repeat !important;`;
            } catch {}
          }
          pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificado — ${certStudent.nome_completo}</title>
            <style>* { margin:0; padding:0; box-sizing:border-box; } @page { size: A4 landscape; margin: 0; } html,body { width:100%; height:100%; background:#fff; display:flex; justify-content:center; align-items:center; font-family:Georgia,serif; } .cert-wrap { ${templateStyle} }</style>
            </head><body><div class="cert-wrap">${el.innerHTML}</div><script>window.onload=()=>{window.print();setTimeout(()=>pw.close(),1500);}<\/script></body></html>`);
          pw.document.close();
        };

        const sendCertWhatsApp = () => {
          if (!certStudent) return;
          const phone = (certStudent.telefone || '').replace(/\D/g, '');
          const br = phone.startsWith('55') ? phone : `55${phone}`;
          const dataFmt = certData ? new Date(certData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
          const msg = encodeURIComponent(`🎓 *Certificado — Capoeira Barão de Mauá*\n\nOlá, *${certStudent.nome_completo}*!\n\nParabéns pela sua graduação em *${certGraduacao || certStudent.graduacao}*!\n\n📅 Data: ${dataFmt}\n📍 Local: ${certLocal || 'ACCBM'}\n🎉 Evento: ${certEvento || 'Batizado / Troca de Cordas'}\n\n_Associação Cultural de Capoeira Barão de Mauá_\nAxé! 🤸`);
          window.open(`https://wa.me/${br}?text=${msg}`, '_blank');
        };

        const sendCertEmail = () => {
          if (!certStudent) return;
          const dataFmt = certData ? new Date(certData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
          const subject = encodeURIComponent(`Certificado — ${certGraduacao || certStudent.graduacao} — Capoeira Barão de Mauá`);
          const body = encodeURIComponent(`Certificado de Graduação — Capoeira Barão de Mauá\n\nAluno(a): ${certStudent.nome_completo}\nGraduação: ${certGraduacao || certStudent.graduacao}\nEvento: ${certEvento || 'Batizado / Troca de Cordas'}\nData: ${dataFmt}\nLocal: ${certLocal || 'ACCBM'}\n\nParabéns pelo desempenho!\nAssociação Cultural de Capoeira Barão de Mauá\nAxé!`);
          window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
        };

        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>

              {/* Left: form */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>1. Selecionar Aluno</h3>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <input
                    placeholder="Buscar aluno por nome..."
                    value={certSearch}
                    onChange={e => {
                      const q = e.target.value;
                      setCertSearch(q);
                      if (!q.trim()) { setCertFilteredStudents([]); return; }
                      const lower = q.toLowerCase();
                      setCertFilteredStudents(students.filter(s => s.nome_completo.toLowerCase().includes(lower) || s.cpf.includes(q)).slice(0, 6));
                    }}
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: '0.9rem', outline: 'none', background: 'var(--bg-input)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                  {certFilteredStudents.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                      {certFilteredStudents.map(s => (
                        <button key={s.id} onClick={() => {
                          setCertStudent(s);
                          setCertGraduacao(s.graduacao);
                          setCertSearch(s.nome_completo);
                          setCertFilteredStudents([]);
                        }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          {s.foto_url
                            ? <img src={s.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                              </div>
                          }
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s.nome_completo}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.graduacao} · {s.nucleo}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {certStudent && (
                  <div style={{ background: 'rgba(29,78,216,0.07)', border: '1px solid rgba(29,78,216,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {certStudent.foto_url
                      ? <img src={certStudent.foto_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                        </div>
                    }
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{certStudent.nome_completo}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{certStudent.nucleo}</div>
                    </div>
                  </div>
                )}

                {/* Template import section */}
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>2. Modelo de Certificado (Opcional)</h3>
                <div style={{ background: 'var(--bg-input)', border: '1.5px dashed var(--border)', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
                  <input ref={certTemplateInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = URL.createObjectURL(file);
                      setCertTemplateUrl(url);
                      setCertTemplateName(file.name);
                    }}
                  />
                  {certTemplateUrl ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: '1.2rem' }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{certTemplateName}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Modelo carregado — será usado como fundo do certificado</div>
                        </div>
                        <button onClick={() => { setCertTemplateUrl(null); setCertTemplateName(null); if (certTemplateInputRef.current) certTemplateInputRef.current.value = ''; }}
                          style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                          Remover
                        </button>
                      </div>
                      {certTemplateUrl.startsWith('blob:') && (certTemplateName?.match(/\.(jpg|jpeg|png|webp|gif)$/i)) && (
                        <img src={certTemplateUrl} alt="Template" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)' }} />
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 6 }}>📂</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Importar modelo de certificado</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 10 }}>Imagem (JPG, PNG) ou PDF — será usado como fundo</div>
                      <button onClick={() => certTemplateInputRef.current?.click()}
                        style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                        Escolher Arquivo
                      </button>
                    </div>
                  )}
                  {/* Download blank template button */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Não tem um modelo?</span>
                    <button onClick={() => {
                      // Generate and download a blank A4 certificate template as SVG/HTML
                      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 1122 794">
                        <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fffef5"/><stop offset="100%" stop-color="#fefce8"/></linearGradient></defs>
                        <rect width="1122" height="794" fill="url(#bg)"/>
                        <rect x="0" y="0" width="1122" height="8" fill="#dc2626"/>
                        <rect x="374" y="0" width="374" height="8" fill="#1d4ed8"/>
                        <rect x="748" y="0" width="374" height="8" fill="#16a34a"/>
                        <rect x="0" y="786" width="1122" height="8" fill="#16a34a"/>
                        <rect x="374" y="786" width="374" height="8" fill="#1d4ed8"/>
                        <rect x="748" y="786" width="374" height="8" fill="#dc2626"/>
                        <rect x="30" y="20" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="1042" y="20" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="30" y="724" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="1042" y="724" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="50" y="50" width="1022" height="694" fill="none" stroke="#d6cfc3" stroke-width="1" stroke-dasharray="4,4"/>
                        <text x="561" y="130" text-anchor="middle" font-family="Georgia" font-size="11" font-weight="bold" fill="#92400e" letter-spacing="3">ASSOCIAÇÃO CULTURAL DE CAPOEIRA BARÃO DE MAUÁ</text>
                        <line x1="200" y1="155" x2="922" y2="155" stroke="#b45309" stroke-width="1"/>
                        <text x="561" y="220" text-anchor="middle" font-family="Georgia" font-size="54" font-weight="bold" fill="#78350f" letter-spacing="6">CERTIFICADO</text>
                        <text x="561" y="260" text-anchor="middle" font-family="Georgia" font-size="14" fill="#92400e" letter-spacing="3">EVENTO / NOME DO EVENTO AQUI</text>
                        <line x1="200" y1="285" x2="922" y2="285" stroke="#b45309" stroke-width="1"/>
                        <text x="561" y="330" text-anchor="middle" font-family="Georgia" font-size="14" fill="#78350f">Certificamos que</text>
                        <text x="561" y="390" text-anchor="middle" font-family="Georgia" font-size="32" font-weight="bold" fill="#1a1a1a">NOME DO ALUNO</text>
                        <text x="561" y="440" text-anchor="middle" font-family="Georgia" font-size="13" fill="#78350f">concluiu com êxito a graduação em Capoeira, recebendo a</text>
                        <rect x="461" y="460" width="200" height="36" rx="6" fill="none" stroke="#b45309" stroke-width="1.5"/>
                        <text x="561" y="483" text-anchor="middle" font-family="Georgia" font-size="14" font-weight="bold" fill="#78350f">GRADUAÇÃO / CORDA</text>
                        <text x="561" y="540" text-anchor="middle" font-family="Georgia" font-size="12" fill="#92400e">LOCAL — DATA DO EVENTO</text>
                        <line x1="361" y1="660" x2="561" y2="660" stroke="#1e3a8a" stroke-width="1.5"/>
                        <text x="461" y="680" text-anchor="middle" font-family="Georgia" font-size="10" font-weight="bold" fill="#1e3a8a">ASSINATURA DO MESTRE</text>
                        <text x="461" y="694" text-anchor="middle" font-family="Georgia" font-size="9" fill="#3b82f6">Presidente / Vice-Presidente — ACCBM</text>
                      </svg>`;
                      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'modelo-certificado-ACCBM.svg';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Baixar modelo em branco
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>3. Detalhes do Certificado</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Graduação (editável)</label>
                    <select value={certGraduacao} onChange={e => setCertGraduacao(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}>
                      <option value="">— Selecionar graduação —</option>
                      {graduacoes.map(g => <option key={g} value={g}>{g}{nomenclaturaGraduacao[g] ? ` — ${nomenclaturaGraduacao[g]}` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Evento</label>
                    <input value={certEvento} onChange={e => setCertEvento(e.target.value)} placeholder="ex: Batizado e Troca de Cordas 2025"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Local</label>
                    <input value={certLocal} onChange={e => setCertLocal(e.target.value)} placeholder="ex: Poliesportivo Edson Alves, Mauá"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Data do Evento</label>
                    <input type="date" value={certData} onChange={e => setCertData(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {certStudent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                    <button onClick={printCertificado}
                      style={{ padding: '12px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      Imprimir / Salvar PDF
                    </button>
                    <button onClick={sendCertWhatsApp}
                      style={{ padding: '12px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Enviar via WhatsApp
                    </button>
                    <button onClick={sendCertEmail}
                      style={{ padding: '12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.4)', color: '#3b82f6', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      Enviar por E-mail
                    </button>
                  </div>
                )}
              </div>

              {/* Right: preview */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>4. Pré-visualização</h3>
                <div ref={certRef} style={{
                  background: certTemplateUrl && certTemplateName?.match(/\.(jpg|jpeg|png|webp|gif)$/i)
                    ? `url("${certTemplateUrl}") center/cover no-repeat`
                    : 'linear-gradient(145deg, #fffef5 0%, #fefce8 100%)',
                  border: '3px solid #b45309',
                  borderRadius: 8,
                  padding: '32px 28px',
                  fontFamily: 'Georgia, serif',
                  minHeight: 360,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Corner ornaments */}
                  {['top-left','top-right','bottom-left','bottom-right'].map(pos => (
                    <div key={pos} style={{
                      position: 'absolute',
                      [pos.includes('top') ? 'top' : 'bottom']: 8,
                      [pos.includes('left') ? 'left' : 'right']: 8,
                      width: 32, height: 32,
                      borderTop: pos.includes('top') ? '3px solid #b45309' : 'none',
                      borderBottom: pos.includes('bottom') ? '3px solid #b45309' : 'none',
                      borderLeft: pos.includes('left') ? '3px solid #b45309' : 'none',
                      borderRight: pos.includes('right') ? '3px solid #b45309' : 'none',
                    }} />
                  ))}
                  {/* Tricolor top stripe */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, display: 'flex' }}>
                    <div style={{ flex: 1, background: '#dc2626' }} />
                    <div style={{ flex: 1, background: '#1d4ed8' }} />
                    <div style={{ flex: 1, background: '#16a34a' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {/* Logo + org name */}
                    <img src="/logo-maua.png" alt="ACCBM" style={{ width: 52, height: 52, objectFit: 'contain', marginBottom: 4 }} />
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#92400e' }}>
                      Associação Cultural de Capoeira Barão de Mauá
                    </div>
                    <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#b45309,transparent)', margin: '10px 0' }} />
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#78350f', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                      Certificado
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#92400e', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
                      {certEvento || 'Batizado e Troca de Cordas'}
                    </div>
                    <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#b45309,transparent)', margin: '10px 0' }} />
                    <div style={{ fontSize: '0.62rem', color: '#78350f', marginBottom: 6 }}>Certificamos que</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1a1a1a', fontFamily: 'Georgia, serif', marginBottom: 6, minHeight: 28 }}>
                      {certStudent ? certStudent.nome_completo : <span style={{ color: '#d4b896', fontStyle: 'italic' }}>Nome do Aluno</span>}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#78350f', marginBottom: 4 }}>
                      concluiu com êxito a graduação em Capoeira, recebendo a
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.3)', borderRadius: 6, padding: '5px 14px', marginBottom: 6 }}>
                      {certGraduacao && (() => {
                        const colors = getCordaColors(certGraduacao);
                        return (
                          <div style={{ display: 'flex', width: 28, height: 6, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                            {colors.map((c: string, i: number) => <div key={i} style={{ flex: 1, background: c === '#FFFFFF' ? '#e5e7eb' : c }} />)}
                          </div>
                        );
                      })()}
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#78350f' }}>
                        {certGraduacao || <span style={{ color: '#d4b896', fontStyle: 'italic' }}>graduação</span>}
                      </span>
                      {certGraduacao && nomenclaturaGraduacao[certGraduacao] && (
                        <span style={{ fontSize: '0.62rem', color: '#92400e' }}>— {nomenclaturaGraduacao[certGraduacao]}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: '#92400e', marginBottom: 10 }}>
                      {certLocal || <span style={{ color: '#d4b896', fontStyle: 'italic' }}>Local do evento</span>}
                      {certData && <span> · {new Date(certData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                    </div>
                    {sig && (
                      <div style={{ marginTop: 8 }}>
                        <img src={sig.img} alt="Assinatura" style={{ height: 36, maxWidth: 120, objectFit: 'contain' }} />
                        <div style={{ fontSize: '0.54rem', fontWeight: 700, color: '#1e3a8a' }}>{sig.nome}</div>
                        <div style={{ fontSize: '0.48rem', color: '#3b82f6' }}>{sig.cargo}</div>
                      </div>
                    )}
                  </div>
                  {/* Bottom stripe */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, display: 'flex' }}>
                    <div style={{ flex: 1, background: '#16a34a' }} />
                    <div style={{ flex: 1, background: '#1d4ed8' }} />
                    <div style={{ flex: 1, background: '#dc2626' }} />
                  </div>
                </div>
                {!certStudent && (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 10 }}>
                    Selecione um aluno para ver a pré-visualização
                  </p>
                )}

                {/* Action buttons below preview */}
                {certStudent && (
                  <div style={{ marginTop: 16, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      Ações do Certificado
                    </div>
                    <button onClick={printCertificado}
                      style={{ padding: '13px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      🖨 Imprimir / Salvar PDF
                    </button>
                    <button onClick={sendCertWhatsApp}
                      style={{ padding: '13px', background: 'linear-gradient(135deg,#25d366,#128c7e)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 14px rgba(37,211,102,0.35)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Enviar via WhatsApp
                    </button>
                    <button onClick={sendCertEmail}
                      style={{ padding: '13px', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      Enviar por E-mail
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== ABA RELATÓRIO ===== */}
      {activeTab === 'relatorio' && (
        <div>
          {/* Controles */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Período:</span>
            {[7, 15, 30, 60].map(d => (
              <button
                key={d}
                onClick={() => { setRelDias(d); fetchRelatorio(d); }}
                style={{
                  padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: relDias === d ? 700 : 500,
                  background: relDias === d ? 'linear-gradient(135deg,var(--accent),#b0452a)' : 'var(--bg-input)',
                  border: relDias === d ? 'none' : '1px solid var(--border)',
                  color: relDias === d ? '#fff' : 'var(--text-secondary)',
                }}
              >{d} dias</button>
            ))}
            <button
              onClick={() => fetchRelatorio(relDias)}
              disabled={loadingRelatorio}
              style={{ marginLeft: 'auto', background: 'var(--bg-input)', border: '1px solid var(--border)', color: loadingRelatorio ? '#16a34a' : 'var(--text-secondary)', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ display: 'inline-block', animation: loadingRelatorio ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
              {loadingRelatorio ? 'Carregando...' : 'Atualizar'}
            </button>
            <button
              onClick={() => window.print()}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              🖨 Imprimir
            </button>
          </div>

          {loadingRelatorio ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Carregando relatório...</div>
          ) : (
            <div>
              {/* Sumário */}
              <div className="admin-stats" style={{ marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="stat-value">{students.length}</div>
                  <div className="stat-label">Total de Alunos</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: '#16a34a' }}>
                    {students.filter(s => (relatorioHistorico[s.id] || []).length > 0).length}
                  </div>
                  <div className="stat-label">Com Presença</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: '#dc2626' }}>
                    {students.filter(s => (relatorioHistorico[s.id] || []).length === 0).length}
                  </div>
                  <div className="stat-label">Sem Presença</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {students.length > 0
                      ? Math.round((Object.values(relatorioHistorico).reduce((sum, d) => sum + d.length, 0) / (students.length * relDias)) * 100)
                      : 0}%
                  </div>
                  <div className="stat-label">Média Geral</div>
                </div>
              </div>

              {/* Tabela */}
              <div className="table-responsive">
                <table className="student-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Foto</th>
                      <th>Nome</th>
                      <th>Núcleo</th>
                      <th>Graduação</th>
                      <th style={{ textAlign: 'center' }}>Presenças</th>
                      <th style={{ textAlign: 'center' }}>Faltas</th>
                      <th style={{ minWidth: 120 }}>Frequência</th>
                      <th>Última Presença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...students]
                      .sort((a, b) => {
                        const pa = (relatorioHistorico[a.id] || []).length;
                        const pb = (relatorioHistorico[b.id] || []).length;
                        return pb - pa;
                      })
                      .map(student => {
                        const dias = relatorioHistorico[student.id] || [];
                        const presencas = dias.length;
                        const pct = Math.round((presencas / relDias) * 100);
                        const cor = pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
                        const ultimaPresenca = dias.sort().reverse()[0];
                        return (
                          <tr key={student.id}>
                            <td>
                              {student.foto_url
                                ? <img src={student.foto_url} alt="" className="student-avatar" />
                                : <div className="student-avatar" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                                  </div>
                              }
                            </td>
                            <td style={{ fontWeight: 600 }}>{student.nome_completo}</td>
                            <td>
                              <span className={`badge ${student.nucleo === 'Saracuruna' ? 'badge-saracuruna' : student.nucleo === 'Mauá' ? 'badge-maua' : ''}`}>
                                {student.nucleo || '—'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>{student.graduacao}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{presencas}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{relDias - presencas}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: 6, height: 8, overflow: 'hidden', border: '1px solid var(--border)', minWidth: 60 }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 6, transition: 'width 0.5s' }} />
                                </div>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: cor, minWidth: 36 }}>{pct}%</span>
                              </div>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                              {ultimaPresenca
                                ? new Date(ultimaPresenca + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Legenda */}
              <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#16a34a' }} /> ≥ 75% — Ótima frequência
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#d97706' }} /> 50–74% — Regular
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#dc2626' }} /> &lt; 50% — Baixa frequência
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setShowCarteirinha(false); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2>
              Detalhes do Aluno
              <button className="modal-close" onClick={() => { setSelected(null); setShowCarteirinha(false); }}>&times;</button>
            </h2>

            <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'center' }}>
              {selected.foto_url ? (
                <img src={selected.foto_url} alt="" className="detail-photo" />
              ) : (
                <div className="detail-photo" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                </div>
              )}
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: 4 }}>{selected.nome_completo}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', width: 50, height: 10, borderRadius: 5, overflow: 'hidden' }}>
                    {getCordaColors(selected.graduacao).map((c, i) => (
                      <div key={i} style={{ flex: 1, background: c }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selected.graduacao} ({selected.tipo_graduacao})</span>
                  {nomenclaturaGraduacao[selected.graduacao] && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(220,38,38,0.12)', color: '#f87171', border: '1px solid rgba(220,38,38,0.25)' }}>
                      {nomenclaturaGraduacao[selected.graduacao]}
                    </span>
                  )}
                  {selected.nucleo && (
                    <span className={`badge ${selected.nucleo === 'Saracuruna' ? 'badge-saracuruna' : 'badge-maua'}`}>{selected.nucleo}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">CPF</span>
                <span className="detail-value">{selected.cpf}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Identidade</span>
                <span className="detail-value">{selected.identidade}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Data de Nascimento</span>
                <span className="detail-value">{new Date(selected.data_nascimento).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Telefone</span>
                <span className="detail-value">{selected.telefone || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className={`badge ${selected.menor_de_idade ? 'badge-minor' : 'badge-adult'}`}>
                  {selected.menor_de_idade ? 'Menor de Idade' : 'Adulto'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Autoriza Imagem</span>
                <span className="detail-value">{selected.autoriza_imagem ? 'Sim' : 'Não'}</span>
              </div>
              <div className="detail-item detail-full">
                <span className="detail-label">Endereço</span>
                <span className="detail-value">
                  {selected.endereco}, {selected.numero}
                  {selected.complemento ? ` - ${selected.complemento}` : ''} — {selected.bairro}, {selected.cidade}/{selected.estado} — CEP: {selected.cep}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome do Pai</span>
                <span className="detail-value">{selected.nome_pai || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome da Mãe</span>
                <span className="detail-value">{selected.nome_mae || '—'}</span>
              </div>
              {selected.menor_de_idade && (
                <>
                  <div className="detail-item detail-full" style={{ marginTop: 12, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <span className="detail-label" style={{ color: 'var(--danger)', fontWeight: 600 }}>Dados do Responsável</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Nome do Responsável</span>
                    <span className="detail-value">{selected.nome_responsavel || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">CPF do Responsável</span>
                    <span className="detail-value">{selected.cpf_responsavel || '—'}</span>
                  </div>
                </>
              )}
              <div className="detail-item detail-full" style={{ marginTop: 8 }}>
                <span className="detail-label">Data de Inscrição</span>
                <span className="detail-value">{new Date(selected.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Carteirinha toggle */}
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setShowCarteirinha(v => !v)}
                style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fbbf24', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                {showCarteirinha ? 'Ocultar Credencial' : 'Credencial do Aluno'}
              </button>
              {showCarteirinha && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div ref={adminCardRef}>
                    <Carteirinha data={{
                      nome: selected.nome_completo,
                      cpf: selected.cpf,
                      identidade: selected.identidade,
                      nucleo: selected.nucleo || '',
                      graduacao: selected.graduacao,
                      tipo_graduacao: selected.tipo_graduacao,
                      foto_url: selected.foto_url,
                      menor_de_idade: selected.menor_de_idade,
                      nome_pai: selected.nome_pai || '',
                      nome_mae: selected.nome_mae || '',
                      nome_responsavel: selected.nome_responsavel,
                      cpf_responsavel: selected.cpf_responsavel,
                      inscricao_numero: (selected as any).ordem_inscricao ?? null,
                    }} />
                  </div>
                  <button
                    onClick={() => printAdminCard(selected.nome_completo)}
                    style={{ padding: '10px 28px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 7 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Imprimir / Salvar PDF
                  </button>
                  <button
                    onClick={() => {
                      const base = window.location.origin;
                      const cpfEnc = encodeURIComponent(selected.cpf || '');
                      const url = `${base}/carteirinha${cpfEnc ? `?cpf=${cpfEnc}` : ''}`;
                      const phone = (selected.telefone || '').replace(/\D/g, '');
                      const br = phone.startsWith('55') ? phone : `55${phone}`;
                      const msg = encodeURIComponent(
`🎖️ *Carteirinha ACCBM — Capoeira Barão de Mauá*\n\nOlá, *${selected.nome_completo}*! Sua carteirinha de associado está disponível. Toque no link abaixo para visualizar e imprimir:\n\n🔗 ${url}\n\n_Associação Cultural de Capoeira Barão de Mauá_`
                      );
                      window.open(phone.length >= 10 ? `https://wa.me/${br}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank');
                    }}
                    style={{ padding: '10px 20px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 7 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </button>
                </div>
              )}
            </div>

            {/* Documents bar for this student — single-student context */}
            <DocumentsBar
              adminAlwaysUnlocked
              studentPhone={selected.telefone}
              studentName={selected.nome_completo.split(' ')[0]}
              students={[{ id: selected.id, nome_completo: selected.nome_completo, telefone: selected.telefone, nucleo: selected.nucleo, email: (selected as any).email }]}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => openEdit(selected)}
                style={{ flex: 1, padding: '10px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Editar Cadastro
              </button>
              <button
                onClick={() => { setDeleteConfirm(selected); setSelected(null); }}
                style={{ flex: 1, padding: '10px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Excluir Cadastro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <h2>
              Editar Cadastro
              <button className="modal-close" onClick={() => setEditing(null)}>&times;</button>
            </h2>

            <div className="detail-grid" style={{ gap: 14 }}>
              <div className="detail-item detail-full">
                <span className="detail-label">Nome Completo</span>
                <input className="edit-input" name="nome_completo" value={editForm.nome_completo || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">CPF</span>
                <input className="edit-input" name="cpf" value={editForm.cpf || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Identidade (RG)</span>
                <input className="edit-input" name="identidade" value={editForm.identidade || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Data de Nascimento</span>
                <input className="edit-input" type="date" name="data_nascimento" value={editForm.data_nascimento || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Telefone</span>
                <input className="edit-input" name="telefone" value={editForm.telefone || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Núcleo</span>
                <select className="edit-input" name="nucleo" value={editForm.nucleo || ''} onChange={handleEditChange}>
                  <option value="">Selecione</option>
                  <option value="Saracuruna">Saracuruna</option>
                  <option value="Mauá">Mauá</option>
                </select>
              </div>
              <div className="detail-item">
                <span className="detail-label">Tipo Graduação</span>
                <select className="edit-input" name="tipo_graduacao" value={editForm.tipo_graduacao || ''} onChange={handleEditChange}>
                  <option value="adulta">Adulta</option>
                  <option value="infantil">Infantil</option>
                </select>
              </div>
              <div className="detail-item">
                <span className="detail-label">Graduação (Corda)</span>
                <select className="edit-input" name="graduacao" value={editForm.graduacao || ''} onChange={handleEditChange}>
                  <option value="">Selecione</option>
                  {graduacoes.map(g => <option key={g} value={g}>{g}{nomenclaturaGraduacao[g] ? ` — ${nomenclaturaGraduacao[g]}` : ''}</option>)}
                </select>
              </div>
              <div className="detail-item detail-full" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <span className="detail-label" style={{ marginBottom: 8 }}>Endereço</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">CEP</span>
                <input className="edit-input" name="cep" value={editForm.cep || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Estado</span>
                <input className="edit-input" name="estado" value={editForm.estado || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item detail-full">
                <span className="detail-label">Endereço</span>
                <input className="edit-input" name="endereco" value={editForm.endereco || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Número</span>
                <input className="edit-input" name="numero" value={editForm.numero || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Complemento</span>
                <input className="edit-input" name="complemento" value={editForm.complemento || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Bairro</span>
                <input className="edit-input" name="bairro" value={editForm.bairro || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Cidade</span>
                <input className="edit-input" name="cidade" value={editForm.cidade || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome do Pai</span>
                <input className="edit-input" name="nome_pai" value={editForm.nome_pai || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome da Mãe</span>
                <input className="edit-input" name="nome_mae" value={editForm.nome_mae || ''} onChange={handleEditChange} />
              </div>
              {editing.menor_de_idade && (
                <>
                  <div className="detail-item detail-full" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                    <span className="detail-label" style={{ color: 'var(--danger)', fontWeight: 600 }}>Responsável</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Nome do Responsável</span>
                    <input className="edit-input" name="nome_responsavel" value={editForm.nome_responsavel || ''} onChange={handleEditChange} />
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">CPF do Responsável</span>
                    <input className="edit-input" name="cpf_responsavel" value={editForm.cpf_responsavel || ''} onChange={handleEditChange} />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setEditing(null)}
                style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg, var(--accent), #b0452a)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
              <h2 style={{ fontSize: '1.2rem', marginBottom: 0, display: 'block', WebkitTextFillColor: 'var(--text-primary)' }}>
                Confirmar Exclusão
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
              Tem certeza que deseja excluir o cadastro de
            </p>
            <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 24, color: '#f87171' }}>
              {deleteConfirm.nome_completo}?
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: '10px', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#f87171', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Checkin Confirm Modal */}
      {removeConfirm && (
        <div className="modal-overlay" onClick={() => !removing && setRemoveConfirm(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              {removing ? (
                <div style={{ width: 56, height: 56, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 32, display: 'inline-block', animation: 'spin 0.7s linear infinite' }}>↻</span>
                </div>
              ) : (
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
              )}
              <h2 style={{ fontSize: '1.2rem', marginBottom: 0, display: 'block', WebkitTextFillColor: 'var(--text-primary)' }}>
                {removing ? 'Removendo...' : 'Remover Presença'}
              </h2>
            </div>
            {!removing && <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
                Tem certeza que deseja remover a presença de
              </p>
              <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4, color: '#f87171' }}>
                {removeConfirm.nome_completo}
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
                Registrada às {removeConfirm.hora} de hoje.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setRemoveConfirm(null)}
                  style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmRemoveCheckin}
                  style={{ flex: 1, padding: '10px', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#f87171', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}
                >
                  Sim, Remover
                </button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* Modal Gráfico Individual de Presença */}
      {chartStudent && (
        <div className="modal-overlay" onClick={() => setChartStudent(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ WebkitTextFillColor: 'var(--text-primary)', fontSize: '1.1rem' }}>
                📊 Frequência Individual
              </span>
              <button className="modal-close" onClick={() => setChartStudent(null)}>&times;</button>
            </h2>

            {/* Cabeçalho aluno */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '14px 16px', background: 'var(--bg-input)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {chartStudent.foto_url
                ? <img src={chartStudent.foto_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                  </div>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{chartStudent.nome_completo}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                  {chartStudent.graduacao} · {chartStudent.nucleo || '—'}
                </div>
              </div>
              {(() => {
                const dias = historico[chartStudent.id] || [];
                const pct = 30 > 0 ? Math.round((dias.length / 30) * 100) : 0;
                const cor = pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
                return (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: cor, lineHeight: 1 }}>{pct}%</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{dias.length}/30 dias</div>
                  </div>
                );
              })()}
            </div>

            {loadingHistorico ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Carregando histórico...</div>
            ) : (() => {
              const diasPresente = new Set(historico[chartStudent.id] || []);
              // Gera os últimos 30 dias
              const dias: { date: string; label: string; presente: boolean }[] = [];
              for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().split('T')[0];
                const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                dias.push({ date: iso, label, presente: diasPresente.has(iso) });
              }
              const presentes = dias.filter(d => d.presente).length;
              const cor = presentes / 30 >= 0.75 ? '#16a34a' : presentes / 30 >= 0.5 ? '#d97706' : '#dc2626';

              return (
                <div>
                  {/* Calendário de pontos — últimos 30 dias */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Últimos 30 dias
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                      {dias.map(d => (
                        <div
                          key={d.date}
                          title={`${d.label} — ${d.presente ? 'Presente' : 'Ausente'}`}
                          style={{
                            aspectRatio: '1',
                            borderRadius: 6,
                            background: d.presente ? cor : 'var(--bg-input)',
                            border: `1px solid ${d.presente ? cor : 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'default',
                            transition: 'transform 0.1s',
                          }}
                        >
                          {d.presente && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      <span>{dias[0].label}</span>
                      <span>Hoje</span>
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Frequência</span>
                      <span style={{ fontWeight: 700, color: cor }}>{presentes} presença{presentes !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ background: 'var(--bg-input)', borderRadius: 8, height: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ width: `${(presentes / 30) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${cor}, ${cor}cc)`, borderRadius: 8, transition: 'width 0.8s ease' }} />
                    </div>
                  </div>

                  {/* Estatísticas */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      { label: 'Presenças', value: presentes, color: cor },
                      { label: 'Faltas', value: 30 - presentes, color: '#dc2626' },
                      { label: 'Frequência', value: `${Math.round((presentes / 30) * 100)}%`, color: cor },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Legenda */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 14, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: cor }} />
                      Presente
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--bg-input)', border: '1px solid var(--border)' }} />
                      Ausente
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
