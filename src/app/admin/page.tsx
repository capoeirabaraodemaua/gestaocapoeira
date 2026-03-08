'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getCordaColors, graduacoes, nomenclaturaGraduacao } from '@/lib/graduacoes';
import { getCheckins, getHistorico, removeCheckin, CheckinRecord } from '@/lib/checkins';
import Link from 'next/link';
import Carteirinha from '@/components/Carteirinha';

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

const CREDS_KEY = 'accbm_admin_creds';
const DEFAULT_USER = 'admin';
const DEFAULT_PASS = 'accbm2025';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPass, setShowPass] = useState(false);
  // Change-credentials modal
  const [showChangeCreds, setShowChangeCreds] = useState(false);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeDone, setChangeDone] = useState(false);

  const getCreds = (): { user: string; pass: string } => {
    try {
      const raw = localStorage.getItem(CREDS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { user: DEFAULT_USER, pass: DEFAULT_PASS };
  };

  // Check session on mount
  useEffect(() => {
    if (sessionStorage.getItem('admin_auth') === '1') setAuthed(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const creds = getCreds();
    if (loginUser.trim() === creds.user && loginPass === creds.pass) {
      sessionStorage.setItem('admin_auth', '1');
      setAuthed(true);
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
    localStorage.setItem(CREDS_KEY, JSON.stringify({ user: newUser.trim(), pass: newPass }));
    setChangeDone(true);
    setTimeout(() => {
      setChangeDone(false); setShowChangeCreds(false);
      setNewUser(''); setNewPass(''); setNewPassConfirm(''); setChangeError('');
    }, 2000);
  };

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterNucleo, setFilterNucleo] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'alunos' | 'presencas' | 'relatorio'>('alunos');
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

  const printAdminCard = (nome: string) => {
    const el = adminCardRef.current;
    if (!el) return;
    const pw = window.open('', '_blank');
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carteirinha — ${nome}</title>
    <style>* { margin:0; padding:0; box-sizing:border-box; } @page { size: A6 landscape; margin: 6mm; } html,body { width:100%; height:100%; background:#fff; display:flex; justify-content:center; align-items:center; font-family:Inter,Arial,sans-serif; }</style>
    </head><body>${el.innerHTML}<script>window.onload=()=>{window.print();setTimeout(()=>pw.close(),1500);}<\/script></body></html>`);
    pw.document.close();
  };

  useEffect(() => {
    fetchStudents();
    fetchPresencas();
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

  const filtered = students.filter(s => {
    const matchSearch =
      s.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
      s.cpf.includes(search) ||
      (s.graduacao || '').toLowerCase().includes(search.toLowerCase());
    const matchNucleo = !filterNucleo || s.nucleo === filterNucleo;
    return matchSearch && matchNucleo;
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

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#1e40af 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 18, boxShadow: '0 8px 40px rgba(29,78,216,0.25)', overflow: 'hidden' }}>
          <div style={{ height: 5, display: 'flex' }}>
            <div style={{ flex: 1, background: '#dc2626' }} />
            <div style={{ flex: 1, background: '#1d4ed8' }} />
            <div style={{ flex: 1, background: '#16a34a' }} />
          </div>
          <div style={{ padding: '32px 28px' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <img src="/logo-maua.png" alt="ACCBM" style={{ width: 64, height: 64, objectFit: 'contain', marginBottom: 12 }} />
              <div style={{ background: 'linear-gradient(90deg,#dc2626,#1d4ed8,#16a34a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.03em' }}>
                Painel Administrativo
              </div>
              <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: 4 }}>Associação Cultural de Capoeira Barão de Mauá</div>
            </div>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 5 }}>Usuário</label>
                <input
                  value={loginUser}
                  onChange={e => setLoginUser(e.target.value)}
                  placeholder="admin"
                  autoFocus
                  style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.95rem', outline: 'none', color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 5 }}>Senha</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={loginPass}
                    onChange={e => setLoginPass(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '11px 40px 11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '0.95rem', outline: 'none', color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                    {showPass
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              {loginError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                  ⚠ {loginError}
                </div>
              )}
              <button
                type="submit"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', letterSpacing: '0.03em', marginTop: 4 }}
              >
                Entrar
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Acesso restrito — ACCBM</p>
              <button
                type="button"
                onClick={() => { setShowChangeCreds(true); setChangeError(''); setChangeDone(false); }}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Cadastrar / alterar login e senha
              </button>
            </div>

            {/* Change credentials modal */}
            {showChangeCreds && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
                <div style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
                  <h3 style={{ margin: '0 0 18px', color: '#1e3a8a', fontWeight: 800, fontSize: '1rem' }}>Alterar Login e Senha</h3>
                  {changeDone ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>
                      ✅ Credenciais salvas com sucesso!
                    </div>
                  ) : (
                    <form onSubmit={handleChangeCreds} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Novo usuário</label>
                        <input
                          value={newUser}
                          onChange={e => setNewUser(e.target.value)}
                          placeholder="ex: admin"
                          autoFocus
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Nova senha (mín. 6 caracteres)</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showNewPass ? 'text' : 'password'}
                            value={newPass}
                            onChange={e => setNewPass(e.target.value)}
                            placeholder="••••••••"
                            style={{ width: '100%', padding: '10px 38px 10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                          />
                          <button type="button" onClick={() => setShowNewPass(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                            {showNewPass
                              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            }
                          </button>
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Confirmar nova senha</label>
                        <input
                          type="password"
                          value={newPassConfirm}
                          onChange={e => setNewPassConfirm(e.target.value)}
                          placeholder="••••••••"
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      {changeError && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
                          ⚠ {changeError}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setShowChangeCreds(false)}
                          style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#64748b' }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}
                        >
                          Salvar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
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
            <button
              onClick={() => { setShowChangeCreds(true); setChangeError(''); setChangeDone(false); setNewUser(''); setNewPass(''); setNewPassConfirm(''); }}
              style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.3)', color: '#1d4ed8', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Alterar senha
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('admin_auth'); setAuthed(false); }}
              style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sair
            </button>
          </div>

          {/* Change credentials modal (also accessible when logged in) */}
          {showChangeCreds && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
              <div style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 18px', color: '#1e3a8a', fontWeight: 800, fontSize: '1rem' }}>Alterar Login e Senha</h3>
                {changeDone ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>
                    ✅ Credenciais salvas com sucesso!
                  </div>
                ) : (
                  <form onSubmit={handleChangeCreds} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Novo usuário</label>
                      <input value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="ex: admin" autoFocus style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Nova senha (mín. 6 caracteres)</label>
                      <div style={{ position: 'relative' }}>
                        <input type={showNewPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '10px 38px 10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                        <button type="button" onClick={() => setShowNewPass(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                          {showNewPass ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Confirmar nova senha</label>
                      <input type="password" value={newPassConfirm} onChange={e => setNewPassConfirm(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
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
          )}
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
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
          {(['alunos', 'presencas', 'relatorio'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'presencas') {
                  fetchPresencas();
                }
                if (tab === 'relatorio' && Object.keys(relatorioHistorico).length === 0) {
                  fetchRelatorio(relDias);
                }
              }}
              style={{
                padding: '10px 24px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #dc2626' : '2px solid transparent',
                marginBottom: -2,
                color: activeTab === tab ? '#dc2626' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'all 0.2s',
              }}
            >
              {tab === 'alunos' ? '👥 Alunos' : tab === 'presencas' ? '📊 Presenças' : '📋 Relatório'}
            </button>
          ))}
        </div>

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
                {showCarteirinha ? 'Ocultar Carteirinha' : 'Gerar Carteirinha'}
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

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
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
