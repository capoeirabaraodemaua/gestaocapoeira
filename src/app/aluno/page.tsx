'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Carteirinha from '@/components/Carteirinha';
import DocumentsBar from '@/components/DocumentsBar';

type Student = {
  id: string;
  nome_completo: string;
  apelido?: string;
  nome_social?: string;
  cpf?: string;
  identidade?: string;
  data_nascimento?: string;
  telefone?: string;
  email?: string;
  nucleo?: string;
  graduacao?: string;
  tipo_graduacao?: string;
  foto_url?: string;
  sexo?: string;
  inscricao_numero?: number;
  nome_pai?: string;
  nome_mae?: string;
  nome_responsavel?: string;
  cpf_responsavel?: string;
  menor_de_idade?: boolean;
  [key: string]: unknown;
};

type Justificativa = {
  id: string;
  data_falta: string;
  motivo: string;
  status: 'pendente' | 'aprovado' | 'recusado';
  resposta_mestre?: string;
  created_at: string;
};

type RegistroGraduacao = {
  id: string;
  data_graduacao: string;
  graduacao_recebida: string;
  evento: string;
  professor_responsavel: string;
  observacoes?: string;
  criado_em: string;
};

type Tab = 'dashboard' | 'carteirinha' | 'presenca' | 'financeiro' | 'graduacao' | 'justificativas' | 'fotos' | 'playlist' | 'conta' | 'evolucao';

const NUCLEO_COLORS: Record<string, string> = {
  'Poliesportivo Edson Alves': '#dc2626',
  'Poliesportivo do Ipiranga': '#ea580c',
  'Saracuruna': '#16a34a',
  'Vila Urussaí': '#9333ea',
  'Jayme Fichman': '#0891b2',
  'Academia Mais Saúde': '#059669',
};

const GRAD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Cru': { bg: '#f8f8f8', text: '#374151', border: '#d1d5db' },
  'Amarela': { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  'Laranja': { bg: '#fff7ed', text: '#9a3412', border: '#fb923c' },
  'Azul': { bg: '#eff6ff', text: '#1e40af', border: '#60a5fa' },
  'Vermelha': { bg: '#fef2f2', text: '#991b1b', border: '#f87171' },
  'Verde': { bg: '#f0fdf4', text: '#166534', border: '#4ade80' },
  'Roxa': { bg: '#faf5ff', text: '#6b21a8', border: '#c084fc' },
  'Marrom': { bg: '#fdf4dc', text: '#78350f', border: '#d97706' },
  'Preta': { bg: '#1f2937', text: '#f9fafb', border: '#4b5563' },
};

function getGradColor(grad: string) {
  return GRAD_COLORS[grad] || { bg: '#f0f9ff', text: '#0369a1', border: '#7dd3fc' };
}

function getNucleoColor(nucleo: string): string {
  return NUCLEO_COLORS[nucleo] || '#1d4ed8';
}

export default function AlunoPage() {
  const [session, setSession] = useState<{ student_id: string; username: string } | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [alunoInscricaoNum, setAlunoInscricaoNum] = useState<number | null>(null);
  const carteirinhaRef = useRef<HTMLDivElement>(null);

  // ── Login ──────────────────────────────────────────────────────────────────
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  // ── OTP ───────────────────────────────────────────────────────────────────
  const [showOtp, setShowOtp] = useState(false);
  const [otpStudentId, setOtpStudentId] = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // ── Register ──────────────────────────────────────────────────────────────
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({ student_id: '', username: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [registerError, setRegisterError] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  // ── Forgot Password ───────────────────────────────────────────────────────
  const [showForgot, setShowForgot] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotStudentId, setForgotStudentId] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  // ── Presença ──────────────────────────────────────────────────────────────
  const [presencaMsg, setPresencaMsg] = useState('');
  const [presencaLoading, setPresencaLoading] = useState(false);
  const [presencaStatus, setPresencaStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [presencaLocalSelecionado, setPresencaLocalSelecionado] = useState('');

  // ── Justificativas ────────────────────────────────────────────────────────
  const [justificativas, setJustificativas] = useState<Justificativa[]>([]);
  const [justForm, setJustForm] = useState({ data_falta: '', motivo: '' });
  const [justLoading, setJustLoading] = useState(false);
  const [justMsg, setJustMsg] = useState('');
  const [justMsgType, setJustMsgType] = useState<'success' | 'error'>('success');

  // ── Graduação ─────────────────────────────────────────────────────────────
  const [historico, setHistorico] = useState<RegistroGraduacao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // ── Fotos e Vídeos ────────────────────────────────────────────────────────
  const [fotosMedia, setFotosMedia] = useState<{ name: string; url: string; type: 'foto' | 'video'; size: number; created_at: string }[]>([]);
  const [fotosLoading, setFotosLoading] = useState(false);
  const [fotosUploading, setFotosUploading] = useState(false);
  const [fotosMsg, setFotosMsg] = useState('');
  const fotosFileRef = useRef<HTMLInputElement>(null);

  // ── Playlist ───────────────────────────────────────────────────────────────
  const [playlistItems, setPlaylistItems] = useState<{ id: string; title: string; url: string; platform: string; created_at: string }[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistAddUrl, setPlaylistAddUrl] = useState('');
  const [playlistAddTitle, setPlaylistAddTitle] = useState('');
  const [playlistAdding, setPlaylistAdding] = useState(false);
  const [playlistMsg, setPlaylistMsg] = useState('');
  const [playlistMsgType, setPlaylistMsgType] = useState<'success' | 'error'>('success');
  const [playlistEditId, setPlaylistEditId] = useState<string | null>(null);
  const [playlistEditTitle, setPlaylistEditTitle] = useState('');
  const [playlistEditUrl, setPlaylistEditUrl] = useState('');

  // ── Evolução / Dashboard Pessoal ───────────────────────────────────────────
  const [evolucaoDates, setEvolucaoDates] = useState<string[]>([]);
  const [evolucaoLoading, setEvolucaoLoading] = useState(false);

  // ── Conta / Perfil ─────────────────────────────────────────────────────────
  const [contaSection, setContaSection] = useState<'main' | 'edit-profile' | 'change-password' | 'delete-account'>('main');
  const [contaForm, setContaForm] = useState({ new_username: '', new_email: '', current_password: '', new_password: '', confirm_password: '' });
  const [contaMsg, setContaMsg] = useState('');
  const [contaMsgType, setContaMsgType] = useState<'success' | 'error'>('success');
  const [contaLoading, setContaLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // ── Load session ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('aluno_session');
      if (raw) {
        const sess = JSON.parse(raw);
        setSession(sess);
        loadStudentData(sess.student_id, true);
      } else {
        setLoading(false);
      }
    } catch { setLoading(false); }
  }, []);

  const loadStudentData = useCallback(async (student_id: string, showGlobalLoader = false) => {
    if (showGlobalLoader) setLoading(true);
    try {
      const res = await fetch(`/api/aluno/dados?student_id=${student_id}`);
      if (res.ok) {
        const { student } = await res.json();
        if (student) {
          setStudent(student);
          // Fetch display ID for carteirinha (gerar-id is the authoritative source)
          const ordNum = (student as Record<string, unknown>).ordem_inscricao as number | null ?? null;
          if (ordNum) {
            setAlunoInscricaoNum(ordNum);
          } else {
            fetch(`/api/aluno/gerar-id?student_id=${encodeURIComponent(student_id)}`)
              .then(r => r.json())
              .then(d => {
                if (d.display_id) {
                  const match = (d.display_id as string).match(/(\d+)$/);
                  if (match) setAlunoInscricaoNum(parseInt(match[1], 10));
                }
              })
              .catch(() => {});
          }
        }
      }
    } catch {}
    if (showGlobalLoader) setLoading(false);
  }, []);

  const loadJustificativas = useCallback(async (student_id: string) => {
    const res = await fetch(`/api/aluno/justificativas?student_id=${student_id}`);
    if (res.ok) setJustificativas(await res.json());
  }, []);

  const loadHistorico = useCallback(async (student_id: string) => {
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/historico-graduacoes?student_id=${student_id}`);
      if (res.ok) {
        const { records } = await res.json();
        setHistorico(records || []);
      }
    } catch {}
    setLoadingHistorico(false);
  }, []);

  const loadFotos = useCallback(async (student_id: string) => {
    setFotosLoading(true);
    try {
      const res = await fetch(`/api/aluno/media?student_id=${student_id}`);
      if (res.ok) {
        const { files } = await res.json();
        setFotosMedia(files || []);
      }
    } catch {}
    setFotosLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      if (activeTab === 'justificativas') loadJustificativas(session.student_id);
      if (activeTab === 'graduacao') loadHistorico(session.student_id);
      if (activeTab === 'fotos') loadFotos(session.student_id);
      if (activeTab === 'playlist') {
        setPlaylistLoading(true);
        fetch(`/api/aluno/playlist?student_id=${session.student_id}`).then(r => r.json()).then(d => { setPlaylistItems(Array.isArray(d) ? d : []); setPlaylistLoading(false); }).catch(() => setPlaylistLoading(false));
      }
      if (activeTab === 'evolucao') {
        setEvolucaoLoading(true);
        fetch(`/api/aluno/evolucao?student_id=${session.student_id}`).then(r => r.json()).then(d => { setEvolucaoDates(Array.isArray(d.dates) ? d.dates : []); setEvolucaoLoading(false); }).catch(() => setEvolucaoLoading(false));
      }
    }
  }, [session, activeTab, loadJustificativas, loadHistorico, loadFotos]);

  // ── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) {
      setLoginError(`Muitas tentativas. Aguarde ${Math.ceil((lockedUntil - Date.now()) / 60000)} minuto(s).`);
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/aluno/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', ...loginForm }),
      });
      const data = await res.json();
      if (!res.ok) {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLockedUntil(Date.now() + 5 * 60 * 1000);
          setLoginError('Muitas tentativas. Aguarde 5 minutos.');
        } else if (data.pending) {
          setOtpStudentId(data.student_id);
          setOtpPhone(data.phone || '');
          setShowOtp(true);
        } else {
          setLoginError(data.error || 'Usuário ou senha incorretos.');
        }
        return;
      }
      setLoginAttempts(0);
      const sess = { student_id: data.student_id, username: data.username };
      sessionStorage.setItem('aluno_session', JSON.stringify(sess));
      // Pre-populate with login response so dashboard renders immediately
      if (data.student) setStudent(data.student);
      setSession(sess);
      setActiveTab('dashboard');
      // Then load full merged data (includes apelido/nome_social from Storage extras)
      loadStudentData(data.student_id);
    } catch { setLoginError('Erro de conexão. Tente novamente.'); }
    finally { setLoginLoading(false); }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('aluno_session');
    setSession(null);
    setStudent(null);
    setActiveTab('dashboard');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true); setOtpError('');
    try {
      const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify-otp', student_id: otpStudentId, otp: otpCode }) });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error || 'Código inválido.'); return; }
      setShowOtp(false);
      setLoginError('✅ Conta ativada! Faça login.');
    } catch { setOtpError('Erro de conexão.'); }
    finally { setOtpLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerForm.password !== registerForm.confirmPassword) { setRegisterError('As senhas não coincidem.'); return; }
    setRegisterLoading(true); setRegisterError('');
    try {
      const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', ...registerForm }) });
      const data = await res.json();
      if (!res.ok) { setRegisterError(data.error || 'Erro ao criar conta.'); return; }
      setOtpStudentId(registerForm.student_id);
      setOtpPhone(registerForm.phone || '');
      setShowRegister(false);
      setShowOtp(true);
    } catch { setRegisterError('Erro de conexão.'); }
    finally { setRegisterLoading(false); }
  };

  const handlePresenca = async () => {
    if (!navigator.geolocation) { setPresencaMsg('Geolocalização não disponível neste dispositivo.'); setPresencaStatus('error'); return; }
    setPresencaLoading(true); setPresencaMsg(''); setPresencaStatus('idle');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch('/api/checkins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student: {
              id: session!.student_id,
              nome_completo: student?.nome_completo || '',
              graduacao: student?.graduacao || '',
              nucleo: presencaLocalSelecionado || student?.nucleo || '',
              local_treino: presencaLocalSelecionado || student?.nucleo || '',
              foto_url: student?.foto_url || null,
              telefone: student?.telefone || '',
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) { setPresencaMsg(data.error || 'Não foi possível registrar presença.'); setPresencaStatus('error'); }
        else if (data.alreadyRegistered) { setPresencaMsg('Presença já registrada hoje!'); setPresencaStatus('success'); }
        else { setPresencaMsg('✅ Presença registrada com sucesso!'); setPresencaStatus('success'); }
      } catch { setPresencaMsg('Erro ao registrar presença.'); setPresencaStatus('error'); }
      finally { setPresencaLoading(false); }
    }, () => { setPresencaMsg('Permissão de localização negada. Por favor, permita o acesso à localização.'); setPresencaStatus('error'); setPresencaLoading(false); });
  };

  const handleSubmitJustificativa = async (e: React.FormEvent) => {
    e.preventDefault();
    setJustLoading(true); setJustMsg('');
    try {
      const res = await fetch('/api/aluno/justificativas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', student_id: session!.student_id, ...justForm }) });
      const data = await res.json();
      if (!res.ok) { setJustMsg(data.error || 'Erro.'); setJustMsgType('error'); return; }
      setJustMsg('Justificativa enviada com sucesso!');
      setJustMsgType('success');
      setJustForm({ data_falta: '', motivo: '' });
      loadJustificativas(session!.student_id);
    } catch { setJustMsg('Erro de conexão.'); setJustMsgType('error'); }
    finally { setJustLoading(false); }
  };

  const nucleoColor = student ? getNucleoColor(student.nucleo || '') : '#1d4ed8';

  const cartData = student ? {
    nome: student.nome_completo,
    cpf: student.cpf || '',
    identidade: student.identidade || '',
    nucleo: student.nucleo || '',
    graduacao: student.graduacao || '',
    tipo_graduacao: student.tipo_graduacao || '',
    foto_url: student.foto_url || null,
    menor_de_idade: !!student.menor_de_idade,
    nome_pai: student.nome_pai as string || '',
    nome_mae: student.nome_mae as string || '',
    nome_responsavel: student.nome_responsavel as string || '',
    cpf_responsavel: student.cpf_responsavel as string || '',
    inscricao_numero: alunoInscricaoNum ?? (student.inscricao_numero as number | null) ?? null,
    telefone: student.telefone || '',
    student_id: student.id,
    data_nascimento: student.data_nascimento || '',
  } : null;

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (!session && !showOtp && !showRegister && !showForgot) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div style={{ width: 110, height: 110, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.15)', padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                <img src="/logo-accbm.png" alt="ACCBM Logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
              </div>
            </div>
            <h1 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Área do Aluno</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', margin: '5px 0 0' }}>Associação Cultural de Capoeira Barão de Mauá</p>
          </div>

          <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>Entrar na minha conta</h2>
            <p style={{ margin: '0 0 24px', fontSize: '0.82rem', color: '#6b7280' }}>Acesse sua carteirinha, presenças e histórico de graduação.</p>

            {loginError && (
              <div style={{ background: loginError.startsWith('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${loginError.startsWith('✅') ? '#bbf7d0' : '#fecaca'}`, color: loginError.startsWith('✅') ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.83rem', fontWeight: 500 }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Usuário ou E-mail</label>
                <input type="text" value={loginForm.username} onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '11px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                  placeholder="Seu usuário ou e-mail" required autoComplete="username" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Senha</label>
                <input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '11px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="Sua senha" required autoComplete="current-password" />
              </div>
              <button type="submit" disabled={loginLoading || Date.now() < lockedUntil}
                style={{ background: loginLoading ? '#9ca3af' : 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: '0.95rem', cursor: loginLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: '0.82rem' }}>
              <button onClick={() => setShowForgot(true)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 500 }}>Esqueci minha senha</button>
              <button onClick={() => setShowRegister(true)} style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', padding: 0, fontWeight: 500 }}>Criar conta</button>
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
              <a href="/" style={{ color: '#9ca3af', fontSize: '0.82rem', textDecoration: 'none' }}>← Voltar à página inicial</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── OTP ───────────────────────────────────────────────────────────────────
  if (showOtp) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 400, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📱</div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Verificação WhatsApp</h2>
            {otpPhone && <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#6b7280' }}>Código enviado para ****{otpPhone.slice(-4)}</p>}
          </div>
          {otpError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.83rem' }}>{otpError}</div>}
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="text" value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ width: '100%', border: '2px solid #e5e7eb', borderRadius: 12, padding: '14px', fontSize: '2rem', textAlign: 'center', letterSpacing: '0.4em', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
              placeholder="000000" maxLength={6} required autoFocus />
            <button type="submit" disabled={otpLoading || otpCode.length !== 6}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', opacity: otpCode.length !== 6 ? 0.5 : 1 }}>
              {otpLoading ? 'Verificando...' : 'Verificar Código'}
            </button>
          </form>
          <button onClick={async () => { await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resend-otp', student_id: otpStudentId }) }); alert('Novo código enviado!'); }}
            style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.83rem', padding: '8px 0' }}>
            Reenviar código
          </button>
          <button onClick={() => setShowOtp(false)} style={{ width: '100%', marginTop: 4, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.83rem', padding: '6px 0' }}>Cancelar</button>
        </div>
      </div>
    );
  }

  // ── REGISTER ──────────────────────────────────────────────────────────────
  if (showRegister) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>🥋</div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Criar Conta</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>Você precisa ter uma ficha de inscrição cadastrada pela associação.</p>
          </div>
          {registerError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem' }}>{registerError}</div>}
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              { label: 'ID do Aluno *', key: 'student_id', placeholder: 'ID fornecido pelo administrador', type: 'text' },
              { label: 'Nome de usuário *', key: 'username', placeholder: 'ex: joaosilva', type: 'text' },
              { label: 'E-mail', key: 'email', placeholder: 'seu@email.com', type: 'email' },
              { label: 'WhatsApp *', key: 'phone', placeholder: '(21) 99999-9999', type: 'tel' },
              { label: 'Senha *', key: 'password', placeholder: 'Mínimo 6 caracteres', type: 'password' },
              { label: 'Confirmar Senha *', key: 'confirmPassword', placeholder: 'Repita a senha', type: 'password' },
            ] as const).map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
                <input type={type} value={(registerForm as Record<string, string>)[key] || ''} onChange={e => setRegisterForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                  placeholder={placeholder} required={key !== 'email'} minLength={key === 'password' || key === 'confirmPassword' ? 6 : undefined} />
              </div>
            ))}
            <button type="submit" disabled={registerLoading}
              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginTop: 4 }}>
              {registerLoading ? 'Criando conta...' : 'Criar Conta e Receber Código'}
            </button>
          </form>
          <button onClick={() => setShowRegister(false)} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem' }}>← Voltar</button>
        </div>
      </div>
    );
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
  if (showForgot) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 400, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>🔑</div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Recuperar Senha</h2>
          </div>
          {forgotMsg && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem' }}>{forgotMsg}</div>}
          {resetMsg && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem' }}>{resetMsg}</div>}
          {!showResetPassword ? (
            <form onSubmit={async (e) => { e.preventDefault(); const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'forgot-password', username_or_email: forgotInput }) }); const data = await res.json(); if (data.student_id) { setForgotStudentId(data.student_id); const dest = data.email ? `e-mail ${data.email}` : data.phone ? `WhatsApp ${data.phone}` : 'seu contato cadastrado'; setForgotMsg(`Código enviado para ${dest}.`); setShowResetPassword(true); } else { setForgotMsg(data.message || 'Se existir, você receberá um código.'); } }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Usuário ou E-mail</label>
                <input type="text" value={forgotInput} onChange={e => setForgotInput(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '11px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} required />
              </div>
              <button type="submit" style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Enviar Código de Recuperação</button>
            </form>
          ) : (
            <form onSubmit={async (e) => { e.preventDefault(); const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-password', student_id: forgotStudentId, otp: resetOtp, new_password: resetPassword }) }); const data = await res.json(); if (!res.ok) { setResetMsg(data.error || 'Erro.'); return; } setResetMsg('Senha redefinida! Faça login.'); setShowForgot(false); setShowResetPassword(false); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Código de recuperação</label>
                <input type="text" value={resetOtp} onChange={e => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ width: '100%', border: '2px solid #e5e7eb', borderRadius: 10, padding: '12px', fontSize: '1.8rem', textAlign: 'center', letterSpacing: '0.35em', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="000000" maxLength={6} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Nova Senha</label>
                <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '11px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} minLength={6} required />
              </div>
              <button type="submit" style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Redefinir Senha</button>
            </form>
          )}
          <button onClick={() => { setShowForgot(false); setShowResetPassword(false); setForgotMsg(''); setResetMsg(''); }} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem' }}>← Voltar ao login</button>
        </div>
      </div>
    );
  }

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: '1rem' }}>Carregando...</div>
      </div>
    );
  }

  // ── TABS NAVIGATION ───────────────────────────────────────────────────────
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard',      icon: '🏠', label: 'Início' },
    { id: 'evolucao',       icon: '📊', label: 'Evolução' },
    { id: 'carteirinha',    icon: '🪪', label: 'Carteirinha' },
    { id: 'presenca',       icon: '📍', label: 'Presença' },
    { id: 'financeiro',     icon: '💰', label: 'Financeiro' },
    { id: 'graduacao',      icon: '🎖️', label: 'Graduação' },
    { id: 'fotos',          icon: '📸', label: 'Fotos' },
    { id: 'justificativas', icon: '📝', label: 'Justific.' },
    { id: 'playlist',       icon: '🎵', label: 'Playlist' },
    { id: 'conta',          icon: '⚙️', label: 'Conta' },
  ];

  // ── DASHBOARD (LOGGED IN) ─────────────────────────────────────────────────
  const displayName = student?.apelido || student?.nome_social || student?.nome_completo?.split(' ')[0] || 'Aluno';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <header style={{ color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', backgroundColor: nucleoColor }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {student?.foto_url ? (
              <img src={student.foto_url} alt={displayName} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)' }} />
            ) : (
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🥋</div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>{displayName}</div>
              {student?.apelido && student.apelido !== student.nome_completo?.split(' ')[0] && (
                <div style={{ fontSize: '0.68rem', opacity: 0.7, lineHeight: 1.2 }}>{student.nome_completo}</div>
              )}
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 1 }}>{student?.nucleo || 'ACCBM'} • {student?.graduacao || 'Aluno'}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Sair</button>
        </div>
      </header>

      {/* Bottom nav (mobile) */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 8px', display: 'flex', overflowX: 'auto', gap: 2 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: activeTab === tab.id ? `2.5px solid ${nucleoColor}` : '2.5px solid transparent', color: activeTab === tab.id ? nucleoColor : '#6b7280', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.7rem', whiteSpace: 'nowrap', transition: 'all 0.15s', minWidth: 60 }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Welcome card */}
            <div style={{ background: `linear-gradient(135deg, ${nucleoColor}, ${nucleoColor}cc)`, borderRadius: 18, padding: '22px 22px', color: '#fff', boxShadow: `0 8px 24px ${nucleoColor}40` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                {student?.foto_url ? (
                  <img src={student.foto_url} alt={displayName} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.5)', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>🥋</div>
                )}
                <div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bem-vindo(a)</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.2 }}>{displayName}! 👋</div>
                  {student?.apelido && student.apelido !== student.nome_completo?.split(' ')[0] && (
                    <div style={{ fontSize: '0.78rem', opacity: 0.7, fontStyle: 'italic' }}>{student.nome_completo}</div>
                  )}
                </div>
              </div>
              {/* Identity strip */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ fontSize: '0.62rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Nome Completo</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.2 }}>{student?.nome_completo || '—'}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ fontSize: '0.62rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Graduação</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{student?.graduacao || 'Não informada'}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.62rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Núcleo</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{student?.nucleo || 'ACCBM'}</div>
                </div>
              </div>
            </div>

            {/* Quick actions grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {([
                { tab: 'carteirinha'    as Tab, icon: '🪪', label: 'Carteirinha',   color: '#eff6ff', iconBg: '#dbeafe', textColor: '#1e40af' },
                { tab: 'presenca'       as Tab, icon: '📍', label: 'Presença',      color: '#f0fdf4', iconBg: '#dcfce7', textColor: '#15803d' },
                { tab: 'financeiro'     as Tab, icon: '💰', label: 'Financeiro',    color: '#fef9c3', iconBg: '#fef08a', textColor: '#854d0e' },
                { tab: 'graduacao'      as Tab, icon: '🎖️', label: 'Graduação',     color: '#faf5ff', iconBg: '#e9d5ff', textColor: '#7e22ce' },
                { tab: 'fotos'          as Tab, icon: '📸', label: 'Fotos/Vídeos', color: '#fdf2f8', iconBg: '#f5d0fe', textColor: '#86198f' },
                { tab: 'justificativas' as Tab, icon: '📝', label: 'Justificativas',color: '#fff7ed', iconBg: '#fed7aa', textColor: '#9a3412' },
              ] as { tab: Tab; icon: string; label: string; color: string; iconBg: string; textColor: string }[]).map(item => (
                <button key={item.tab} onClick={() => setActiveTab(item.tab)}
                  style={{ background: item.color, borderRadius: 14, padding: '14px 10px', border: 'none', cursor: 'pointer', textAlign: 'center', transition: 'transform 0.15s, box-shadow 0.15s' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', margin: '0 auto 8px' }}>{item.icon}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: item.textColor }}>{item.label}</div>
                </button>
              ))}
            </div>

            {/* Links institucionais */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>ACCBM</div>
              {([
                { href: '/hierarquia', icon: '🥋', label: 'Hierarquia da ACCBM', color: '#fef2f2', iconBg: '#fecaca', textColor: '#991b1b' },
                { href: '/organograma', icon: '🏛️', label: 'Organograma da ACCBM', color: '#eff6ff', iconBg: '#bfdbfe', textColor: '#1e40af' },
                { href: '/documentos', icon: '📚', label: 'Documentos Históricos da Capoeira', color: '#f0fdf4', iconBg: '#bbf7d0', textColor: '#166534' },
              ]).map(item => (
                <a key={item.href} href={item.href}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: item.color, borderRadius: 12, padding: '12px 14px', textDecoration: 'none', border: `1px solid ${item.iconBg}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{item.icon}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: item.textColor }}>{item.label}</div>
                  <span style={{ marginLeft: 'auto', color: item.textColor, opacity: 0.5, fontSize: '0.9rem' }}>›</span>
                </a>
              ))}
            </div>

            {/* Documentos institucionais — bibliografia, estatuto, regimento, informações */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Documentos da Associação</div>
              <DocumentsBar readOnly studentPhone={student?.telefone} studentName={student?.nome_completo} />
            </div>

            {/* Student info card */}
            {student && (
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151', marginBottom: 12 }}>Meus Dados</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Graduação', value: student.graduacao },
                    { label: 'Núcleo', value: student.nucleo },
                    { label: 'Telefone', value: student.telefone },
                    { label: 'E-mail', value: student.email as string },
                  ].map(({ label, value }) => value ? (
                    <div key={label}>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(value)}</div>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CARTEIRINHA ── */}
        {activeTab === 'carteirinha' && cartData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>🪪 Minha Carteirinha</h2>
            <div ref={carteirinhaRef} style={{ display: 'flex', justifyContent: 'center' }}>
              <Carteirinha data={cartData} />
            </div>

            {/* Action buttons */}
            <button
              onClick={() => {
                const printArea = carteirinhaRef.current;
                if (!printArea) return;
                const w = window.open('', '_blank', 'width=600,height=450');
                if (!w) return;
                w.document.write(`<html><head><title>Carteirinha ACCBM — ${cartData.nome}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;font-family:Inter,sans-serif}@media print{body{background:#fff}}</style></head><body>${printArea.innerHTML}</body></html>`);
                w.document.close();
                w.focus();
                setTimeout(() => { w.print(); }, 400);
              }}
              style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Imprimir / Salvar PDF
            </button>
            <button
              onClick={() => {
                const phone = (student?.telefone || '').replace(/\D/g, '');
                const br = phone.startsWith('55') ? phone : `55${phone}`;
                const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
                const cpfEnc = encodeURIComponent(cartData.cpf || '');
                const url = `${base}/carteirinha${cpfEnc ? `?cpf=${cpfEnc}` : ''}`;
                const msg = encodeURIComponent(`🎖️ *Carteirinha ACCBM — Capoeira Barão de Mauá*\n\nOlá, *${cartData.nome}*! Sua carteirinha de associado está disponível:\n\n🔗 ${url}\n\n_Associação Cultural de Capoeira Barão de Mauá_`);
                window.open(phone.length >= 10 ? `https://api.whatsapp.com/send?phone=${br}&text=${msg}` : `https://api.whatsapp.com/send?text=${msg}`, '_blank');
              }}
              style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,rgba(37,211,102,0.15),rgba(37,211,102,0.08))', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Compartilhar via WhatsApp
            </button>
            <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '12px 16px', border: '1px solid #bae6fd', fontSize: '0.78rem', color: '#0369a1' }}>
              💡 Use esta carteirinha para identificação nas aulas. Você pode imprimir ou salvar como PDF.
            </div>
          </div>
        )}

        {/* ── PRESENÇA ── */}
        {activeTab === 'presenca' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>📍 Registrar Presença</h2>

            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>📍</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Presença do dia de hoje</h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.83rem', color: '#6b7280', lineHeight: 1.5 }}>
                Sua presença será registrada automaticamente ao clicar no botão abaixo.<br />
                Você precisa estar no local de treino (raio de 200m).
              </p>

              {/* Local de treino */}
              <div style={{ textAlign: 'left', marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  📍 Local de Treino <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                </label>
                <select
                  value={presencaLocalSelecionado}
                  onChange={e => setPresencaLocalSelecionado(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#111827' }}
                >
                  <option value="">— Selecione o local de treino —</option>
                  <option value="Poliesportivo Edson Alves">Poliesportivo Edson Alves — Magé</option>
                  <option value="Poliesportivo do Ipiranga">Poliesportivo do Ipiranga — Magé</option>
                  <option value="Saracuruna">CIEP 318 — Saracuruna, Duque de Caxias</option>
                  <option value="Vila Urussaí">Núcleo Vila Urussaí — Duque de Caxias</option>
                  <option value="Jayme Fichman">Núcleo Jayme Fichman — Duque de Caxias</option>
                  <option value="Academia Mais Saúde">Academia Mais Saúde</option>
                </select>
                {!presencaLocalSelecionado && student?.nucleo && (
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>
                    Se não selecionado, será usado o seu núcleo: <strong>{student.nucleo}</strong>
                  </div>
                )}
              </div>

              {presencaMsg && (
                <div style={{ background: presencaStatus === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${presencaStatus === 'success' ? '#bbf7d0' : '#fecaca'}`, color: presencaStatus === 'success' ? '#166534' : '#991b1b', borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontSize: '0.85rem', fontWeight: 500 }}>
                  {presencaStatus === 'success' ? '✅ ' : '❌ '}{presencaMsg}
                </div>
              )}

              <button onClick={handlePresenca} disabled={presencaLoading}
                style={{ background: presencaLoading ? '#9ca3af' : `linear-gradient(135deg, ${nucleoColor}, ${nucleoColor}cc)`, color: '#fff', border: 'none', borderRadius: 14, padding: '16px 32px', fontWeight: 800, fontSize: '1rem', cursor: presencaLoading ? 'not-allowed' : 'pointer', boxShadow: presencaLoading ? 'none' : `0 6px 20px ${nucleoColor}40`, transition: 'all 0.2s' }}>
                {presencaLoading ? '📍 Obtendo localização...' : '📍 Registrar Presença Agora'}
              </button>

              <p style={{ margin: '14px 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>
                A localização é usada apenas para confirmar que você está no local de treino e não é armazenada.
              </p>
            </div>

            <div style={{ background: '#fffbeb', borderRadius: 12, padding: '12px 16px', border: '1px solid #fde68a', fontSize: '0.8rem', color: '#92400e' }}>
              ⚠️ O registro de presença só pode ser feito no dia atual. Se precisar justificar uma falta, use a aba <strong>Justificativas</strong>.
            </div>
          </div>
        )}

        {/* ── FINANCEIRO ── */}
        {activeTab === 'financeiro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>💰 Ficha Financeira</h2>
            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Portal Financeiro</h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.83rem', color: '#6b7280', lineHeight: 1.5 }}>
                Visualize suas mensalidades, batizado, uniformes e histórico de pagamentos.
              </p>
              <a href={`/financeiro?student_id=${session?.student_id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '13px 28px', fontWeight: 700, fontSize: '0.95rem', boxShadow: '0 4px 14px rgba(22,163,74,0.35)' }}>
                💰 Acessar Ficha Financeira
              </a>
              <p style={{ margin: '12px 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>Você será redirecionado para o portal financeiro.</p>
            </div>
          </div>
        )}

        {/* ── GRADUAÇÃO ── */}
        {activeTab === 'graduacao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>🎖️ Histórico de Graduação</h2>
              <button onClick={() => student && loadHistorico(student.id)} style={{ background: 'none', border: `1px solid ${nucleoColor}`, color: nucleoColor, borderRadius: 8, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>🔄 Atualizar</button>
            </div>

            {/* Current graduation badge */}
            {student?.graduacao && (() => {
              const c = getGradColor(student.graduacao);
              return (
                <div style={{ background: c.bg, border: `2px solid ${c.border}`, borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>🎖️</div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: c.text, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Graduação Atual</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: c.text }}>{student.graduacao}</div>
                    {student.tipo_graduacao && <div style={{ fontSize: '0.8rem', color: c.text, opacity: 0.7, marginTop: 1 }}>Tipo: {student.tipo_graduacao}</div>}
                  </div>
                </div>
              );
            })()}

            {/* Timeline */}
            {loadingHistorico ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>Carregando histórico...</div>
            ) : historico.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 16, padding: '32px 20px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#374151', marginBottom: 4 }}>Nenhum registro encontrado</div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5 }}>
                  Seu histórico de graduações aparecerá aqui após o administrador finalizar os lançamentos de batizados e trocas de corda.
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* Timeline line */}
                <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 2, background: `linear-gradient(to bottom, ${nucleoColor}80, transparent)`, borderRadius: 2 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {historico.map((reg, idx) => {
                    const c = getGradColor(reg.graduacao_recebida);
                    return (
                      <div key={reg.id} style={{ display: 'flex', gap: 16, paddingBottom: 20, paddingLeft: 4 }}>
                        {/* Timeline dot */}
                        <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: c.bg, border: `2.5px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', zIndex: 1, marginTop: 4 }}>
                          {idx === 0 ? '⭐' : '🎖️'}
                        </div>

                        {/* Card */}
                        <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, borderRadius: 8, padding: '2px 10px', fontSize: '0.82rem', fontWeight: 700 }}>
                                  {reg.graduacao_recebida}
                                </span>
                                {idx === 0 && (
                                  <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 8, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                                    Mais recente
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', marginTop: 6 }}>{reg.evento}</div>
                              <div style={{ fontSize: '0.76rem', color: '#6b7280', marginTop: 2 }}>Prof. {reg.professor_responsavel}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: nucleoColor }}>
                                {new Date(reg.data_graduacao + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                            </div>
                          </div>
                          {reg.observacoes && (
                            <div style={{ marginTop: 8, padding: '8px 10px', background: '#f9fafb', borderRadius: 8, fontSize: '0.78rem', color: '#6b7280', fontStyle: 'italic' }}>
                              &ldquo;{reg.observacoes}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '12px 16px', border: '1px solid #bae6fd', fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.5 }}>
              ℹ️ O histórico é atualizado automaticamente quando o administrador finaliza um evento de batizado ou troca de corda no painel.
            </div>
          </div>
        )}

        {/* ── JUSTIFICATIVAS ── */}
        {activeTab === 'justificativas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>📝 Justificativas de Falta</h2>

            {/* Form */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', marginBottom: 14 }}>Enviar nova justificativa</div>
              {justMsg && (
                <div style={{ background: justMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${justMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: justMsgType === 'success' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.83rem' }}>
                  {justMsgType === 'success' ? '✅ ' : '❌ '}{justMsg}
                </div>
              )}
              <form onSubmit={handleSubmitJustificativa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Data da Falta *</label>
                  <input type="date" value={justForm.data_falta} onChange={e => setJustForm(p => ({ ...p, data_falta: e.target.value }))}
                    max={new Date().toISOString().split('T')[0]}
                    min={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} required />
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>Apenas os últimos 30 dias</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Motivo da Falta *</label>
                  <textarea value={justForm.motivo} onChange={e => setJustForm(p => ({ ...p, motivo: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', resize: 'none' }}
                    rows={3} placeholder="Descreva o motivo da falta..." maxLength={500} required />
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'right', marginTop: 2 }}>{justForm.motivo.length}/500</div>
                </div>
                <button type="submit" disabled={justLoading}
                  style={{ background: justLoading ? '#9ca3af' : `linear-gradient(135deg, ${nucleoColor}, ${nucleoColor}cc)`, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: justLoading ? 'not-allowed' : 'pointer' }}>
                  {justLoading ? 'Enviando...' : 'Enviar Justificativa'}
                </button>
              </form>
            </div>

            {/* List */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', marginBottom: 14 }}>Minhas justificativas</div>
              {justificativas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: '0.85rem' }}>Nenhuma justificativa enviada ainda.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {justificativas.map(j => (
                    <div key={j.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
                          {new Date(j.data_falta + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 3 }}>{j.motivo}</div>
                        {j.resposta_mestre && (
                          <div style={{ marginTop: 6, padding: '6px 10px', background: '#eff6ff', borderRadius: 6, fontSize: '0.76rem', color: '#1e40af' }}>
                            💬 Mestre: {j.resposta_mestre}
                          </div>
                        )}
                      </div>
                      <span style={{
                        flexShrink: 0, padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                        background: j.status === 'aprovado' ? '#dcfce7' : j.status === 'recusado' ? '#fee2e2' : '#fef9c3',
                        color: j.status === 'aprovado' ? '#166534' : j.status === 'recusado' ? '#991b1b' : '#854d0e',
                      }}>
                        {j.status === 'aprovado' ? '✅ Aprovada' : j.status === 'recusado' ? '❌ Recusada' : '⏳ Pendente'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── FOTOS E VÍDEOS ── */}
        {activeTab === 'fotos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>📸 Registro de Fotos e Vídeos</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Gerencie suas fotos e vídeos de treinos</p>
              </div>
              <button onClick={() => fotosFileRef.current?.click()} disabled={fotosUploading}
                style={{ background: `linear-gradient(135deg, #86198f, #9d174d)`, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: fotosUploading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {fotosUploading ? '⏳ Enviando...' : '⬆ Enviar Arquivo'}
              </button>
              <input ref={fotosFileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={async e => {
                const file = e.target.files?.[0]; if (!file || !session) return;
                setFotosUploading(true); setFotosMsg('');
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  fd.append('student_id', session.student_id);
                  const res = await fetch('/api/aluno/media', { method: 'POST', body: fd });
                  const json = await res.json();
                  if (res.ok) { setFotosMsg('✓ Arquivo enviado com sucesso!'); await loadFotos(session.student_id); }
                  else { setFotosMsg('Erro: ' + (json.error || 'falha no upload')); }
                } catch (err: unknown) { setFotosMsg('Erro de conexão.'); }
                setFotosUploading(false);
                e.target.value = '';
              }} />
            </div>

            {fotosMsg && (
              <div style={{ padding: '10px 14px', background: fotosMsg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${fotosMsg.startsWith('✓') ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, fontSize: '0.83rem', color: fotosMsg.startsWith('✓') ? '#166534' : '#991b1b', fontWeight: 600 }}>
                {fotosMsg}
              </div>
            )}

            {fotosLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.9rem' }}>Carregando arquivos...</div>
            ) : fotosMedia.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fdf2f8', borderRadius: 16, border: '2px dashed #f0abfc' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>📷</div>
                <div style={{ fontWeight: 700, color: '#86198f', fontSize: '0.95rem' }}>Nenhum arquivo ainda</div>
                <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 6 }}>Clique em "Enviar Arquivo" para adicionar fotos ou vídeos de treino</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {fotosMedia.map(m => (
                  <div key={m.name} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    {m.type === 'foto' ? (
                      <a href={m.url} target="_blank" rel="noreferrer">
                        <img src={m.url} alt={m.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                      </a>
                    ) : (
                      <a href={m.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', background: '#1f2937', textDecoration: 'none' }}>
                        <span style={{ fontSize: '2.5rem' }}>🎬</span>
                      </a>
                    )}
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name.replace(/^[^_]+_/, '')}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <a href={m.url} download target="_blank" rel="noreferrer"
                          style={{ flex: 1, background: '#eff6ff', color: '#1e40af', borderRadius: 6, padding: '4px 6px', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                          ⬇ Baixar
                        </a>
                        <button onClick={async () => {
                          if (!confirm('Excluir este arquivo?')) return;
                          const res = await fetch('/api/aluno/media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: session!.student_id, name: m.name }) });
                          if (res.ok) { setFotosMedia(prev => prev.filter(f => f.name !== m.name)); setFotosMsg('Arquivo excluído.'); }
                        }} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 7px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 700 }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center' }}>
              Formatos aceitos: JPG, PNG, GIF, MP4, MOV • Máx. 50 MB por arquivo
            </div>
          </div>
        )}

        {/* ── CONTA / PERFIL ── */}
        {activeTab === 'conta' && session && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {contaSection === 'main' && (
              <>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>⚙️ Minha Conta</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Gerencie suas credenciais de acesso</p>
                </div>

                {/* Current account info */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Dados da Conta</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: 1 }}>Usuário</div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>{session.username}</div>
                    </div>
                    <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>Ativo</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: 1 }}>E-mail de recuperação</div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: student?.email ? '#111827' : '#9ca3af', fontStyle: student?.email ? 'normal' : 'italic' }}>
                      {student?.email || 'Não cadastrado'}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => { setContaSection('edit-profile'); setContaForm(f => ({ ...f, new_username: session.username, new_email: student?.email || '' })); setContaMsg(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>✏️</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e40af' }}>Editar Perfil</div>
                      <div style={{ fontSize: '0.73rem', color: '#6b7280', marginTop: 1 }}>Alterar usuário e e-mail de recuperação</div>
                    </div>
                    <span style={{ color: '#93c5fd', fontSize: '1.1rem' }}>›</span>
                  </button>

                  <button onClick={() => { setContaSection('change-password'); setContaForm(f => ({ ...f, current_password: '', new_password: '', confirm_password: '' })); setContaMsg(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>🔒</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#7e22ce' }}>Alterar Senha</div>
                      <div style={{ fontSize: '0.73rem', color: '#6b7280', marginTop: 1 }}>Trocar sua senha de acesso</div>
                    </div>
                    <span style={{ color: '#c4b5fd', fontSize: '1.1rem' }}>›</span>
                  </button>

                  <button onClick={() => { setContaSection('delete-account'); setContaForm(f => ({ ...f, current_password: '' })); setDeleteConfirmText(''); setContaMsg(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>🗑️</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#dc2626' }}>Excluir Conta de Acesso</div>
                      <div style={{ fontSize: '0.73rem', color: '#6b7280', marginTop: 1 }}>Remove apenas o login — seu histórico é mantido</div>
                    </div>
                    <span style={{ color: '#fca5a5', fontSize: '1.1rem' }}>›</span>
                  </button>
                </div>
              </>
            )}

            {/* ── EDIT PROFILE ── */}
            {contaSection === 'edit-profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setContaSection('main')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6b7280', padding: '4px 6px', borderRadius: 8 }}>←</button>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>✏️ Editar Perfil</h2>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#6b7280' }}>Confirme sua senha para alterar</p>
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Novo Usuário</label>
                      <input type="text" value={contaForm.new_username} onChange={e => setContaForm(f => ({ ...f, new_username: e.target.value }))}
                        style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>E-mail de Recuperação</label>
                      <input type="email" value={contaForm.new_email} onChange={e => setContaForm(f => ({ ...f, new_email: e.target.value }))}
                        placeholder="seu@email.com"
                        style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Senha Atual <span style={{ color: '#dc2626' }}>*</span></label>
                      <input type="password" value={contaForm.current_password} onChange={e => setContaForm(f => ({ ...f, current_password: e.target.value }))}
                        placeholder="Confirme sua senha atual"
                        style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    {contaMsg && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: contaMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${contaMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: contaMsgType === 'success' ? '#166534' : '#991b1b', fontSize: '0.83rem', fontWeight: 600 }}>
                        {contaMsg}
                      </div>
                    )}
                    <button disabled={contaLoading} onClick={async () => {
                      if (!contaForm.current_password) { setContaMsg('Informe sua senha atual.'); setContaMsgType('error'); return; }
                      setContaLoading(true); setContaMsg('');
                      try {
                        const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update-profile', student_id: session.student_id, new_username: contaForm.new_username.trim(), new_email: contaForm.new_email.trim(), current_password: contaForm.current_password }) });
                        const data = await res.json();
                        if (res.ok) {
                          setContaMsg('✓ Perfil atualizado com sucesso!'); setContaMsgType('success');
                          const newSess = { ...session, username: data.username };
                          sessionStorage.setItem('aluno_session', JSON.stringify(newSess));
                          setSession(newSess);
                          // Update email in student state directly from API response
                          if (student) setStudent(prev => prev ? { ...prev, email: data.email !== undefined ? data.email : prev.email } : prev);
                          // Reload full student data to ensure all fields are fresh
                          loadStudentData(session.student_id);
                          setTimeout(() => setContaSection('main'), 1500);
                        } else { setContaMsg(data.error || 'Erro ao atualizar.'); setContaMsgType('error'); }
                      } catch { setContaMsg('Erro de conexão.'); setContaMsgType('error'); }
                      setContaLoading(false);
                    }} style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: contaLoading ? 'wait' : 'pointer', opacity: contaLoading ? 0.7 : 1 }}>
                      {contaLoading ? '⏳ Salvando...' : '💾 Salvar Alterações'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── CHANGE PASSWORD ── */}
            {contaSection === 'change-password' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setContaSection('main')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6b7280', padding: '4px 6px', borderRadius: 8 }}>←</button>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>🔒 Alterar Senha</h2>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#6b7280' }}>Escolha uma senha forte</p>
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {(['current_password', 'new_password', 'confirm_password'] as const).map((field, i) => (
                      <div key={field}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {['Senha Atual', 'Nova Senha', 'Confirmar Nova Senha'][i]} <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input type="password" value={contaForm[field]} onChange={e => setContaForm(f => ({ ...f, [field]: e.target.value }))}
                          style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                    {contaMsg && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: contaMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${contaMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: contaMsgType === 'success' ? '#166534' : '#991b1b', fontSize: '0.83rem', fontWeight: 600 }}>
                        {contaMsg}
                      </div>
                    )}
                    <button disabled={contaLoading} onClick={async () => {
                      if (contaForm.new_password !== contaForm.confirm_password) { setContaMsg('As senhas não coincidem.'); setContaMsgType('error'); return; }
                      if (contaForm.new_password.length < 6) { setContaMsg('A nova senha deve ter pelo menos 6 caracteres.'); setContaMsgType('error'); return; }
                      setContaLoading(true); setContaMsg('');
                      try {
                        const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'change-password', student_id: session.student_id, current_password: contaForm.current_password, new_password: contaForm.new_password }) });
                        const data = await res.json();
                        if (res.ok) { setContaMsg('✓ Senha alterada com sucesso!'); setContaMsgType('success'); setContaForm(f => ({ ...f, current_password: '', new_password: '', confirm_password: '' })); setTimeout(() => setContaSection('main'), 1500); }
                        else { setContaMsg(data.error || 'Erro ao alterar senha.'); setContaMsgType('error'); }
                      } catch { setContaMsg('Erro de conexão.'); setContaMsgType('error'); }
                      setContaLoading(false);
                    }} style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: contaLoading ? 'wait' : 'pointer', opacity: contaLoading ? 0.7 : 1 }}>
                      {contaLoading ? '⏳ Alterando...' : '🔒 Alterar Senha'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── DELETE ACCOUNT ── */}
            {contaSection === 'delete-account' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setContaSection('main')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6b7280', padding: '4px 6px', borderRadius: 8 }}>←</button>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#dc2626' }}>⚠️ Excluir Conta</h2>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#6b7280' }}>Esta ação é irreversível</p>
                  </div>
                </div>
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 14, padding: '16px 18px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#991b1b', marginBottom: 8 }}>⚠️ O que acontece ao excluir:</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: '0.82rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                    <li>Seu login e senha são <strong>removidos permanentemente</strong></li>
                    <li>Seu histórico de presenças e graduações <strong>é mantido</strong></li>
                    <li>Você precisará de nova conta para acessar a plataforma</li>
                  </ul>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Digite <strong>EXCLUIR</strong> para confirmar</label>
                      <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                        placeholder="EXCLUIR"
                        style={{ width: '100%', border: `1.5px solid ${deleteConfirmText === 'EXCLUIR' ? '#dc2626' : '#e5e7eb'}`, borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Senha Atual <span style={{ color: '#dc2626' }}>*</span></label>
                      <input type="password" value={contaForm.current_password} onChange={e => setContaForm(f => ({ ...f, current_password: e.target.value }))}
                        placeholder="Confirme sua senha"
                        style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    {contaMsg && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: contaMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${contaMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: contaMsgType === 'success' ? '#166534' : '#991b1b', fontSize: '0.83rem', fontWeight: 600 }}>
                        {contaMsg}
                      </div>
                    )}
                    <button disabled={contaLoading || deleteConfirmText !== 'EXCLUIR'} onClick={async () => {
                      if (deleteConfirmText !== 'EXCLUIR') return;
                      setContaLoading(true); setContaMsg('');
                      try {
                        const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'delete-account', student_id: session.student_id, current_password: contaForm.current_password }) });
                        const data = await res.json();
                        if (res.ok) {
                          setContaMsg('✓ Conta excluída. Você será desconectado.'); setContaMsgType('success');
                          setTimeout(() => { sessionStorage.removeItem('aluno_session'); setSession(null); setStudent(null); setActiveTab('dashboard'); }, 2000);
                        } else { setContaMsg(data.error || 'Erro ao excluir conta.'); setContaMsgType('error'); }
                      } catch { setContaMsg('Erro de conexão.'); setContaMsgType('error'); }
                      setContaLoading(false);
                    }} style={{ background: deleteConfirmText === 'EXCLUIR' ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : '#e5e7eb', color: deleteConfirmText === 'EXCLUIR' ? '#fff' : '#9ca3af', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: (contaLoading || deleteConfirmText !== 'EXCLUIR') ? 'not-allowed' : 'pointer', opacity: contaLoading ? 0.7 : 1 }}>
                      {contaLoading ? '⏳ Excluindo...' : '🗑️ Excluir Minha Conta Definitivamente'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PLAYLIST DO ALUNO ── */}
        {activeTab === 'playlist' && session && (() => {
          function getPlatformEmbed(item: { url: string; platform: string }) {
            try {
              const u = new URL(item.url);
              if (item.platform === 'youtube' || u.hostname.includes('youtu')) {
                const m = u.pathname.match(/\/shorts\/([\w-]+)/) || u.pathname.match(/\/([\w-]{11})$/) || (u.search.match(/[?&]v=([\w-]+)/));
                const vid = m ? m[1] : null;
                if (vid) return { type: 'iframe', src: `https://www.youtube.com/embed/${vid}?rel=0` };
              }
              if (item.platform === 'spotify' || u.hostname.includes('spotify')) {
                return { type: 'iframe', src: `https://open.spotify.com/embed${u.pathname}?utm_source=generator&theme=0` };
              }
              if (item.platform === 'deezer' || u.hostname.includes('deezer')) {
                const m = u.pathname.match(/(track|album|playlist)\/(\d+)/);
                if (m) return { type: 'iframe', src: `https://widget.deezer.com/widget/dark/${m[1]}/${m[2]}` };
              }
            } catch {}
            return null;
          }
          const platformMeta: Record<string, { icon: string; color: string; label: string }> = {
            youtube: { icon: '▶', color: '#dc2626', label: 'YouTube' },
            spotify: { icon: '🎧', color: '#16a34a', label: 'Spotify' },
            deezer:  { icon: '🎵', color: '#7c3aed', label: 'Deezer' },
            tiktok:  { icon: '🎶', color: '#0891b2', label: 'TikTok' },
            kwai:    { icon: '📱', color: '#ea580c', label: 'Kwai' },
            link:    { icon: '🔗', color: '#64748b', label: 'Link' },
          };

          const handleAddPlaylist = async () => {
            if (!playlistAddUrl.trim()) return;
            setPlaylistAdding(true); setPlaylistMsg('');
            try {
              const res = await fetch('/api/aluno/playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_id: session.student_id, url: playlistAddUrl.trim(), title: playlistAddTitle.trim() || undefined }),
              });
              const data = await res.json();
              if (res.ok) {
                setPlaylistItems(prev => [data.item, ...prev]);
                setPlaylistAddUrl('');
                setPlaylistAddTitle('');
                setPlaylistMsg('✅ Link adicionado!');
                setPlaylistMsgType('success');
              } else {
                setPlaylistMsg(data.error || 'Erro ao adicionar.');
                setPlaylistMsgType('error');
              }
            } catch { setPlaylistMsg('Erro de conexão.'); setPlaylistMsgType('error'); }
            setPlaylistAdding(false);
          };

          const handleDeletePlaylist = async (id: string) => {
            if (!confirm('Remover este item da playlist?')) return;
            try {
              const res = await fetch('/api/aluno/playlist', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_id: session.student_id, id }),
              });
              if (res.ok) setPlaylistItems(prev => prev.filter(i => i.id !== id));
            } catch {}
          };

          const handleEditPlaylist = async (id: string) => {
            try {
              const res = await fetch('/api/aluno/playlist', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_id: session.student_id, id, title: playlistEditTitle.trim() || undefined, url: playlistEditUrl.trim() || undefined }),
              });
              const data = await res.json();
              if (res.ok) {
                setPlaylistItems(prev => prev.map(i => i.id === id ? data.item : i));
                setPlaylistEditId(null);
              }
            } catch {}
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>🎵 Minha Playlist</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Adicione links do Spotify, Deezer, YouTube, TikTok e Kwai</p>
              </div>

              {/* Formulário para adicionar */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', marginBottom: 12 }}>➕ Adicionar link</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="url"
                    value={playlistAddUrl}
                    onChange={e => setPlaylistAddUrl(e.target.value)}
                    placeholder="Cole aqui o link (Spotify, YouTube, TikTok, Deezer, Kwai...)"
                    style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
                    onKeyDown={e => e.key === 'Enter' && handleAddPlaylist()}
                  />
                  <input
                    type="text"
                    value={playlistAddTitle}
                    onChange={e => setPlaylistAddTitle(e.target.value)}
                    placeholder="Título (opcional — será preenchido automaticamente)"
                    style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {playlistMsg && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: playlistMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${playlistMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: playlistMsgType === 'success' ? '#166534' : '#991b1b', fontSize: '0.82rem', fontWeight: 600 }}>
                      {playlistMsg}
                    </div>
                  )}
                  <button onClick={handleAddPlaylist} disabled={playlistAdding || !playlistAddUrl.trim()}
                    style={{ background: playlistAdding || !playlistAddUrl.trim() ? '#9ca3af' : `linear-gradient(135deg,${nucleoColor},${nucleoColor}cc)`, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontWeight: 700, fontSize: '0.88rem', cursor: playlistAdding || !playlistAddUrl.trim() ? 'not-allowed' : 'pointer' }}>
                    {playlistAdding ? '⏳ Adicionando...' : '➕ Adicionar à Playlist'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {Object.entries(platformMeta).map(([key, meta]) => (
                    <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${meta.color}15`, color: meta.color, borderRadius: 20, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700 }}>
                      {meta.icon} {meta.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Lista de itens */}
              {playlistLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.9rem' }}>Carregando playlist...</div>
              ) : playlistItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f5f3ff', borderRadius: 16, border: '2px dashed #a78bfa' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎵</div>
                  <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.95rem' }}>Playlist vazia</div>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 6 }}>Adicione links acima para criar sua playlist personalizada.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {playlistItems.map(item => {
                    const embed = getPlatformEmbed(item);
                    const meta = platformMeta[item.platform] || platformMeta.link;
                    const embedH = item.platform === 'spotify' ? 80 : item.platform === 'deezer' ? 100 : 157;
                    const isEditing = playlistEditId === item.id;
                    return (
                      <div key={item.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        {isEditing ? (
                          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <input type="text" value={playlistEditTitle} onChange={e => setPlaylistEditTitle(e.target.value)}
                              placeholder="Título" style={{ border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                            <input type="url" value={playlistEditUrl} onChange={e => setPlaylistEditUrl(e.target.value)}
                              placeholder="URL" style={{ border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => handleEditPlaylist(item.id)} style={{ flex: 1, background: nucleoColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Salvar</button>
                              <button onClick={() => setPlaylistEditId(null)} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '8px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: embed ? '1px solid #f3f4f6' : 'none' }}>
                              <span style={{ background: meta.color, color: '#fff', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0, fontWeight: 800 }}>{meta.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                                <div style={{ fontSize: '0.7rem', color: meta.color, fontWeight: 600, marginTop: 1 }}>{meta.label}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <a href={item.url} target="_blank" rel="noopener noreferrer"
                                  style={{ padding: '5px 10px', borderRadius: 7, background: '#f8fafc', border: '1px solid #e5e7eb', color: '#374151', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none' }}>
                                  Abrir
                                </a>
                                <button onClick={() => { setPlaylistEditId(item.id); setPlaylistEditTitle(item.title); setPlaylistEditUrl(item.url); }}
                                  style={{ padding: '5px 8px', borderRadius: 7, background: '#eff6ff', border: 'none', color: '#1d4ed8', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>✏️</button>
                                <button onClick={() => handleDeletePlaylist(item.id)}
                                  style={{ padding: '5px 8px', borderRadius: 7, background: '#fef2f2', border: 'none', color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>🗑</button>
                              </div>
                            </div>
                            {embed && embed.type === 'iframe' && (
                              <iframe src={embed.src} height={embedH} width="100%" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style={{ display: 'block', border: 'none' }} />
                            )}
                            {!embed && (
                              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', textDecoration: 'none', color: meta.color, fontSize: '0.83rem', fontWeight: 600 }}>
                                🔗 Abrir no {meta.label}
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center' }}>
                Plataformas suportadas: Spotify · Deezer · YouTube · TikTok · Kwai · outros links
              </div>
            </div>
          );
        })()}

        {/* ── EVOLUÇÃO / DASHBOARD PESSOAL ── */}
        {activeTab === 'evolucao' && session && (() => {
          // ── helpers ────────────────────────────────────────────────────────
          const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          const todayStr = today.toISOString().split('T')[0];

          // Frequency per month: { '2025-03': 4, ... }
          const byMonth: Record<string, number> = {};
          for (const d of evolucaoDates) {
            const ym = d.slice(0, 7); // 'YYYY-MM'
            byMonth[ym] = (byMonth[ym] || 0) + 1;
          }

          // Last 6 months including current
          const months6: { key: string; label: string; count: number }[] = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            months6.push({ key, label, count: byMonth[key] || 0 });
          }

          const maxCount = Math.max(...months6.map(m => m.count), 1);

          // Last 30 days attendance set
          const last30 = new Set<string>();
          const last30Arr: string[] = [];
          for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const s = d.toISOString().split('T')[0];
            last30Arr.push(s);
            if (evolucaoDates.includes(s)) last30.add(s);
          }

          const totalDays = evolucaoDates.length;
          const thisMonthKey = todayStr.slice(0, 7);
          const thisMonthCount = byMonth[thisMonthKey] || 0;
          const lastMonthKey = (() => {
            const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          })();
          const lastMonthCount = byMonth[lastMonthKey] || 0;

          // Streak — consecutive days (backwards from today)
          let streak = 0;
          for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const s = d.toISOString().split('T')[0];
            if (evolucaoDates.includes(s)) streak++;
            else if (i > 0) break; // gap found
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>📊 Dashboard de Evolução</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Acompanhe sua frequência e evolução nos treinos</p>
              </div>

              {evolucaoLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: '0.9rem' }}>Carregando dados...</div>
              ) : (
                <>
                  {/* Stats cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {[
                      { label: 'Total de treinos', value: totalDays, icon: '🥋', color: nucleoColor, bg: `${nucleoColor}15`, border: `${nucleoColor}30` },
                      { label: 'Este mês', value: thisMonthCount, icon: '📅', color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff' },
                      { label: 'Mês passado', value: lastMonthCount, icon: '📆', color: '#0891b2', bg: '#f0f9ff', border: '#bae6fd' },
                      { label: 'Sequência atual', value: `${streak}d`, icon: '🔥', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{s.icon}</div>
                        <div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 2 }}>{s.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Monthly frequency bar chart */}
                  <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', marginBottom: 16 }}>Frequência Mensal</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                      {months6.map(m => {
                        const heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
                        const isCurrent = m.key === thisMonthKey;
                        return (
                          <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: isCurrent ? nucleoColor : '#6b7280' }}>{m.count}</div>
                            <div style={{ width: '100%', borderRadius: '6px 6px 0 0', background: isCurrent ? nucleoColor : `${nucleoColor}55`, minHeight: 4, height: `${Math.max(heightPct, 4)}%`, transition: 'height 0.3s' }} />
                            <div style={{ fontSize: '0.6rem', color: isCurrent ? nucleoColor : '#9ca3af', fontWeight: isCurrent ? 700 : 400, whiteSpace: 'nowrap' }}>{m.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Last 30 days calendar grid */}
                  <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', marginBottom: 12 }}>Últimos 30 Dias</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 5 }}>
                      {last30Arr.map(d => {
                        const present = last30.has(d);
                        const isToday = d === todayStr;
                        return (
                          <div key={d} title={new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            style={{ aspectRatio: '1', borderRadius: 6, background: present ? nucleoColor : '#f3f4f6', border: isToday ? `2px solid ${nucleoColor}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: present ? '#fff' : '#d1d5db', fontWeight: 700 }}>
                            {new Date(d + 'T12:00:00').getDate()}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: '0.7rem', color: '#9ca3af' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: nucleoColor, display: 'inline-block' }} /> Treinou</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'inline-block' }} /> Não treinou</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, border: `2px solid ${nucleoColor}`, display: 'inline-block' }} /> Hoje</span>
                    </div>
                  </div>

                  {/* Attendance list — last 10 */}
                  {evolucaoDates.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', marginBottom: 12 }}>Últimas Presenças</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[...evolucaoDates].reverse().slice(0, 10).map(d => (
                          <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 10 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: nucleoColor, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                              {new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                            </span>
                          </div>
                        ))}
                      </div>
                      {evolucaoDates.length > 10 && (
                        <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.75rem', color: '#9ca3af' }}>
                          e mais {evolucaoDates.length - 10} registros anteriores
                        </div>
                      )}
                    </div>
                  )}

                  {evolucaoDates.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f9fafb', borderRadius: 16, border: '2px dashed #e5e7eb' }}>
                      <div style={{ fontSize: '3rem', marginBottom: 10 }}>🥋</div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#374151' }}>Nenhuma presença registrada</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 6, lineHeight: 1.5 }}>
                        Use a aba <strong>Presença</strong> para registrar seus treinos. Eles aparecerão aqui automaticamente.
                      </div>
                    </div>
                  )}

                  {/* Performance tip */}
                  {totalDays > 0 && (
                    <div style={{ background: `${nucleoColor}10`, borderRadius: 12, padding: '14px 16px', border: `1px solid ${nucleoColor}30`, fontSize: '0.8rem', color: '#374151', lineHeight: 1.6 }}>
                      {streak >= 7 ? (
                        <span>🔥 <strong>Incrível!</strong> Você está em sequência há {streak} dias. Continue assim!</span>
                      ) : thisMonthCount >= 8 ? (
                        <span>⭐ <strong>Ótima frequência</strong> este mês! {thisMonthCount} treinos registrados.</span>
                      ) : thisMonthCount >= 4 ? (
                        <span>💪 Você treinou {thisMonthCount} vezes este mês. Tente aumentar a frequência para evoluir mais rápido!</span>
                      ) : (
                        <span>📈 Frequência regular é chave para a evolução na capoeira. Tente treinar pelo menos 2x por semana.</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

      </main>
    </div>
  );
}
