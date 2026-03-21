'use client';

import { useState, useEffect, useCallback } from 'react';
import Carteirinha from '@/components/Carteirinha';
import Link from 'next/link';

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

type Tab = 'dashboard' | 'carteirinha' | 'presenca' | 'financeiro' | 'graduacao' | 'justificativas' | 'perfil';

const NUCLEO_COLORS: Record<string, string> = {
  'Poliesportivo Edson Alves': '#dc2626',
  'Poliesportivo do Ipiranga': '#ea580c',
  'Saracuruna': '#16a34a',
  'Vila Urussaí': '#9333ea',
  'Jayme Fichman': '#0891b2',
};

function getNucleoColor(nucleo: string): string {
  return NUCLEO_COLORS[nucleo] || '#1d4ed8';
}

export default function AlunoPage() {
  const [session, setSession] = useState<{ student_id: string; username: string } | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);

  // Login state
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  // OTP state
  const [showOtp, setShowOtp] = useState(false);
  const [otpStudentId, setOtpStudentId] = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // Register state
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    student_id: '', username: '', email: '', password: '', confirmPassword: '', phone: '',
  });
  const [registerError, setRegisterError] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  // Forgot password
  const [showForgot, setShowForgot] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotStudentId, setForgotStudentId] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  // Justificativas
  const [justificativas, setJustificativas] = useState<Justificativa[]>([]);
  const [justForm, setJustForm] = useState({ data_falta: '', motivo: '' });
  const [justLoading, setJustLoading] = useState(false);
  const [justMsg, setJustMsg] = useState('');

  // Presença
  const [presencaMsg, setPresencaMsg] = useState('');
  const [presencaLoading, setPresencaLoading] = useState(false);

  // Load session from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('aluno_session');
      if (raw) {
        const sess = JSON.parse(raw);
        setSession(sess);
        loadStudentData(sess.student_id);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  const loadStudentData = useCallback(async (student_id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aluno/dados?student_id=${student_id}`);
      if (res.ok) {
        const { student } = await res.json();
        setStudent(student);
      }
    } catch {}
    setLoading(false);
  }, []);

  const loadJustificativas = useCallback(async (student_id: string) => {
    const res = await fetch(`/api/aluno/justificativas?student_id=${student_id}`);
    if (res.ok) setJustificativas(await res.json());
  }, []);

  useEffect(() => {
    if (session && activeTab === 'justificativas') {
      loadJustificativas(session.student_id);
    }
  }, [session, activeTab, loadJustificativas]);

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
          const lockTime = Date.now() + 5 * 60 * 1000;
          setLockedUntil(lockTime);
          setLoginError('Muitas tentativas. Conta bloqueada por 5 minutos.');
        } else {
          if (data.pending) {
            setOtpStudentId(data.student_id);
            setOtpPhone(data.phone || '');
            setShowOtp(true);
          } else {
            setLoginError(data.error || 'Erro ao fazer login.');
          }
        }
        return;
      }

      setLoginAttempts(0);
      const sess = { student_id: data.student_id, username: data.username };
      sessionStorage.setItem('aluno_session', JSON.stringify(sess));
      setSession(sess);
      setStudent(data.student);
      setActiveTab('dashboard');
    } catch {
      setLoginError('Erro de conexão. Tente novamente.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('aluno_session');
    setSession(null);
    setStudent(null);
    setActiveTab('dashboard');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/aluno/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-otp', student_id: otpStudentId, otp: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error || 'Código inválido.'); return; }
      setShowOtp(false);
      alert('Conta ativada com sucesso! Faça login.');
    } catch {
      setOtpError('Erro de conexão.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterError('As senhas não coincidem.');
      return;
    }
    setRegisterLoading(true);
    setRegisterError('');
    try {
      const res = await fetch('/api/aluno/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', ...registerForm }),
      });
      const data = await res.json();
      if (!res.ok) { setRegisterError(data.error || 'Erro ao criar conta.'); return; }
      setOtpStudentId(registerForm.student_id);
      setOtpPhone(registerForm.phone || '');
      setShowRegister(false);
      setShowOtp(true);
    } catch {
      setRegisterError('Erro de conexão.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/aluno/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forgot-password', username_or_email: forgotInput }),
      });
      const data = await res.json();
      if (data.student_id) {
        setForgotStudentId(data.student_id);
        setForgotMsg(`Código enviado para ${data.phone || 'seu WhatsApp'}. Digite-o abaixo.`);
        setShowResetPassword(true);
      } else {
        setForgotMsg(data.message || 'Se o usuário existir, você receberá um código no WhatsApp.');
      }
    } catch {
      setForgotMsg('Erro de conexão.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/aluno/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password', student_id: forgotStudentId, otp: resetOtp, new_password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setResetMsg(data.error || 'Erro.'); return; }
      setResetMsg('Senha redefinida com sucesso! Faça login.');
      setShowForgot(false);
      setShowResetPassword(false);
    } catch {
      setResetMsg('Erro de conexão.');
    }
  };

  const handlePresenca = async () => {
    if (!navigator.geolocation) {
      setPresencaMsg('Geolocalização não disponível.');
      return;
    }
    setPresencaLoading(true);
    setPresencaMsg('');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch('/api/checkins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: session!.student_id,
            latitude,
            longitude,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPresencaMsg(`Erro: ${data.error || 'Não foi possível registrar presença.'}`);
        } else {
          setPresencaMsg('✅ Presença registrada com sucesso!');
        }
      } catch {
        setPresencaMsg('Erro ao registrar presença.');
      } finally {
        setPresencaLoading(false);
      }
    }, () => {
      setPresencaMsg('Não foi possível obter sua localização. Permita o acesso à localização.');
      setPresencaLoading(false);
    });
  };

  const handleSubmitJustificativa = async (e: React.FormEvent) => {
    e.preventDefault();
    setJustLoading(true);
    setJustMsg('');
    try {
      const res = await fetch('/api/aluno/justificativas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          student_id: session!.student_id,
          ...justForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setJustMsg(data.error || 'Erro.'); return; }
      setJustMsg('✅ Justificativa enviada com sucesso!');
      setJustForm({ data_falta: '', motivo: '' });
      loadJustificativas(session!.student_id);
    } catch {
      setJustMsg('Erro de conexão.');
    } finally {
      setJustLoading(false);
    }
  };

  const nucleoColor = student ? getNucleoColor(student.nucleo || '') : '#1d4ed8';

  // ── LOGIN SCREEN ─────────────────────────────────────────────────────────────
  if (!session && !showOtp && !showRegister && !showForgot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🥋</div>
            <h1 className="text-2xl font-bold text-white">Área do Aluno</h1>
            <p className="text-gray-400 text-sm mt-1">ACCBM — Associação Cultural de Capoeira Barão de Mauá</p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Entrar na minha conta</h2>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário ou E-mail</label>
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Seu usuário ou e-mail"
                  required
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Sua senha"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loginLoading || Date.now() < lockedUntil}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <div className="mt-4 flex justify-between text-sm">
              <button
                onClick={() => setShowForgot(true)}
                className="text-blue-600 hover:underline"
              >
                Esqueci minha senha
              </button>
              <button
                onClick={() => setShowRegister(true)}
                className="text-green-600 hover:underline"
              >
                Criar conta
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
                ← Voltar ao início
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── OTP SCREEN ───────────────────────────────────────────────────────────────
  if (showOtp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📱</div>
            <h2 className="text-xl font-semibold">Verificação via WhatsApp</h2>
            {otpPhone && (
              <p className="text-gray-500 text-sm mt-1">Código enviado para ****{otpPhone.slice(-4)}</p>
            )}
          </div>
          {otpError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{otpError}</div>}
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <input
              type="text"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="000000"
              maxLength={6}
              required
            />
            <button
              type="submit"
              disabled={otpLoading || otpCode.length !== 6}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
            >
              {otpLoading ? 'Verificando...' : 'Verificar Código'}
            </button>
          </form>
          <button
            onClick={async () => {
              await fetch('/api/aluno/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resend-otp', student_id: otpStudentId }),
              });
              alert('Novo código enviado!');
            }}
            className="w-full mt-3 text-blue-600 hover:underline text-sm"
          >
            Reenviar código
          </button>
          <button onClick={() => setShowOtp(false)} className="w-full mt-2 text-gray-500 hover:text-gray-700 text-sm">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── REGISTER SCREEN ──────────────────────────────────────────────────────────
  if (showRegister) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🥋</div>
            <h2 className="text-xl font-semibold">Criar Conta</h2>
            <p className="text-gray-500 text-sm">Você precisa ter uma ficha de inscrição cadastrada.</p>
          </div>
          {registerError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{registerError}</div>}
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID do Aluno *</label>
              <input
                type="text"
                value={registerForm.student_id}
                onChange={e => setRegisterForm(p => ({ ...p, student_id: e.target.value.trim() }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="ID fornecido pelo administrador"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome de usuário *</label>
              <input
                type="text"
                value={registerForm.username}
                onChange={e => setRegisterForm(p => ({ ...p, username: e.target.value.trim() }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="ex: joaosilva"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                value={registerForm.email}
                onChange={e => setRegisterForm(p => ({ ...p, email: e.target.value.trim() }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
              <input
                type="tel"
                value={registerForm.phone}
                onChange={e => setRegisterForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="(21) 99999-9999"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
              <input
                type="password"
                value={registerForm.password}
                onChange={e => setRegisterForm(p => ({ ...p, password: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="Mín. 6 caracteres"
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha *</label>
              <input
                type="password"
                value={registerForm.confirmPassword}
                onChange={e => setRegisterForm(p => ({ ...p, confirmPassword: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="Repita a senha"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={registerLoading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
            >
              {registerLoading ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>
          <button onClick={() => setShowRegister(false)} className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm">
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  // ── FORGOT PASSWORD ──────────────────────────────────────────────────────────
  if (showForgot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🔑</div>
            <h2 className="text-xl font-semibold">Recuperar Senha</h2>
          </div>
          {forgotMsg && <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-3 mb-4 text-sm">{forgotMsg}</div>}
          {resetMsg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{resetMsg}</div>}

          {!showResetPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário ou E-mail</label>
                <input
                  type="text"
                  value={forgotInput}
                  onChange={e => setForgotInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Seu usuário ou e-mail cadastrado"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg">
                Enviar Código
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código WhatsApp</label>
                <input
                  type="text"
                  value={resetOtp}
                  onChange={e => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Mín. 6 caracteres"
                  minLength={6}
                  required
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg">
                Redefinir Senha
              </button>
            </form>
          )}

          <button onClick={() => { setShowForgot(false); setShowResetPassword(false); setForgotMsg(''); setResetMsg(''); }}
            className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm">
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Carregando...</div>
      </div>
    );
  }

  // ── STUDENT DASHBOARD ────────────────────────────────────────────────────────
  const cartData = student ? {
    nome: student.nome_completo,
    cpf: student.cpf || '',
    identidade: student.identidade || '',
    nucleo: student.nucleo || '',
    graduacao: student.graduacao || '',
    tipo_graduacao: student.tipo_graduacao || '',
    foto_url: student.foto_url || null,
    menor_de_idade: !!(student.menor_de_idade),
    nome_pai: student.nome_pai as string || '',
    nome_mae: student.nome_mae as string || '',
    nome_responsavel: student.nome_responsavel as string || '',
    cpf_responsavel: student.cpf_responsavel as string || '',
    inscricao_numero: student.inscricao_numero as number || null,
    telefone: student.telefone || '',
    student_id: student.id,
    data_nascimento: student.data_nascimento || '',
  } : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="text-white shadow-lg" style={{ backgroundColor: nucleoColor }}>
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🥋</div>
            <div>
              <div className="font-bold text-lg leading-tight">
                {student?.apelido || student?.nome_social || student?.nome_completo?.split(' ')[0] || 'Aluno'}
              </div>
              <div className="text-xs opacity-80">{student?.nucleo || 'ACCBM'}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-1 py-2 min-w-max">
            {([
              { id: 'dashboard', icon: '🏠', label: 'Início' },
              { id: 'carteirinha', icon: '🪪', label: 'Carteirinha' },
              { id: 'presenca', icon: '📍', label: 'Presença' },
              { id: 'financeiro', icon: '💰', label: 'Financeiro' },
              { id: 'graduacao', icon: '🎖️', label: 'Graduação' },
              { id: 'justificativas', icon: '📝', label: 'Justificativas' },
            ] as { id: Tab; icon: string; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={activeTab === tab.id ? { backgroundColor: nucleoColor } : {}}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                Bem-vindo(a), {student?.apelido || student?.nome_social || student?.nome_completo?.split(' ')[0]}! 👋
              </h2>
              <p className="text-gray-600 text-sm">
                Aqui você acessa todas as suas informações de forma segura e privada.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { tab: 'carteirinha' as Tab, icon: '🪪', title: 'Carteirinha', desc: 'Sua identidade digital' },
                { tab: 'presenca' as Tab, icon: '📍', title: 'Presença', desc: 'Registrar hoje' },
                { tab: 'financeiro' as Tab, icon: '💰', title: 'Financeiro', desc: 'Suas mensalidades' },
                { tab: 'graduacao' as Tab, icon: '🎖️', title: 'Graduação', desc: 'Seu histórico' },
                { tab: 'justificativas' as Tab, icon: '📝', title: 'Justificativas', desc: 'Enviar justificativa' },
              ].map(item => (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab)}
                  className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 hover:shadow-md transition-shadow text-left"
                >
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <div className="font-semibold text-gray-800 text-sm">{item.title}</div>
                  <div className="text-gray-500 text-xs">{item.desc}</div>
                </button>
              ))}
            </div>

            {student && (
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-3">Meus dados</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Graduação:</span>
                    <p className="font-medium">{student.graduacao || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Núcleo:</span>
                    <p className="font-medium">{student.nucleo || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Telefone:</span>
                    <p className="font-medium">{student.telefone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">E-mail:</span>
                    <p className="font-medium truncate">{student.email as string || '—'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CARTEIRINHA */}
        {activeTab === 'carteirinha' && cartData && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Minha Carteirinha</h2>
            <div className="flex justify-center">
              <Carteirinha data={cartData} />
            </div>
          </div>
        )}

        {/* PRESENÇA */}
        {activeTab === 'presenca' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Registrar Presença</h2>
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 text-sm mb-4">
                Você só pode registrar presença no dia atual e quando estiver no local de treino (raio de 200m).
              </p>
              {presencaMsg && (
                <div className={`rounded-lg p-3 mb-4 text-sm ${
                  presencaMsg.includes('✅') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {presencaMsg}
                </div>
              )}
              <button
                onClick={handlePresenca}
                disabled={presencaLoading}
                className="w-full py-3 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: nucleoColor }}
              >
                {presencaLoading ? '📍 Obtendo localização...' : '📍 Registrar Presença Agora'}
              </button>
              <p className="text-gray-400 text-xs mt-3 text-center">
                A localização é usada apenas para confirmar presença e não é armazenada.
              </p>
            </div>
          </div>
        )}

        {/* FINANCEIRO */}
        {activeTab === 'financeiro' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Minha Ficha Financeira</h2>
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <p className="text-gray-600 text-sm mb-4">
                Acesse seus dados financeiros detalhados através do portal financeiro.
              </p>
              <a
                href={`/financeiro?student_id=${session?.student_id}`}
                className="block w-full py-3 rounded-xl text-white font-semibold text-center transition-colors"
                style={{ backgroundColor: nucleoColor }}
              >
                💰 Acessar Portal Financeiro
              </a>
            </div>
          </div>
        )}

        {/* GRADUAÇÃO */}
        {activeTab === 'graduacao' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Histórico de Graduação</h2>
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              {student?.graduacao ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl">🎖️</div>
                    <div>
                      <div className="font-semibold text-gray-800">{student.graduacao}</div>
                      <div className="text-sm text-gray-500">Graduação atual</div>
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm text-center py-4">
                    Histórico completo de graduações em breve.
                  </p>
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">Nenhuma graduação registrada.</p>
              )}
            </div>
          </div>
        )}

        {/* JUSTIFICATIVAS */}
        {activeTab === 'justificativas' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Justificativas de Falta</h2>

            {/* Submit form */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-4">Enviar Nova Justificativa</h3>
              {justMsg && (
                <div className={`rounded-lg p-3 mb-4 text-sm ${
                  justMsg.includes('✅') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {justMsg}
                </div>
              )}
              <form onSubmit={handleSubmitJustificativa} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data da Falta *</label>
                  <input
                    type="date"
                    value={justForm.data_falta}
                    onChange={e => setJustForm(p => ({ ...p, data_falta: e.target.value }))}
                    max={new Date().toISOString().split('T')[0]}
                    min={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
                  <textarea
                    value={justForm.motivo}
                    onChange={e => setJustForm(p => ({ ...p, motivo: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                    rows={3}
                    placeholder="Descreva o motivo da falta..."
                    maxLength={500}
                    required
                  />
                  <p className="text-xs text-gray-400 text-right">{justForm.motivo.length}/500</p>
                </div>
                <button
                  type="submit"
                  disabled={justLoading}
                  className="w-full py-2.5 rounded-lg text-white font-semibold disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: nucleoColor }}
                >
                  {justLoading ? 'Enviando...' : 'Enviar Justificativa'}
                </button>
              </form>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-4">Minhas Justificativas</h3>
              {justificativas.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Nenhuma justificativa enviada.</p>
              ) : (
                <div className="space-y-3">
                  {justificativas.map(j => (
                    <div key={j.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-gray-800">
                            {new Date(j.data_falta + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{j.motivo}</div>
                          {j.resposta_mestre && (
                            <div className="text-xs text-blue-600 mt-1">Resposta: {j.resposta_mestre}</div>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          j.status === 'aprovado' ? 'bg-green-100 text-green-700' :
                          j.status === 'recusado' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {j.status === 'aprovado' ? '✅ Aprovado' : j.status === 'recusado' ? '❌ Recusado' : '⏳ Pendente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
