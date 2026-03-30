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
  numeracao_unica?: string;
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
  desenvolvimento_atipico?: string[];
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

type Tab = 'dashboard' | 'carteirinha' | 'presenca' | 'financeiro' | 'graduacao' | 'justificativas' | 'fotos' | 'playlist' | 'conta' | 'evolucao' | 'dados' | 'termo';

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
  const [registerForm, setRegisterForm] = useState({ cpf_or_doc: '', username: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  // ── Forgot Password ───────────────────────────────────────────────────────
  const [showForgot, setShowForgot] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotStudentId, setForgotStudentId] = useState('');
  const [forgotStep, setForgotStep] = useState<'lookup' | 'reset' | 'done'>('lookup');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
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
  const [evolucaoEntries, setEvolucaoEntries] = useState<{ date: string; nucleo: string | null; local_nome: string | null; hora: string | null }[]>([]);
  const [evolucaoLoading, setEvolucaoLoading] = useState(false);

  // ── Conta / Perfil ─────────────────────────────────────────────────────────
  const [contaSection, setContaSection] = useState<'main' | 'edit-profile' | 'change-password' | 'delete-account'>('main');
  const [contaForm, setContaForm] = useState({ new_username: '', new_email: '', current_password: '', new_password: '', confirm_password: '' });
  const [contaMsg, setContaMsg] = useState('');
  const [contaMsgType, setContaMsgType] = useState<'success' | 'error'>('success');
  const [contaLoading, setContaLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // ── Meus Dados ────────────────────────────────────────────────────────────
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoMsg, setFotoMsg] = useState('');
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [dadosForm, setDadosForm] = useState({
    nucleo: '', graduacao: '', tipo_graduacao: '',
    cpf: '', identidade: '', numeracao_unica: '', data_nascimento: '',
    telefone: '', email: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
    nome_pai: '', nome_mae: '',
    nome_responsavel: '', cpf_responsavel: '',
    apelido: '', nome_social: '', sexo: '',
    desenvolvimento_atipico: [] as string[],
  });
  const [dadosLoading, setDadosLoading] = useState(false);
  const [dadosMsg, setDadosMsg] = useState('');
  const [dadosMsgType, setDadosMsgType] = useState<'success' | 'error'>('success');
  const [dadosInitialized, setDadosInitialized] = useState(false);

  // ── Termo de Responsabilidade ─────────────────────────────────────────────
  const [termoForm, setTermoForm] = useState({ nome_responsavel: '', cpf_responsavel: '' });
  const [termoSaving, setTermoSaving] = useState(false);
  const [termoSaved, setTermoSaved] = useState(false);
  const [termoMsg, setTermoMsg] = useState('');

  // ── Admin preview mode flag ────────────────────────────────────────────────
  const [isAdminPreview, setIsAdminPreview] = useState(false);

  // ── Load session ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      // Check for admin preview mode via URL param + localStorage token
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin_preview') === '1') {
        const tokenRaw = localStorage.getItem('accbm_admin_preview');
        if (tokenRaw) {
          const token = JSON.parse(tokenRaw);
          if (token?.student_id && token.expires > Date.now()) {
            setIsAdminPreview(true);
            setSession({ student_id: token.student_id, username: '__admin_preview__' });
            loadStudentData(token.student_id, true);
            return;
          }
        }
        // Token invalid/expired — show error
        setLoading(false);
        return;
      }

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
        fetch(`/api/aluno/evolucao?student_id=${session.student_id}`).then(r => r.json()).then(d => { setEvolucaoDates(Array.isArray(d.dates) ? d.dates : []); setEvolucaoEntries(Array.isArray(d.entries) ? d.entries : []); setEvolucaoLoading(false); }).catch(() => setEvolucaoLoading(false));
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
    setRegisterError(''); setRegisterSuccess('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!registerForm.email.trim()) { setRegisterError('E-mail é obrigatório.'); return; }
    if (!emailRegex.test(registerForm.email.trim())) { setRegisterError('Informe um e-mail válido.'); return; }
    if (registerForm.password.length < 6) { setRegisterError('Senha deve ter pelo menos 6 caracteres.'); return; }
    if (registerForm.password !== registerForm.confirmPassword) { setRegisterError('As senhas não coincidem.'); return; }

    setRegisterLoading(true);
    try {
      // Step 1: try by CPF/doc if provided
      if (registerForm.cpf_or_doc.trim()) {
        const res = await fetch('/api/aluno/auth', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register',
            cpf_or_doc: registerForm.cpf_or_doc.trim(),
            username: registerForm.email.trim().toLowerCase(),
            email: registerForm.email.trim().toLowerCase(),
            password: registerForm.password,
            phone: registerForm.phone.trim(),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          // Success — may need OTP or direct login
          if (data.pending_otp) {
            setOtpStudentId(data.student_id || '');
            setOtpPhone(data.phone || '');
            setRegisterSuccess('✅ Cadastro realizado com sucesso! Verifique o código de verificação.');
            setTimeout(() => { setShowRegister(false); setShowOtp(true); }, 1800);
          } else {
            setRegisterSuccess('✅ Cadastro realizado com sucesso! Bem-vindo(a) à ACCBM!');
            setTimeout(() => { setShowRegister(false); }, 1800);
          }
          return;
        }
        // If CPF not found, fall through to name-based
        if (!data.hint || data.hint !== 'nome') {
          setRegisterError(data.error || 'Erro ao criar conta.'); return;
        }
      }

      // Step 2: name-based registration (when no CPF or CPF not found)
      if (!registerForm.cpf_or_doc.trim() || true) {
        if (!registerForm.username.trim()) { setRegisterError('Informe seu nome completo exatamente como está cadastrado.'); return; }
        const res2 = await fetch('/api/aluno/auth', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register-by-name',
            nome_completo: registerForm.username.trim(),
            email: registerForm.email.trim().toLowerCase(),
            password: registerForm.password,
          }),
        });
        const data2 = await res2.json();
        if (!res2.ok) {
          let msg = data2.error || 'Erro ao criar conta.';
          if (data2.candidates?.length) msg += `\n\nNomes similares encontrados:\n• ${data2.candidates.join('\n• ')}`;
          setRegisterError(msg); return;
        }
        // Auto-login after name-based register
        const sess = { student_id: data2.student_id, username: data2.username };
        sessionStorage.setItem('aluno_session', JSON.stringify(sess));
        setRegisterSuccess('✅ Cadastro realizado com sucesso! Bem-vindo(a) à ACCBM!');
        setTimeout(() => {
          setSession(sess);
          if (data2.student) setStudent(data2.student);
          setShowRegister(false);
          setActiveTab('dados'); // Take them straight to complete their data
        }, 1800);
      }
    } catch { setRegisterError('Erro de conexão. Tente novamente.'); }
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

  // Populate termo form when student data is loaded
  useEffect(() => {
    if (student) {
      setTermoForm({
        nome_responsavel: student.nome_responsavel as string || '',
        cpf_responsavel: student.cpf_responsavel as string || '',
      });
      if (student.assinatura_responsavel) setTermoSaved(true);
    }
  }, [student]);

  // Populate dados form when student data is loaded or tab activated
  useEffect(() => {
    if (student && (activeTab === 'dados' || !dadosInitialized)) {
      setDadosForm({
        nucleo:           student.nucleo           as string || '',
        graduacao:        student.graduacao         as string || '',
        tipo_graduacao:   student.tipo_graduacao    as string || '',
        cpf:              student.cpf               as string || '',
        identidade:       student.identidade        as string || '',
        numeracao_unica:  (student.numeracao_unica  as string) || '',
        data_nascimento:  student.data_nascimento   as string || '',
        telefone:         student.telefone          as string || '',
        email:            student.email             as string || '',
        cep:              (student.cep              as string) || '',
        endereco:         (student.endereco         as string) || '',
        numero:           (student.numero           as string) || '',
        complemento:      (student.complemento      as string) || '',
        bairro:           (student.bairro           as string) || '',
        cidade:           (student.cidade           as string) || '',
        estado:           (student.estado           as string) || '',
        nome_pai:         student.nome_pai          as string || '',
        nome_mae:         student.nome_mae          as string || '',
        nome_responsavel: student.nome_responsavel  as string || '',
        cpf_responsavel:  student.cpf_responsavel   as string || '',
        apelido:          student.apelido           as string || '',
        nome_social:      student.nome_social       as string || '',
        sexo:             student.sexo              as string || '',
        desenvolvimento_atipico: Array.isArray(student.desenvolvimento_atipico) ? student.desenvolvimento_atipico as string[] : [],
      });
      setDadosInitialized(true);
    }
  }, [student, activeTab, dadosInitialized]);

  // Gender-based theme: M=green, F=red, otherwise nucleo color
  const genderColor = student?.sexo === 'M' ? '#16a34a' : student?.sexo === 'F' ? '#dc2626' : null;
  const nucleoColor = genderColor || (student ? getNucleoColor(student.nucleo || '') : '#1d4ed8');

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
    const emailValid = !registerForm.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email.trim());
    const passwordsMatch = !registerForm.confirmPassword || registerForm.confirmPassword === registerForm.password;

    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 440, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 36, marginBottom: 4, lineHeight: 1 }}>🤸</div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>Criar Minha Conta</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.5 }}>
              Informe seu nome completo (como cadastrado na associação), e-mail e crie uma senha.
            </p>
          </div>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '9px 13px', marginBottom: 14, fontSize: '0.75rem', color: '#1e40af', lineHeight: 1.6 }}>
            ℹ️ Após criar sua conta, você poderá completar seus dados (núcleo, graduação, CPF, endereço) diretamente na área do aluno.<br/>
            Opcionalmente, informe seu <strong>CPF</strong> para localizar seu cadastro mais rapidamente.
          </div>

          {registerError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 13px', marginBottom: 12, fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
              ⚠️ {registerError}
            </div>
          )}
          {registerSuccess && (
            <div style={{ background: '#f0fdf4', border: '2px solid #86efac', color: '#166534', borderRadius: 14, padding: '16px 18px', marginBottom: 12, fontSize: '0.9rem', fontWeight: 700, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>🎉</div>
              {registerSuccess}
            </div>
          )}

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {/* Nome completo (used as username for name-based lookup) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>
                Nome completo <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={registerForm.username}
                onChange={e => setRegisterForm(p => ({ ...p, username: e.target.value }))}
                placeholder="Ex: João da Silva Santos"
                required autoFocus
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#9ca3af' }}>Exatamente como consta no seu cadastro na associação</p>
            </div>

            {/* CPF (optional — faster lookup) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>
                CPF <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional — para localização mais rápida)</span>
              </label>
              <input
                type="text" inputMode="numeric"
                value={registerForm.cpf_or_doc}
                onChange={e => setRegisterForm(p => ({ ...p, cpf_or_doc: e.target.value }))}
                placeholder="000.000.000-00"
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>
                E-mail <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                value={registerForm.email}
                onChange={e => setRegisterForm(p => ({ ...p, email: e.target.value }))}
                placeholder="seu@email.com"
                required
                style={{ width: '100%', border: `1.5px solid ${registerForm.email && !emailValid ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
              {registerForm.email && !emailValid && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#ef4444' }}>E-mail inválido</p>}
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>
                Senha <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="password"
                value={registerForm.password}
                onChange={e => setRegisterForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                required minLength={6}
                style={{ width: '100%', border: `1.5px solid ${registerForm.password && registerForm.password.length < 6 ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
              {registerForm.password && registerForm.password.length < 6 && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#ef4444' }}>Mínimo 6 caracteres</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>
                Confirmar Senha <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="password"
                value={registerForm.confirmPassword}
                onChange={e => setRegisterForm(p => ({ ...p, confirmPassword: e.target.value }))}
                placeholder="Repita a senha"
                required minLength={6}
                style={{ width: '100%', border: `1.5px solid ${!passwordsMatch ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
              {!passwordsMatch && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#ef4444' }}>As senhas não coincidem</p>}
              {passwordsMatch && registerForm.confirmPassword && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#16a34a' }}>✓ Senhas coincidem</p>}
            </div>

            <button
              type="submit"
              disabled={registerLoading || !!registerSuccess}
              style={{ background: registerLoading ? '#9ca3af' : registerSuccess ? '#16a34a' : 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: registerLoading || registerSuccess ? 'not-allowed' : 'pointer', marginTop: 4 }}>
              {registerLoading ? '⏳ Criando conta...' : registerSuccess ? '✅ Redirecionando...' : '✅ Criar Conta'}
            </button>
          </form>

          <button onClick={() => { setShowRegister(false); setRegisterError(''); setRegisterSuccess(''); }} style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem', padding: '6px 0' }}>
            ← Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
  if (showForgot) {
    const inpStyle = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '11px 14px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' as const };
    const lblStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 600 as const, color: '#374151', marginBottom: 5 };

    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 400, boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>

          {forgotStep === 'done' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>✅</div>
              <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800, color: '#111827' }}>Senha redefinida!</h2>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 20 }}>Sua nova senha foi salva com sucesso. Você já pode fazer login.</p>
              <button onClick={() => { setShowForgot(false); setForgotStep('lookup'); setForgotInput(''); setForgotMsg(''); setResetMsg(''); setResetPassword(''); setResetConfirmPassword(''); }}
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                Entrar agora
              </button>
            </div>
          ) : forgotStep === 'reset' ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div style={{ fontSize: 38, marginBottom: 6 }}>🔒</div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700 }}>Criar nova senha</h2>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>Conta encontrada. Defina uma nova senha abaixo.</p>
              </div>
              {resetMsg && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.83rem' }}>{resetMsg}</div>}
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (resetPassword.length < 6) { setResetMsg('Senha deve ter pelo menos 6 caracteres.'); return; }
                if (resetPassword !== resetConfirmPassword) { setResetMsg('As senhas não coincidem.'); return; }
                setForgotLoading(true); setResetMsg('');
                // Use a dummy OTP since we store it in the account — we'll use forgot-password + reset-password
                const res = await fetch('/api/aluno/auth', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'reset-password', student_id: forgotStudentId, otp: resetOtp, new_password: resetPassword }),
                });
                const data = await res.json();
                setForgotLoading(false);
                if (!res.ok) { setResetMsg(data.error || 'Erro ao redefinir senha.'); return; }
                setForgotStep('done');
              }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lblStyle}>Nova Senha <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                    style={{ ...inpStyle, borderColor: resetPassword && resetPassword.length < 6 ? '#fca5a5' : '#e5e7eb' }}
                    placeholder="Mínimo 6 caracteres" minLength={6} required autoFocus />
                  {resetPassword && resetPassword.length < 6 && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#ef4444' }}>Mínimo 6 caracteres</p>}
                </div>
                <div>
                  <label style={lblStyle}>Confirmar Nova Senha <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="password" value={resetConfirmPassword} onChange={e => setResetConfirmPassword(e.target.value)}
                    style={{ ...inpStyle, borderColor: resetConfirmPassword && resetConfirmPassword !== resetPassword ? '#fca5a5' : resetConfirmPassword && resetConfirmPassword === resetPassword ? '#86efac' : '#e5e7eb' }}
                    placeholder="Repita a nova senha" minLength={6} required />
                  {resetConfirmPassword && resetConfirmPassword !== resetPassword && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#ef4444' }}>As senhas não coincidem</p>}
                  {resetConfirmPassword && resetConfirmPassword === resetPassword && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#16a34a' }}>✓ Senhas coincidem</p>}
                </div>
                <button type="submit" disabled={forgotLoading || resetPassword.length < 6 || resetPassword !== resetConfirmPassword}
                  style={{ background: (resetPassword.length >= 6 && resetPassword === resetConfirmPassword) ? 'linear-gradient(135deg,#1d4ed8,#1e40af)' : '#e5e7eb', color: (resetPassword.length >= 6 && resetPassword === resetConfirmPassword) ? '#fff' : '#9ca3af', border: 'none', borderRadius: 10, padding: 13, fontWeight: 700, fontSize: '0.95rem', cursor: forgotLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                  {forgotLoading ? '⏳ Salvando...' : '✅ Salvar Nova Senha'}
                </button>
              </form>
              <button onClick={() => { setForgotStep('lookup'); setResetMsg(''); }} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem' }}>← Voltar</button>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div style={{ fontSize: 38, marginBottom: 6 }}>🔑</div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700 }}>Recuperar Senha</h2>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>Informe seu e-mail ou usuário para localizar sua conta.</p>
              </div>
              {forgotMsg && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.83rem' }}>{forgotMsg}</div>}
              <form onSubmit={async (e) => {
                e.preventDefault();
                setForgotLoading(true); setForgotMsg('');
                const res = await fetch('/api/aluno/auth', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'forgot-password', username_or_email: forgotInput }),
                });
                const data = await res.json();
                setForgotLoading(false);
                if (data.student_id) {
                  setForgotStudentId(data.student_id);
                  setResetOtp(data.otp_code || ''); // dev mode only
                  setForgotStep('reset');
                } else {
                  setForgotMsg('Conta não encontrada. Verifique o e-mail ou usuário informado.');
                }
              }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lblStyle}>Usuário ou E-mail cadastrado</label>
                  <input type="text" value={forgotInput} onChange={e => setForgotInput(e.target.value)}
                    style={inpStyle} placeholder="seu@email.com ou nome de usuário" required autoFocus />
                </div>
                <button type="submit" disabled={forgotLoading || !forgotInput.trim()}
                  style={{ background: forgotInput.trim() ? 'linear-gradient(135deg,#1d4ed8,#1e40af)' : '#e5e7eb', color: forgotInput.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 10, padding: 13, fontWeight: 700, fontSize: '0.95rem', cursor: forgotLoading ? 'not-allowed' : 'pointer' }}>
                  {forgotLoading ? '⏳ Verificando...' : '🔍 Localizar Minha Conta'}
                </button>
              </form>
              <button onClick={() => { setShowForgot(false); setForgotMsg(''); setForgotInput(''); }} style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem' }}>← Voltar ao login</button>
            </>
          )}
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
  const tabs: { id: Tab; icon: string; label: string; badge?: boolean }[] = [
    { id: 'dashboard',      icon: '🏠', label: 'Início' },
    { id: 'dados',          icon: '✏️', label: 'Meus Dados', badge: !!(student && (!student.nucleo || !student.graduacao || !student.cpf)) },
    { id: 'termo',          icon: '📄', label: 'Termo', badge: !!(student && student.menor_de_idade && !student.assinatura_responsavel) },
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
  const welcomeGreeting = student?.sexo === 'M'
    ? `Seja bem-vindo, ${displayName}! 👋`
    : student?.sexo === 'F'
    ? `Seja bem-vinda, ${displayName}! 👋`
    : `Seja bem-vindo(a), ${displayName}! 👋`;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Admin preview banner */}
      {isAdminPreview && (
        <div style={{ background: '#1d4ed8', color: '#fff', fontSize: '0.75rem', padding: '6px 20px', textAlign: 'center', fontWeight: 600, letterSpacing: '0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Modo visualização admin — você está vendo a área do aluno como <strong style={{ marginLeft: 4 }}>{student?.nome_completo || '...'}</strong>
        </div>
      )}

      {/* Header */}
      <header style={{ color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', backgroundColor: nucleoColor }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {student?.foto_url ? (
              <img src={student.foto_url} alt={displayName} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)' }} />
            ) : (
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="26" height="26" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="32" cy="10" r="7" fill="rgba(255,255,255,0.9)"/>
                  <path d="M32 17 C26 20 22 28 24 36 L20 54" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                  <path d="M32 17 C38 20 42 28 40 36 L44 54" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                  <path d="M24 36 L14 44" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                  <path d="M40 36 L50 32" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                </svg>
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>{displayName}</div>
              {student?.apelido && student.apelido !== student.nome_completo?.split(' ')[0] && (
                <div style={{ fontSize: '0.68rem', opacity: 0.7, lineHeight: 1.2 }}>{student.nome_completo}</div>
              )}
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 1 }}>{student?.nucleo || 'ACCBM'} • {student?.graduacao || 'Aluno'}</div>
            </div>
          </div>
          {isAdminPreview ? (
            <span style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.02em' }}>🔭 Visualização</span>
          ) : (
            <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Sair</button>
          )}
        </div>
      </header>

      {/* Bottom nav (mobile) */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 8px', display: 'flex', overflowX: 'auto', gap: 2 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: activeTab === tab.id ? `2.5px solid ${nucleoColor}` : '2.5px solid transparent', color: activeTab === tab.id ? nucleoColor : '#6b7280', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.7rem', whiteSpace: 'nowrap', transition: 'all 0.15s', minWidth: 60 }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{tab.icon}</span>
              {tab.label}
              {tab.badge && <span style={{ position: 'absolute', top: 4, right: 6, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '1.5px solid #fff' }} />}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Incomplete data / termo pending banners */}
            {student && (!student.nucleo || !student.graduacao || !student.cpf) && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ fontSize: '1.4rem', flexShrink: 0, marginTop: 1 }}>📋</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', marginBottom: 3 }}>Complete seu cadastro</div>
                  <div style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: 1.5, marginBottom: 10 }}>
                    Dados incompletos: <strong>{[!student.nucleo && 'Núcleo', !student.graduacao && 'Graduação', !student.cpf && 'CPF'].filter(Boolean).join(', ')}</strong>
                  </div>
                  <button onClick={() => setActiveTab('dados')}
                    style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                    ✏️ Completar Cadastro
                  </button>
                </div>
              </div>
            )}
            {student && (student.menor_de_idade as boolean) && !student.assinatura_responsavel && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ fontSize: '1.4rem', flexShrink: 0, marginTop: 1 }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#991b1b', marginBottom: 3 }}>Termo de Responsabilidade pendente</div>
                  <div style={{ fontSize: '0.8rem', color: '#7f1d1d', lineHeight: 1.5, marginBottom: 10 }}>
                    Como aluno menor de idade, o termo de autorização ainda não foi assinado.
                  </div>
                  <button onClick={() => setActiveTab('termo')}
                    style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                    ✍️ Assinar Termo
                  </button>
                </div>
              </div>
            )}

            {/* Welcome card */}
            <div style={{ background: `linear-gradient(135deg, ${nucleoColor}, ${nucleoColor}cc)`, borderRadius: 18, padding: '22px 22px', color: '#fff', boxShadow: `0 8px 24px ${nucleoColor}40` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                {student?.foto_url ? (
                  <img src={student.foto_url} alt={displayName} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.5)', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="38" height="38" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="32" cy="10" r="7" fill="rgba(255,255,255,0.9)"/>
                      <path d="M32 17 C26 20 22 28 24 36 L20 54" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                      <path d="M32 17 C38 20 42 28 40 36 L44 54" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                      <path d="M24 36 L14 44" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                      <path d="M40 36 L50 32" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Área do Aluno — ACCBM</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.3 }}>{welcomeGreeting}</div>
                  {student?.apelido && student.nome_completo && student.apelido !== student.nome_completo.split(' ')[0] && (
                    <div style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: 2 }}>{student.nome_completo}</div>
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

        {/* ── MEUS DADOS ── */}
        {activeTab === 'dados' && session && student && (() => {
          // ── CPF validator ──────────────────────────────────────────────────
          const validarCPF = (cpf: string): boolean => {
            const d = cpf.replace(/\D/g, '');
            if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
            let s = 0;
            for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
            let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
            if (r !== parseInt(d[9])) return false;
            s = 0;
            for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
            r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
            return r === parseInt(d[10]);
          };

          // ── graduation lists ───────────────────────────────────────────────
          const GRADS_INFANTIL = [
            'Crua', 'Crua ponta cinza', 'Crua ponta amarela', 'Crua ponta laranja',
            'Crua ponta verde', 'Crua ponta azul', 'Crua ponta roxa',
            'Crua e cinza', 'Crua e laranja', 'Crua e verde', 'Crua e azul', 'Crua e roxa',
            'Cinza', 'Cinza e amarela', 'Amarela e verde', 'Amarela e azul',
          ];
          const GRADS_ADULTO = [
            'Crua', 'Crua e amarela', 'Amarela', 'Amarela e laranja', 'Laranja',
            'Laranja e azul',
            'Azul — Primeiro grau de aluno graduado',
            'Azul e verde — Segundo grau de aluno graduado',
            'Verde — Monitor',
            'Verde e roxa — Primeiro grau de instrutor',
            'Roxa — Segundo grau de instrutor',
            'Roxa e marrom — Primeiro grau de professor',
            'Marrom — Segundo grau de professor',
            'Marrom e vermelha — Mestrando',
            'Vermelha — Primeiro grau de mestre',
            'Branco e vermelha — Segundo grau de mestre',
            'Branco mor — Mestre Fundador',
          ];

          // Auto-detect tipo from birth date
          let autoTipo: 'Infantil' | 'Adulto' | '' = '';
          const dob = dadosForm.data_nascimento || (student.data_nascimento as string) || '';
          if (dob) {
            const birthDate = new Date(dob + 'T12:00:00');
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
            autoTipo = age < 14 ? 'Infantil' : 'Adulto';
          }
          const tipoEfetivo = (dadosForm.tipo_graduacao || autoTipo) as 'Infantil' | 'Adulto' | '';
          const gradOpts = tipoEfetivo === 'Infantil' ? GRADS_INFANTIL : tipoEfetivo === 'Adulto' ? GRADS_ADULTO : [...GRADS_INFANTIL, ...GRADS_ADULTO];

          // ── masks ──────────────────────────────────────────────────────────
          const maskCPF = (v: string) => {
            const d = v.replace(/\D/g, '').slice(0, 11);
            if (d.length <= 3) return d;
            if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
            if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
            return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
          };
          const maskPhone = (v: string) => {
            const d = v.replace(/\D/g, '').slice(0, 11);
            if (d.length <= 2) return d.length ? `(${d}` : '';
            if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
            if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
            return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
          };
          const maskCEP = (v: string) => {
            const d = v.replace(/\D/g, '').slice(0, 8);
            return d.length > 5 ? `${d.slice(0,5)}-${d.slice(5)}` : d;
          };

          // ── CEP auto-fill (via server proxy to avoid CORS) ────────────────
          const handleCepBlur = async (cep: string) => {
            const digits = cep.replace(/\D/g, '');
            if (digits.length !== 8) return;
            try {
              const r = await fetch(`/api/cep?cep=${digits}`);
              if (!r.ok) return;
              const d = await r.json();
              if (d.error) return;
              setDadosForm(p => ({
                ...p,
                endereco: d.logradouro || p.endereco,
                bairro:   d.bairro     || p.bairro,
                cidade:   d.localidade || p.cidade,
                estado:   d.uf         || p.estado,
              }));
            } catch { /* silently ignore */ }
          };

          // ── save ───────────────────────────────────────────────────────────
          const handleSaveDados = async () => {
            // Numeração Única rule: if filled, CPF and Identidade must be blank
            if (dadosForm.numeracao_unica.trim()) {
              if (dadosForm.cpf.replace(/\D/g,'').length > 0 || dadosForm.identidade.trim()) {
                setDadosMsg('⚠️ Ao preencher a Numeração Única, os campos CPF e Identidade devem ficar em branco para evitar conflito de identificação.');
                setDadosMsgType('error');
                return;
              }
            }
            // CPF validation before save
            if (dadosForm.cpf) {
              const cpfDigits = dadosForm.cpf.replace(/\D/g, '');
              if (cpfDigits.length > 0 && !validarCPF(dadosForm.cpf)) {
                setDadosMsg('CPF inválido. Verifique os dígitos e tente novamente.');
                setDadosMsgType('error');
                return;
              }
            }
            setDadosLoading(true); setDadosMsg('');
            try {
              const payload = {
                ...dadosForm,
                tipo_graduacao: dadosForm.tipo_graduacao || autoTipo || dadosForm.tipo_graduacao,
              };
              const res = await fetch('/api/aluno/dados', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_id: session.student_id, ...payload }),
              });
              const data = await res.json();
              if (res.ok) {
                setDadosMsg('✅ Dados salvos com sucesso!');
                setDadosMsgType('success');
                if (data.student) setStudent(data.student);
              } else {
                setDadosMsg(data.error || 'Erro ao salvar.');
                setDadosMsgType('error');
              }
            } catch { setDadosMsg('Erro de conexão.'); setDadosMsgType('error'); }
            setDadosLoading(false);
          };

          const handleFotoUpload = async (file: File) => {
            setFotoUploading(true); setFotoMsg('');
            try {
              const fd = new FormData();
              fd.append('student_id', session.student_id);
              fd.append('foto', file);
              const res = await fetch('/api/aluno/dados', { method: 'POST', body: fd });
              const data = await res.json();
              if (res.ok && data.foto_url) {
                setStudent(prev => prev ? { ...prev, foto_url: data.foto_url } : prev);
                setFotoMsg('✅ Foto atualizada com sucesso!');
              } else {
                setFotoMsg(data.error || 'Erro ao enviar foto.');
              }
            } catch { setFotoMsg('Erro de conexão.'); }
            setFotoUploading(false);
          };

          const nucleo_opts = ['Poliesportivo Edson Alves', 'Poliesportivo do Ipiranga', 'Saracuruna', 'Vila Urussaí', 'Jayme Fichman', 'Academia Mais Saúde'];
          const sexo_opts = [{ v: 'M', l: 'Masculino' }, { v: 'F', l: 'Feminino' }, { v: 'O', l: 'Outro' }];
          const estados = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
          const isMissing = !student.nucleo || !student.graduacao || !student.cpf;
          const fs: React.CSSProperties = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#fff' };
          const ls: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 };
          const sec: React.CSSProperties = { fontWeight: 800, fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #f3f4f6' };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>✏️ Meus Dados</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Complete ou atualize suas informações de cadastro</p>
              </div>

              {/* ── Foto de Perfil ── */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flexShrink: 0, position: 'relative' }}>
                  {student.foto_url ? (
                    <img src={student.foto_url as string} alt={student.nome_completo} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${nucleoColor}40` }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${nucleoColor}18`, border: `3px solid ${nucleoColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="42" height="42" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="14" r="9" fill={nucleoColor} opacity="0.7"/>
                        <path d="M32 23 C24 27 20 37 22 46 L18 62" stroke={nucleoColor} strokeWidth="4" strokeLinecap="round" opacity="0.7"/>
                        <path d="M32 23 C40 27 44 37 42 46 L46 62" stroke={nucleoColor} strokeWidth="4" strokeLinecap="round" opacity="0.7"/>
                        <path d="M22 46 L10 54" stroke={nucleoColor} strokeWidth="4" strokeLinecap="round" opacity="0.7"/>
                        <path d="M42 46 L54 40" stroke={nucleoColor} strokeWidth="4" strokeLinecap="round" opacity="0.7"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', marginBottom: 2 }}>Foto de Perfil</div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 8 }}>JPG, PNG — máx. 5 MB. Aparece na carteirinha e no painel.</div>
                  {fotoMsg && <div style={{ fontSize: '0.75rem', color: fotoMsg.startsWith('✅') ? '#16a34a' : '#dc2626', marginBottom: 6, fontWeight: 600 }}>{fotoMsg}</div>}
                  <input ref={fotoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFotoUpload(f); e.target.value = ''; }} />
                  <button onClick={() => fotoInputRef.current?.click()} disabled={fotoUploading}
                    style={{ background: fotoUploading ? '#e5e7eb' : `${nucleoColor}18`, color: fotoUploading ? '#9ca3af' : nucleoColor, border: `1.5px solid ${fotoUploading ? '#e5e7eb' : nucleoColor}40`, borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: '0.8rem', cursor: fotoUploading ? 'not-allowed' : 'pointer' }}>
                    {fotoUploading ? '⏳ Enviando...' : student.foto_url ? '🔄 Trocar Foto' : '📷 Adicionar Foto'}
                  </button>
                </div>
              </div>

              {/* ── Matrícula ── */}
              {(student.ordem_inscricao || alunoInscricaoNum) && (
                <div style={{ background: `${nucleoColor}08`, border: `1px solid ${nucleoColor}30`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${nucleoColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>🪪</div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>Matrícula</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: nucleoColor, fontFamily: 'monospace' }}>
                      #{String(student.ordem_inscricao as number || alunoInscricaoNum || 0).padStart(4, '0')}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Número de matrícula na associação</div>
                  </div>
                </div>
              )}

              {/* Aviso de completude obrigatório */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 16px', fontSize: '0.82rem', color: '#1e40af', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>📝</span>
                <div>
                  <div>Por favor, complete e atualize todos os dados do seu cadastro.</div>
                  <div style={{ fontWeight: 400, fontSize: '0.75rem', marginTop: 3, color: '#3b82f6' }}>
                    Caso preencha a <strong>Numeração Única</strong>, deixe os campos <strong>CPF</strong> e <strong>Identidade</strong> em branco para evitar conflito de identificação.
                  </div>
                </div>
              </div>

              {isMissing && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', fontSize: '0.8rem', color: '#92400e' }}>
                  ⚠️ Dados incompletos: <strong>{[!student.nucleo && 'Núcleo', !student.graduacao && 'Graduação', !student.cpf && 'CPF'].filter(Boolean).join(', ')}</strong>. Preencha abaixo.
                </div>
              )}

              {dadosMsg && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: dadosMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${dadosMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: dadosMsgType === 'success' ? '#166534' : '#991b1b', fontSize: '0.83rem', fontWeight: 600 }}>
                  {dadosMsg}
                </div>
              )}

              {/* ── Identificação na Associação ── */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={sec}>Identificação na Associação</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={ls}>Núcleo <span style={{ color: '#ef4444' }}>*</span></label>
                    <select value={dadosForm.nucleo} onChange={e => setDadosForm(p => ({ ...p, nucleo: e.target.value }))} style={fs}>
                      <option value="">— Selecione seu núcleo —</option>
                      {nucleo_opts.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>

                  {/* Tipo de graduação — determinado pela data de nascimento ou seleção manual */}
                  <div>
                    <label style={ls}>Tipo de Graduação</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['Infantil', 'Adulto'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setDadosForm(p => ({ ...p, tipo_graduacao: t, graduacao: '' }))}
                          style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `2px solid ${tipoEfetivo === t ? nucleoColor : '#e5e7eb'}`, background: tipoEfetivo === t ? `${nucleoColor}18` : '#fff', color: tipoEfetivo === t ? nucleoColor : '#374151', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                          {t === 'Infantil' ? '👦 Infantil' : '🧑 Adulto'}
                        </button>
                      ))}
                    </div>
                    {autoTipo && !dadosForm.tipo_graduacao && (
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>
                        Detectado automaticamente como <strong>{autoTipo}</strong> com base na data de nascimento
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={ls}>Graduação <span style={{ color: '#ef4444' }}>*</span></label>
                    <select value={dadosForm.graduacao} onChange={e => setDadosForm(p => ({ ...p, graduacao: e.target.value }))} style={fs}>
                      <option value="">— Selecione sua graduação —</option>
                      {tipoEfetivo && <optgroup label={`Graduação ${tipoEfetivo}`}>
                        {gradOpts.map(g => <option key={g} value={g}>{g}</option>)}
                      </optgroup>}
                      {!tipoEfetivo && <>
                        <optgroup label="Graduação Infantil">{GRADS_INFANTIL.map(g => <option key={g} value={g}>{g}</option>)}</optgroup>
                        <optgroup label="Graduação Adulta">{GRADS_ADULTO.map(g => <option key={g} value={g}>{g}</option>)}</optgroup>
                      </>}
                    </select>
                    {tipoEfetivo && (
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>
                        Exibindo graduações para: <strong>{tipoEfetivo}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Dados Pessoais ── */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={sec}>Dados Pessoais</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={ls}>Apelido / Apelido na Capoeira</label>
                    <input value={dadosForm.apelido} onChange={e => setDadosForm(p => ({ ...p, apelido: e.target.value }))} style={fs} placeholder="Como te chamam" />
                  </div>
                  <div>
                    <label style={ls}>Nome Social</label>
                    <input value={dadosForm.nome_social} onChange={e => setDadosForm(p => ({ ...p, nome_social: e.target.value }))} style={fs} placeholder="Nome social (opcional)" />
                  </div>
                  <div>
                    <label style={ls}>Sexo</label>
                    <select value={dadosForm.sexo} onChange={e => setDadosForm(p => ({ ...p, sexo: e.target.value }))} style={fs}>
                      <option value="">— Selecione —</option>
                      {sexo_opts.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={ls}>Data de Nascimento</label>
                    <input type="date" value={dadosForm.data_nascimento} onChange={e => {
                      const dob = e.target.value;
                      setDadosForm(p => ({ ...p, data_nascimento: dob }));
                      // Auto-detect minor → show Termo alert
                      if (dob) {
                        const age = (new Date().getFullYear()) - parseInt(dob.slice(0,4));
                        const isMinor = age < 18;
                        if (isMinor) {
                          setDadosMsg('⚠️ Aluno menor de idade detectado. O Termo de Responsabilidade é obrigatório — acesse a aba Termo.');
                          setDadosMsgType('error');
                        }
                      }
                    }} style={fs} />
                    {(() => {
                      if (!dadosForm.data_nascimento) return null;
                      const age = (new Date().getFullYear()) - parseInt(dadosForm.data_nascimento.slice(0,4));
                      if (age >= 18) return null;
                      return (
                        <div style={{ marginTop: 6, background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '7px 10px', fontSize: '0.75rem', color: '#854d0e' }}>
                          ⚠️ Menor de idade — Termo de Responsabilidade obrigatório.{' '}
                          <button type="button" onClick={() => setActiveTab('termo')} style={{ background: '#854d0e', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}>Assinar Termo →</button>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label style={ls}>CPF <span style={{ color: '#ef4444' }}>*</span></label>
                    <input value={dadosForm.cpf} onChange={e => setDadosForm(p => ({ ...p, cpf: maskCPF(e.target.value) }))}
                      style={{ ...fs, borderColor: dadosForm.cpf && dadosForm.cpf.replace(/\D/g,'').length === 11 ? (validarCPF(dadosForm.cpf) ? '#86efac' : '#fca5a5') : '#e5e7eb' }}
                      placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                    {dadosForm.cpf && dadosForm.cpf.replace(/\D/g,'').length === 11 && (
                      <div style={{ fontSize: '0.7rem', marginTop: 3, fontWeight: 600, color: validarCPF(dadosForm.cpf) ? '#16a34a' : '#dc2626' }}>
                        {validarCPF(dadosForm.cpf) ? '✓ CPF válido' : '✗ CPF inválido — verifique os dígitos'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={ls}>Identidade (RG)</label>
                    <input value={dadosForm.identidade} onChange={e => setDadosForm(p => ({ ...p, identidade: e.target.value }))} style={fs} placeholder="Número do RG" />
                  </div>
                  <div>
                    <label style={ls}>Numeração Única</label>
                    <input value={dadosForm.numeracao_unica} onChange={e => setDadosForm(p => ({ ...p, numeracao_unica: e.target.value }))}
                      style={{ ...fs, borderColor: dadosForm.numeracao_unica.trim() && (dadosForm.cpf.replace(/\D/g,'').length > 0 || dadosForm.identidade.trim()) ? '#fca5a5' : '#e5e7eb' }}
                      placeholder="Ex: 0042 (exclusivo por aluno)" maxLength={20} />
                    {dadosForm.numeracao_unica.trim() && (dadosForm.cpf.replace(/\D/g,'').length > 0 || dadosForm.identidade.trim()) ? (
                      <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 3, fontWeight: 600 }}>
                        ⚠️ Com Numeração Única preenchida, deixe CPF e Identidade em branco
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>Identificador único do aluno no sistema ACCBM</div>
                    )}
                  </div>
                  <div>
                    <label style={ls}>Telefone / WhatsApp</label>
                    <input value={dadosForm.telefone} onChange={e => setDadosForm(p => ({ ...p, telefone: maskPhone(e.target.value) }))} style={fs} placeholder="(21) 99999-0000" inputMode="numeric" maxLength={16} />
                  </div>
                  <div>
                    <label style={ls}>E-mail</label>
                    <input type="email" value={dadosForm.email} onChange={e => setDadosForm(p => ({ ...p, email: e.target.value }))} style={fs} placeholder="seu@email.com" />
                  </div>
                </div>
              </div>

              {/* ── Endereço ── */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={sec}>Endereço</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={ls}>CEP</label>
                    <input value={dadosForm.cep}
                      onChange={e => setDadosForm(p => ({ ...p, cep: maskCEP(e.target.value) }))}
                      onBlur={e => handleCepBlur(e.target.value)}
                      style={fs} placeholder="00000-000" inputMode="numeric" maxLength={9} />
                    <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>Endereço preenchido automaticamente ao sair do campo</div>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={ls}>Logradouro (Rua / Avenida)</label>
                    <input value={dadosForm.endereco} onChange={e => setDadosForm(p => ({ ...p, endereco: e.target.value }))} style={fs} placeholder="Rua, Avenida..." />
                  </div>
                  <div>
                    <label style={ls}>Número</label>
                    <input value={dadosForm.numero} onChange={e => setDadosForm(p => ({ ...p, numero: e.target.value }))} style={fs} placeholder="Nº" />
                  </div>
                  <div>
                    <label style={ls}>Complemento</label>
                    <input value={dadosForm.complemento} onChange={e => setDadosForm(p => ({ ...p, complemento: e.target.value }))} style={fs} placeholder="Apto, Bloco..." />
                  </div>
                  <div>
                    <label style={ls}>Bairro</label>
                    <input value={dadosForm.bairro} onChange={e => setDadosForm(p => ({ ...p, bairro: e.target.value }))} style={fs} placeholder="Bairro" />
                  </div>
                  <div>
                    <label style={ls}>Cidade</label>
                    <input value={dadosForm.cidade} onChange={e => setDadosForm(p => ({ ...p, cidade: e.target.value }))} style={fs} placeholder="Cidade" />
                  </div>
                  <div>
                    <label style={ls}>Estado (UF)</label>
                    <select value={dadosForm.estado} onChange={e => setDadosForm(p => ({ ...p, estado: e.target.value }))} style={fs}>
                      <option value="">— UF —</option>
                      {estados.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Filiação ── */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={sec}>Filiação</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={ls}>Nome do Pai</label>
                    <input value={dadosForm.nome_pai} onChange={e => setDadosForm(p => ({ ...p, nome_pai: e.target.value }))} style={fs} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label style={ls}>Nome da Mãe</label>
                    <input value={dadosForm.nome_mae} onChange={e => setDadosForm(p => ({ ...p, nome_mae: e.target.value }))} style={fs} placeholder="Nome completo" />
                  </div>
                  {(autoTipo === 'Infantil' || (student.menor_de_idade as boolean)) && (
                    <>
                      <div>
                        <label style={ls}>Nome do Responsável Legal</label>
                        <input value={dadosForm.nome_responsavel} onChange={e => setDadosForm(p => ({ ...p, nome_responsavel: e.target.value }))} style={fs} placeholder="Nome completo do responsável" />
                      </div>
                      <div>
                        <label style={ls}>CPF do Responsável</label>
                        <input value={dadosForm.cpf_responsavel} onChange={e => setDadosForm(p => ({ ...p, cpf_responsavel: maskCPF(e.target.value) }))} style={fs} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                      </div>
                    </>
                  )}
                </div>
                {(autoTipo === 'Infantil' || (student.menor_de_idade as boolean)) && (
                  <div style={{ marginTop: 10, background: '#eff6ff', borderRadius: 8, padding: '8px 12px', fontSize: '0.75rem', color: '#1e40af' }}>
                    ℹ️ Como aluno(a) menor de idade, o Termo de Responsabilidade também deve ser assinado. Acesse a aba <strong>📄 Termo</strong>.
                    <button onClick={() => setActiveTab('termo')} style={{ marginLeft: 8, background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Ver Termo</button>
                  </div>
                )}
              </div>

              {/* ── Desenvolvimento Atípico / Necessidades Específicas ── */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={sec}>Desenvolvimento Atípico / Necessidades Específicas</div>
                <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 0, marginBottom: 12 }}>Campo opcional. Selecione todas as condições que se aplicam.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    'Transtorno do Espectro Autista (TEA)',
                    'Deficiência intelectual',
                    'Dislexia',
                    'Transtorno de ansiedade',
                    'Atraso no desenvolvimento (fala, motor ou cognitivo)',
                    'Deficiência auditiva',
                    'Transtorno Opositivo Desafiador (TOD)',
                    'Epilepsia',
                    'Transtorno de Déficit de Atenção e Hiperatividade (TDAH)',
                    'Síndrome de Down',
                    'Discalculia',
                    'Transtorno de aprendizagem',
                    'Deficiência visual',
                    'Deficiência física motora',
                    'Altas habilidades / superdotação',
                    'Outros',
                  ].map(opt => {
                    const checked = dadosForm.desenvolvimento_atipico.includes(opt);
                    return (
                      <label key={opt} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.78rem', color: '#374151', padding: '6px 8px', background: checked ? `${nucleoColor}08` : 'transparent', borderRadius: 8, border: `1px solid ${checked ? nucleoColor + '30' : 'transparent'}`, transition: 'all 0.15s' }}>
                        <input type="checkbox" checked={checked} onChange={e => {
                          if (e.target.checked) setDadosForm(p => ({ ...p, desenvolvimento_atipico: [...p.desenvolvimento_atipico, opt] }));
                          else setDadosForm(p => ({ ...p, desenvolvimento_atipico: p.desenvolvimento_atipico.filter(x => x !== opt) }));
                        }} style={{ marginTop: 2, flexShrink: 0, accentColor: nucleoColor }} />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
                {dadosForm.desenvolvimento_atipico.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: '0.72rem', color: nucleoColor, fontWeight: 600 }}>
                    ✓ {dadosForm.desenvolvimento_atipico.length} condição(ões) selecionada(s)
                  </div>
                )}
              </div>

              <button onClick={handleSaveDados} disabled={dadosLoading}
                style={{ background: dadosLoading ? '#9ca3af' : `linear-gradient(135deg, ${nucleoColor}, ${nucleoColor}bb)`, color: '#fff', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 800, fontSize: '0.95rem', cursor: dadosLoading ? 'not-allowed' : 'pointer', boxShadow: dadosLoading ? 'none' : `0 4px 14px ${nucleoColor}40` }}>
                {dadosLoading ? '⏳ Salvando...' : '💾 Salvar Meus Dados'}
              </button>

              <div style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
                Os dados são salvos diretamente no banco e aparecem no painel administrativo imediatamente.
              </div>
            </div>
          );
        })()}

        {/* ── TERMO DE RESPONSABILIDADE ── */}
        {activeTab === 'termo' && session && student && (() => {
          const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
          const isMenor = (student.menor_de_idade as boolean) === true;
          const maskCPFt = (v: string) => {
            const d = v.replace(/\D/g, '').slice(0, 11);
            if (d.length <= 3) return d;
            if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
            if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
            return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
          };
          const handleSaveTermo = async () => {
            if (!termoForm.nome_responsavel.trim()) { setTermoMsg('Preencha o nome do responsável antes de confirmar.'); return; }
            setTermoSaving(true); setTermoMsg('');
            try {
              const res = await fetch('/api/aluno/dados', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  student_id: session.student_id,
                  nome_responsavel: termoForm.nome_responsavel,
                  cpf_responsavel: termoForm.cpf_responsavel,
                }),
              });
              if (!res.ok) throw new Error('api');
              // Also set assinatura_responsavel via the termo API
              await fetch(`/api/termo?id=${session.student_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome_responsavel: termoForm.nome_responsavel, cpf_responsavel: termoForm.cpf_responsavel }),
              });
              setTermoSaved(true);
              setStudent(prev => prev ? { ...prev, nome_responsavel: termoForm.nome_responsavel, cpf_responsavel: termoForm.cpf_responsavel, assinatura_responsavel: true } : prev);
              setTermoMsg('✅ Termo assinado e salvo com sucesso!');
            } catch { setTermoMsg('Erro ao salvar. Tente novamente.'); }
            setTermoSaving(false);
          };
          const handlePrint = () => {
            const w = window.open('', '_blank', 'width=720,height=900');
            if (!w) return;
            w.document.write(`<!DOCTYPE html><html><head><title>Termo — ${student.nome_completo}</title><style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:20px;color:#111}h1{text-align:center;font-size:1.3rem}p{line-height:1.9;text-align:justify}.box{background:#f9f9f9;border:1px solid #ccc;padding:14px 18px;border-radius:8px;margin-bottom:20px;font-family:sans-serif}.label{font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:#666}.value{font-weight:700;font-size:0.95rem}.sig{margin-top:40px;display:flex;justify-content:space-between}.line{border-top:1px solid #333;width:260px;text-align:center;padding-top:6px;font-size:0.8rem;font-family:sans-serif}</style></head><body>
              <h1>Termo de Autorização para Prática de Capoeira</h1>
              <p style="text-align:center;font-size:0.9rem;margin-bottom:24px">Associação Cultural de Capoeira Barão de Mauá</p>
              <div class="box">
                <div class="label">Aluno</div><div class="value">${student.nome_completo}</div>
                <div class="label" style="margin-top:8px">Núcleo</div><div class="value">${student.nucleo || '—'}</div>
                <div class="label" style="margin-top:8px">Data de Nascimento</div><div class="value">${student.data_nascimento ? new Date((student.data_nascimento as string)+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                <div class="label" style="margin-top:8px">Data</div><div class="value">${hoje}</div>
              </div>
              <p>Eu, <strong>${termoForm.nome_responsavel || '________________________'}</strong>, portador(a) do CPF <strong>${termoForm.cpf_responsavel || '___.___.___-__'}</strong>, responsável legal pelo menor <strong>${student.nome_completo}</strong>, autorizo sua participação nas atividades de capoeira realizadas pela <strong>Associação Cultural de Capoeira Barão de Mauá</strong>, estando ciente das atividades físicas envolvidas, e assumindo a responsabilidade integral pela participação do menor nas referidas atividades.</p>
              <div class="sig">
                <div class="line">Assinatura do Responsável</div>
                <div class="line">Local e Data</div>
              </div>
            </body></html>`);
            w.document.close();
            w.focus();
            setTimeout(() => w.print(), 400);
          };

          if (!isMenor) return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>📄 Termo de Responsabilidade</h2>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#166534', marginBottom: 6 }}>Não aplicável</div>
                <div style={{ fontSize: '0.82rem', color: '#15803d', lineHeight: 1.5 }}>
                  Este aluno é maior de idade e não necessita de Termo de Responsabilidade.<br />
                  O termo é obrigatório apenas para alunos menores de 18 anos.
                </div>
              </div>
            </div>
          );

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>📄 Termo de Responsabilidade</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Autorização para prática de capoeira — menor de idade</p>
              </div>

              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: termoSaved ? '#f0fdf4' : '#fffbeb', border: `1px solid ${termoSaved ? '#bbf7d0' : '#fde68a'}`, borderRadius: 12, padding: '12px 16px' }}>
                <span style={{ fontSize: '1.4rem' }}>{termoSaved ? '✅' : '⏳'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: termoSaved ? '#166534' : '#92400e' }}>
                    {termoSaved ? 'Termo assinado' : 'Assinatura pendente'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: termoSaved ? '#15803d' : '#78350f' }}>
                    {termoSaved ? `Responsável: ${termoForm.nome_responsavel}` : 'O responsável precisa assinar o termo abaixo'}
                  </div>
                </div>
                {termoSaved && (
                  <button onClick={handlePrint} style={{ marginLeft: 'auto', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                    🖨️ Imprimir / PDF
                  </button>
                )}
              </div>

              {termoMsg && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: termoMsg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${termoMsg.startsWith('✅') ? '#bbf7d0' : '#fecaca'}`, color: termoMsg.startsWith('✅') ? '#166534' : '#991b1b', fontSize: '0.83rem', fontWeight: 600 }}>
                  {termoMsg}
                </div>
              )}

              {/* Documento */}
              <div style={{ background: '#fff', border: `2px solid ${nucleoColor}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ background: nucleoColor, padding: '14px 20px', textAlign: 'center' }}>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ⚠️ Autorização de Participação — Menor de Idade
                  </div>
                </div>
                <div style={{ padding: '24px 22px', fontFamily: 'Georgia, serif' }}>
                  {/* Dados do aluno */}
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 22, fontFamily: 'sans-serif', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.83rem' }}>
                    <div><span style={{ color: '#6b7280' }}>Aluno: </span><strong>{student.nome_completo}</strong></div>
                    <div><span style={{ color: '#6b7280' }}>Núcleo: </span><strong>{student.nucleo || '—'}</strong></div>
                    <div><span style={{ color: '#6b7280' }}>Nascimento: </span><strong>{student.data_nascimento ? new Date((student.data_nascimento as string)+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong></div>
                    <div><span style={{ color: '#6b7280' }}>Data: </span><strong>{hoje}</strong></div>
                  </div>
                  <p style={{ textAlign: 'justify', lineHeight: 1.9, marginBottom: 22, fontSize: '0.9rem' }}>
                    Eu, responsável legal pelo menor acima identificado, autorizo sua participação nas atividades de capoeira realizadas pela <strong>Associação Cultural de Capoeira Barão de Mauá</strong>, estando ciente das atividades físicas envolvidas, e assumindo a responsabilidade integral pela participação do menor nas referidas atividades.
                  </p>
                  <hr style={{ border: 'none', borderTop: '1px dashed rgba(0,0,0,0.15)', marginBottom: 20 }} />
                  {/* Campos do responsável */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontFamily: 'sans-serif' }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                        Nome do Responsável Legal <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input value={termoForm.nome_responsavel} onChange={e => setTermoForm(p => ({ ...p, nome_responsavel: e.target.value }))}
                        disabled={termoSaved} placeholder="Nome completo do responsável (pai, mãe ou tutor legal)"
                        style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', opacity: termoSaved ? 0.7 : 1, fontFamily: 'Georgia, serif' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                        CPF do Responsável <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input value={termoForm.cpf_responsavel}
                        onChange={e => setTermoForm(p => ({ ...p, cpf_responsavel: maskCPFt(e.target.value) }))}
                        disabled={termoSaved} placeholder="000.000.000-00" inputMode="numeric" maxLength={14}
                        style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', opacity: termoSaved ? 0.7 : 1 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
                        Assinatura digital via sistema ACCBM<br />
                        <span style={{ fontSize: '0.7rem' }}>{hoje}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!termoSaved ? (
                <button onClick={handleSaveTermo} disabled={termoSaving || !termoForm.nome_responsavel.trim()}
                  style={{ background: termoForm.nome_responsavel.trim() ? `linear-gradient(135deg, #dc2626, #b91c1c)` : '#e5e7eb', color: termoForm.nome_responsavel.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 800, fontSize: '0.95rem', cursor: termoForm.nome_responsavel.trim() ? 'pointer' : 'not-allowed', boxShadow: termoForm.nome_responsavel.trim() ? '0 4px 14px rgba(220,38,38,0.35)' : 'none' }}>
                  {termoSaving ? '⏳ Salvando...' : '✍️ Confirmar e Assinar Termo'}
                </button>
              ) : (
                <button onClick={handlePrint}
                  style={{ background: 'linear-gradient(135deg, #1e40af, #1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(30,64,175,0.3)' }}>
                  🖨️ Imprimir / Baixar PDF do Termo
                </button>
              )}

              <div style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
                Este termo é vinculado ao cadastro do aluno e fica visível para o administrador do núcleo.
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
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', marginBottom: 12 }}>Histórico de Presenças</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {([...evolucaoEntries].length > 0
                          ? [...evolucaoEntries].reverse()
                          : [...evolucaoDates].reverse().map(d => ({ date: d, nucleo: null, local_nome: null, hora: null }))
                        ).slice(0, 10).map(entry => {
                          const localLabel = entry.local_nome || entry.nucleo || null;
                          return (
                            <div key={entry.date} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, borderLeft: `3px solid ${nucleoColor}` }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: nucleoColor, flexShrink: 0, marginTop: 5 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', textTransform: 'capitalize' }}>
                                  {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                </div>
                                {localLabel && (
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                    <span>Núcleo: <strong style={{ color: '#374151' }}>{localLabel}</strong></span>
                                  </div>
                                )}
                                {entry.hora && (
                                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    {entry.hora}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
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
