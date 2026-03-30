'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface NucleoConfig {
  key: string;
  label: string;
  color: string;
  colorLight: string;
  colorBg: string;
  emoji: string;
  cidade: string;
}

export const NUCLEOS: Record<string, NucleoConfig> = {
  'edson-alves': {
    key: 'edson-alves',
    label: 'Poliesportivo Edson Alves',
    color: '#dc2626',
    colorLight: '#fca5a5',
    colorBg: 'rgba(220,38,38,0.08)',
    emoji: '🥋',
    cidade: 'Magé – RJ',
  },
  'ipiranga': {
    key: 'ipiranga',
    label: 'Poliesportivo do Ipiranga',
    color: '#ea580c',
    colorLight: '#fdba74',
    colorBg: 'rgba(234,88,12,0.08)',
    emoji: '🥋',
    cidade: 'Magé – RJ',
  },
  'saracuruna': {
    key: 'saracuruna',
    label: 'Núcleo Saracuruna',
    color: '#16a34a',
    colorLight: '#86efac',
    colorBg: 'rgba(22,163,74,0.08)',
    emoji: '🥋',
    cidade: 'Duque de Caxias – RJ',
  },
  'vila-urussai': {
    key: 'vila-urussai',
    label: 'Núcleo Vila Urussaí',
    color: '#9333ea',
    colorLight: '#d8b4fe',
    colorBg: 'rgba(147,51,234,0.08)',
    emoji: '🥋',
    cidade: 'Duque de Caxias – RJ',
  },
  'jayme-fichman': {
    key: 'jayme-fichman',
    label: 'Núcleo Jayme Fichman',
    color: '#0891b2',
    colorLight: '#67e8f9',
    colorBg: 'rgba(8,145,178,0.08)',
    emoji: '🥋',
    cidade: 'Duque de Caxias – RJ',
  },
  'academia-mais-saude': {
    key: 'academia-mais-saude',
    label: 'Academia Mais Saúde',
    color: '#059669',
    colorLight: '#6ee7b7',
    colorBg: 'rgba(5,150,105,0.08)',
    emoji: '🥋',
    cidade: 'Praia do Anil',
  },
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

type Tela = 'login' | 'alterar' | 'primeiro-acesso' | 'esqueci-senha';

interface Props {
  nucleoKey: string;
}

export default function NucleoLoginPage({ nucleoKey }: Props) {
  const router = useRouter();
  const nucleo = NUCLEOS[nucleoKey];

  // ─── Login ───
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [mounted, setMounted] = useState(false);

  // ─── Tela ───
  const [tela, setTela] = useState<Tela>('login');

  // ─── Alterar senha ───
  const [altCpf, setAltCpf] = useState('');
  const [altAtual, setAltAtual] = useState('');
  const [altNova, setAltNova] = useState('');
  const [altConfirm, setAltConfirm] = useState('');
  const [altMsg, setAltMsg] = useState('');
  const [altLoading, setAltLoading] = useState(false);
  const [showAltNova, setShowAltNova] = useState(false);

  // ─── Primeiro acesso (troca obrigatória) ───
  const [primeiroNome, setPrimeiroNome] = useState('');
  const [primeiroCpfInterno, setPrimeiroCpfInterno] = useState('');
  const [primeiroAtual, setPrimeiroAtual] = useState('');
  const [primeiroNova, setPrimeiroNova] = useState('');
  const [primeiroConfirm, setPrimeiroConfirm] = useState('');
  const [primeiroMsg, setPrimeiroMsg] = useState('');
  const [primeiroLoading, setPrimeiroLoading] = useState(false);
  const [showPrimeiroNova, setShowPrimeiroNova] = useState(false);

  // ─── Esqueci senha ───
  const [esqCpf, setEsqCpf] = useState('');
  const [esqMsg, setEsqMsg] = useState('');
  const [esqLoading, setEsqLoading] = useState(false);
  const [esqEnviado, setEsqEnviado] = useState(false);
  const [esqResetUrl, setEsqResetUrl] = useState('');
  const [esqNoEmail, setEsqNoEmail] = useState(false);
  const [esqNoResend, setEsqNoResend] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem('admin_auth');
    if (stored === nucleoKey) {
      router.push('/admin');
    }
  }, [nucleoKey, router]);

  function getLockState() {
    if (!mounted) return { count: 0, lockedUntil: 0 };
    try {
      return JSON.parse(sessionStorage.getItem(`login_lock_${nucleoKey}`) || '{"count":0,"lockedUntil":0}');
    } catch { return { count: 0, lockedUntil: 0 }; }
  }
  function setLockState(count: number, lockedUntil: number) {
    sessionStorage.setItem(`login_lock_${nucleoKey}`, JSON.stringify({ count, lockedUntil }));
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    const cpfDigits = cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11) { setErro('Digite seu CPF completo (11 dígitos).'); return; }
    if (!senha) { setErro('Digite sua senha.'); return; }

    const ls = getLockState();
    const now = Date.now();
    if (ls.lockedUntil > now) {
      const secs = Math.ceil((ls.lockedUntil - now) / 1000);
      setErro(`Muitas tentativas. Aguarde ${secs}s.`);
      return;
    }

    setLoading(true);
    setErro('');
    try {
      const res = await fetch('/api/admin/panel-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username: cpfDigits, password: senha, nucleo_target: nucleoKey }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        // API já valida que o CPF pertence ao nucleoKey (nucleo_target).
        // data.nucleo é o núcleo confirmado — pode ser nucleoKey ou diferente só se o CPF
        // não pertence a este núcleo de forma alguma (a API retorna erro 403 nesse caso).
        setLockState(0, 0);

        // Primeiro acesso — forçar troca de senha
        if (data.first_login) {
          setPrimeiroNome(data.nome || '');
          setPrimeiroCpfInterno(cpfDigits);
          setPrimeiroAtual(senha);
          setTela('primeiro-acesso');
          setLoading(false);
          return;
        }

        sessionStorage.setItem('admin_auth', nucleoKey);
        sessionStorage.setItem('admin_auth_nucleos', JSON.stringify([nucleoKey]));
        router.push('/admin');
        return;
      }

      const ls2 = getLockState();
      const nc = ls2.count + 1;
      if (nc >= MAX_ATTEMPTS) {
        setLockState(0, Date.now() + LOCKOUT_MS);
        setErro(`Acesso bloqueado por 5 minutos após ${MAX_ATTEMPTS} tentativas.`);
      } else {
        setLockState(nc, 0);
        setErro(data.error || `Senha incorreta. Tentativa ${nc}/${MAX_ATTEMPTS}.`);
      }
    } catch {
      setErro('Erro de conexão. Tente novamente.');
    }
    setLoading(false);
  }

  // ─── Troca obrigatória no primeiro acesso ───
  async function handlePrimeiroAcesso(e: React.FormEvent) {
    e.preventDefault();
    if (primeiroNova.length < 6) { setPrimeiroMsg('Nova senha deve ter pelo menos 6 caracteres.'); return; }
    if (primeiroNova !== primeiroConfirm) { setPrimeiroMsg('As senhas não coincidem.'); return; }
    if (primeiroNova === primeiroAtual) { setPrimeiroMsg('A nova senha não pode ser igual à senha padrão.'); return; }
    setPrimeiroLoading(true);
    setPrimeiroMsg('');
    try {
      const res = await fetch('/api/admin/panel-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change-password',
          username: primeiroCpfInterno,
          current_password: primeiroAtual,
          new_password: primeiroNova,
        }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        sessionStorage.setItem('admin_auth', nucleoKey);
        sessionStorage.setItem('admin_auth_nucleos', JSON.stringify([nucleoKey]));
        router.push('/admin');
      } else {
        setPrimeiroMsg(d.error || 'Erro ao salvar senha. Tente novamente.');
      }
    } catch {
      setPrimeiroMsg('Erro de conexão. Tente novamente.');
    }
    setPrimeiroLoading(false);
  }

  // ─── Alterar senha (voluntário) ───
  async function handleAlterar(e: React.FormEvent) {
    e.preventDefault();
    const cpfD = altCpf.replace(/\D/g, '');
    if (cpfD.length !== 11) { setAltMsg('Digite seu CPF completo (11 dígitos).'); return; }
    if (!altAtual || !altNova || !altConfirm) { setAltMsg('Preencha todos os campos.'); return; }
    if (altNova !== altConfirm) { setAltMsg('As senhas não coincidem.'); return; }
    if (altNova.length < 6) { setAltMsg('Nova senha deve ter pelo menos 6 caracteres.'); return; }
    setAltLoading(true);
    const res = await fetch('/api/admin/panel-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change-password', username: cpfD, current_password: altAtual, new_password: altNova }),
    });
    const d = await res.json();
    setAltMsg(res.ok ? '✓ Senha alterada com sucesso! Faça login.' : (d.error || 'Erro ao alterar senha.'));
    if (res.ok) { setAltCpf(''); setAltAtual(''); setAltNova(''); setAltConfirm(''); setTimeout(() => { setTela('login'); setAltMsg(''); }, 2000); }
    setAltLoading(false);
  }

  // ─── Esqueci senha ───
  async function handleEsqueciSenha(e: React.FormEvent) {
    e.preventDefault();
    const cpfD = esqCpf.replace(/\D/g, '');
    if (cpfD.length !== 11) { setEsqMsg('Digite seu CPF completo (11 dígitos).'); return; }
    setEsqLoading(true);
    setEsqMsg('');
    try {
      const res = await fetch('/api/admin/panel-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forgot-password', cpf: cpfD }),
      });
      const d = await res.json();
      if (res.ok) {
        setEsqEnviado(true);
        setEsqMsg(d.message || 'Solicitação enviada.');
        setEsqResetUrl(d.reset_url || '');
        setEsqNoEmail(!!d.no_email);
        setEsqNoResend(!!d.no_resend);
      } else {
        setEsqMsg(d.error || 'Erro ao solicitar redefinição.');
      }
    } catch {
      setEsqMsg('Erro de conexão. Tente novamente.');
    }
    setEsqLoading(false);
  }

  if (!nucleo) return null;

  // ─── Estilos compartilhados ───
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px',
    background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
    borderRadius: 10, color: '#fff', fontSize: '0.95rem', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.5)', fontSize: '0.68rem', fontWeight: 700,
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block',
  };
  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: 10,
    background: `linear-gradient(135deg, ${nucleo.color}, ${nucleo.color}cc)`,
    border: 'none', color: '#fff', fontWeight: 800, fontSize: '0.95rem',
    cursor: 'pointer', letterSpacing: '0.03em',
    boxShadow: `0 4px 20px ${nucleo.color}50`,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(160deg, #0f172a 0%, #1e293b 60%, ${nucleo.color}18 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '20px 16px', fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Card principal */}
      <div style={{
        background: 'linear-gradient(160deg,#1a2035,#161e30)',
        border: `1.5px solid ${nucleo.color}40`,
        borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 420,
        boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${nucleo.color}20`,
      }}>
        {/* Cabeçalho */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-barao-maua.png" alt="Barão de Mauá"
            style={{ width: 88, height: 'auto', marginBottom: 14, filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.6))' }} />
          <div style={{ fontSize: '1.12rem', fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            {nucleo.label}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>{nucleo.cidade}</div>
          <div style={{
            display: 'inline-block', marginTop: 10,
            background: `${nucleo.color}20`, border: `1px solid ${nucleo.color}50`,
            color: nucleo.colorLight, borderRadius: 8, padding: '3px 12px',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            {tela === 'login' ? 'Acesso Responsável'
              : tela === 'alterar' ? 'Alterar Senha'
              : tela === 'primeiro-acesso' ? 'Criar Nova Senha'
              : 'Recuperar Senha'}
          </div>
        </div>

        {/* ═══ TELA LOGIN ═══ */}
        {tela === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>CPF do Responsável</label>
              <input
                autoFocus type="text" inputMode="numeric"
                placeholder="000.000.000-00" value={cpf}
                onChange={e => { setCpf(formatCpf(e.target.value)); setErro(''); }}
                disabled={loading} style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSenha ? 'text' : 'password'} placeholder="••••••••"
                  value={senha} onChange={e => { setSenha(e.target.value); setErro(''); }}
                  disabled={loading}
                  style={{ ...inputStyle, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowSenha(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}>
                  {showSenha ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {erro && (
              <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', color: '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>
                ⚠ {erro}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? '⏳ Verificando...' : '🔓 Entrar no Painel'}
            </button>

            {/* Links secundários */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.22)' }}>
                Primeiro acesso? Use a senha padrão: <strong style={{ color: 'rgba(255,255,255,0.45)' }}>{
                  nucleoKey === 'edson-alves' ? 'edsonalves12345' :
                  nucleoKey === 'ipiranga' ? 'ipiranga12345' :
                  nucleoKey === 'saracuruna' ? 'saracuruna12345' :
                  nucleoKey === 'vila-urussai' ? 'urussai12345' :
                  nucleoKey === 'jayme-fichman' ? 'jaymefichman12345' :
                  nucleoKey === 'academia-mais-saude' ? 'academiasaude12345' : '123456'
                }</strong>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <button type="button" onClick={() => { setTela('alterar'); setAltMsg(''); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
                  🔑 Alterar senha
                </button>
                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.75rem' }}>|</span>
                <button type="button" onClick={() => { setTela('esqueci-senha'); setEsqMsg(''); setEsqEnviado(false); setEsqCpf(''); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
                  ❓ Esqueci minha senha
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ═══ TELA PRIMEIRO ACESSO ═══ */}
        {tela === 'primeiro-acesso' && (
          <form onSubmit={handlePrimeiroAcesso} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Banner obrigatório */}
            <div style={{
              background: `${nucleo.color}18`, border: `1.5px solid ${nucleo.color}50`,
              borderRadius: 12, padding: '12px 16px',
            }}>
              <div style={{ color: nucleo.colorLight, fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
                🔐 Primeiro acesso detectado
              </div>
              {primeiroNome && (
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem' }}>
                  Bem-vindo(a), <strong>{primeiroNome}</strong>!
                </div>
              )}
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', marginTop: 4 }}>
                Por segurança, você deve criar uma senha personalizada antes de acessar o painel.
              </div>
            </div>

            <div>
              <label style={labelStyle}>Nova Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPrimeiroNova ? 'text' : 'password'}
                  placeholder="mínimo 6 caracteres" autoFocus
                  value={primeiroNova} onChange={e => { setPrimeiroNova(e.target.value); setPrimeiroMsg(''); }}
                  style={{ ...inputStyle, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPrimeiroNova(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}>
                  {showPrimeiroNova ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Confirmar Nova Senha</label>
              <input
                type="password" placeholder="••••••••"
                value={primeiroConfirm} onChange={e => { setPrimeiroConfirm(e.target.value); setPrimeiroMsg(''); }}
                style={inputStyle}
              />
            </div>

            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px' }}>
              • Mínimo 6 caracteres &nbsp;•&nbsp; Não use a senha padrão (123456)
            </div>

            {primeiroMsg && (
              <div style={{
                borderRadius: 8, padding: '8px 12px',
                background: primeiroMsg.startsWith('✓') ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                border: `1px solid ${primeiroMsg.startsWith('✓') ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`,
                color: primeiroMsg.startsWith('✓') ? '#4ade80' : '#f87171',
                fontSize: '0.78rem', fontWeight: 600,
              }}>
                {primeiroMsg}
              </div>
            )}

            <button type="submit" disabled={primeiroLoading} style={{ ...btnPrimary, opacity: primeiroLoading ? 0.7 : 1, cursor: primeiroLoading ? 'wait' : 'pointer' }}>
              {primeiroLoading ? '⏳ Salvando...' : '✅ Criar Minha Senha e Entrar'}
            </button>
          </form>
        )}

        {/* ═══ TELA ALTERAR SENHA ═══ */}
        {tela === 'alterar' && (
          <form onSubmit={handleAlterar} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button type="button" onClick={() => { setTela('login'); setAltMsg(''); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}>←</button>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.92rem' }}>Alterar Senha</div>
            </div>

            {[
              { label: 'Seu CPF', val: altCpf, set: (v: string) => setAltCpf(formatCpf(v)), ph: '000.000.000-00', type: 'text', mode: 'numeric' as const, show: undefined, setShow: undefined },
              { label: 'Senha Atual', val: altAtual, set: setAltAtual, ph: '••••••••', type: 'password', mode: undefined, show: undefined, setShow: undefined },
              { label: 'Nova Senha', val: altNova, set: setAltNova, ph: 'mínimo 6 caracteres', type: showAltNova ? 'text' : 'password', mode: undefined, show: showAltNova, setShow: () => setShowAltNova(v => !v) },
              { label: 'Confirmar Nova Senha', val: altConfirm, set: setAltConfirm, ph: '••••••••', type: 'password', mode: undefined, show: undefined, setShow: undefined },
            ].map(f => (
              <div key={f.label}>
                <label style={labelStyle}>{f.label}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={f.type} inputMode={f.mode}
                    placeholder={f.ph} value={f.val}
                    onChange={e => { f.set(e.target.value); setAltMsg(''); }}
                    style={{ ...inputStyle, padding: f.setShow ? '11px 44px 11px 14px' : '11px 14px', fontSize: '0.9rem' }}
                  />
                  {f.setShow && (
                    <button type="button" onClick={f.setShow}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
                      {f.show ? '🙈' : '👁'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {altMsg && (
              <div style={{ borderRadius: 8, padding: '7px 11px', background: altMsg.startsWith('✓') ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${altMsg.startsWith('✓') ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`, color: altMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontSize: '0.77rem', fontWeight: 600 }}>
                {altMsg}
              </div>
            )}
            <button type="submit" disabled={altLoading}
              style={{ ...btnPrimary, opacity: altLoading ? 0.7 : 1, cursor: altLoading ? 'wait' : 'pointer', fontSize: '0.9rem' }}>
              {altLoading ? '⏳ Salvando...' : '✅ Salvar Nova Senha'}
            </button>
          </form>
        )}

        {/* ═══ TELA ESQUECI SENHA ═══ */}
        {tela === 'esqueci-senha' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button type="button" onClick={() => { setTela('login'); setEsqMsg(''); setEsqEnviado(false); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}>←</button>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.92rem' }}>Recuperar Senha</div>
            </div>

            {!esqEnviado ? (
              <form onSubmit={handleEsqueciSenha} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                  Informe seu CPF cadastrado. Enviaremos um link de redefinição de senha para o e-mail vinculado ao seu cadastro.
                </div>

                <div>
                  <label style={labelStyle}>Seu CPF</label>
                  <input
                    autoFocus type="text" inputMode="numeric"
                    placeholder="000.000.000-00" value={esqCpf}
                    onChange={e => { setEsqCpf(formatCpf(e.target.value)); setEsqMsg(''); }}
                    style={inputStyle}
                  />
                </div>

                {esqMsg && (
                  <div style={{ borderRadius: 8, padding: '8px 12px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>
                    ⚠ {esqMsg}
                  </div>
                )}

                <button type="submit" disabled={esqLoading}
                  style={{ ...btnPrimary, opacity: esqLoading ? 0.7 : 1, cursor: esqLoading ? 'wait' : 'pointer', fontSize: '0.9rem' }}>
                  {esqLoading ? '⏳ Enviando...' : '📧 Enviar Link de Recuperação'}
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* E-mail enviado com sucesso */}
                {!esqNoEmail && !esqNoResend && !esqResetUrl && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 10 }}>📬</div>
                    <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.95rem', marginBottom: 8 }}>E-mail enviado!</div>
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', lineHeight: 1.6 }}>{esqMsg}</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', marginTop: 10 }}>
                      Verifique sua caixa de entrada e pasta de spam.<br/>O link expira em 30 minutos.
                    </div>
                  </div>
                )}

                {/* Sem serviço de e-mail ou sem e-mail cadastrado — mostrar link direto */}
                {(esqNoEmail || esqNoResend || esqResetUrl) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>
                        {esqNoEmail ? '⚠️ CPF sem e-mail cadastrado' : '⚠️ Serviço de e-mail não configurado'}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.77rem', lineHeight: 1.5 }}>
                        {esqMsg}
                      </div>
                    </div>
                    {esqResetUrl && (
                      <div style={{ background: 'rgba(29,78,216,0.12)', border: '1px solid rgba(29,78,216,0.3)', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.78rem', marginBottom: 8 }}>
                          🔗 Link de redefinição (use este link para redefinir sua senha):
                        </div>
                        <a href={esqResetUrl}
                          style={{ display: 'block', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', borderRadius: 8, padding: '10px 14px', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center', wordBreak: 'break-all' }}>
                          🔐 Clique aqui para redefinir sua senha
                        </a>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem', marginTop: 6 }}>
                          Válido por 30 minutos. Copie e abra em qualquer navegador.
                        </div>
                      </div>
                    )}
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                      Para configurar o envio automático de e-mails, o Admin Geral deve adicionar a chave <strong>RESEND_API_KEY</strong> nas variáveis de ambiente da plataforma.
                    </div>
                  </div>
                )}

                <button type="button" onClick={() => { setTela('login'); setEsqMsg(''); setEsqEnviado(false); setEsqResetUrl(''); setEsqNoEmail(false); setEsqNoResend(false); }}
                  style={{ ...btnPrimary, fontSize: '0.85rem' }}>
                  ← Voltar ao Login
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <a href="/" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem', textDecoration: 'none' }}>
          ← Voltar para o site
        </a>
      </div>
    </div>
  );
}
