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

interface Props {
  nucleoKey: string;
}

export default function NucleoLoginPage({ nucleoKey }: Props) {
  const router = useRouter();
  const nucleo = NUCLEOS[nucleoKey];

  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [mounted, setMounted] = useState(false);

  // Alterar senha
  const [tela, setTela] = useState<'login' | 'alterar'>('login');
  const [altCpf, setAltCpf] = useState('');
  const [altAtual, setAltAtual] = useState('');
  const [altNova, setAltNova] = useState('');
  const [altConfirm, setAltConfirm] = useState('');
  const [altMsg, setAltMsg] = useState('');
  const [altLoading, setAltLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Se já está autenticado para este núcleo, redireciona direto
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
    if (cpfDigits.length !== 11) { setErro('CPF inválido. Digite os 11 dígitos.'); return; }
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
        body: JSON.stringify({ action: 'login', username: cpfDigits, password: senha }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        // Verifica se o núcleo bate
        if (data.nucleo !== nucleoKey) {
          const ls2 = getLockState();
          const nc = ls2.count + 1;
          if (nc >= MAX_ATTEMPTS) { setLockState(0, Date.now() + LOCKOUT_MS); }
          else { setLockState(nc, 0); }
          setErro('Acesso não autorizado para este núcleo.');
          setLoading(false);
          return;
        }
        setLockState(0, 0);
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
        setErro(`CPF ou senha incorretos. Tentativa ${nc}/${MAX_ATTEMPTS}.`);
      }
    } catch {
      setErro('Erro de conexão. Tente novamente.');
    }
    setLoading(false);
  }

  async function handleAlterar(e: React.FormEvent) {
    e.preventDefault();
    const cpfD = altCpf.replace(/\D/g, '');
    if (cpfD.length !== 11) { setAltMsg('CPF inválido.'); return; }
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

  if (!nucleo) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(160deg, #0f172a 0%, #1e293b 60%, ${nucleo.color}18 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Card principal */}
      <div style={{
        background: 'linear-gradient(160deg,#1a2035,#161e30)',
        border: `1.5px solid ${nucleo.color}40`,
        borderRadius: 20,
        padding: '32px 28px',
        width: '100%',
        maxWidth: 420,
        boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${nucleo.color}20`,
      }}>
        {/* Cabeçalho do núcleo — logo centralizada acima do nome */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo-barao-maua.png"
            alt="Barão de Mauá"
            style={{ width: 88, height: 'auto', marginBottom: 14, filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.6))' }}
          />
          <div style={{ fontSize: '1.12rem', fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            {nucleo.label}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
            {nucleo.cidade}
          </div>
          <div style={{
            display: 'inline-block',
            marginTop: 10,
            background: `${nucleo.color}20`,
            border: `1px solid ${nucleo.color}50`,
            color: nucleo.colorLight,
            borderRadius: 8,
            padding: '3px 12px',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            {tela === 'login' ? 'Acesso Responsável' : 'Alterar Senha'}
          </div>
        </div>

        {tela === 'login' ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* CPF */}
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                CPF
              </div>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={e => { setCpf(formatCpf(e.target.value)); setErro(''); }}
                disabled={loading}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '11px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1.5px solid rgba(255,255,255,0.12)`,
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: '1rem',
                  outline: 'none',
                  letterSpacing: '0.02em',
                }}
              />
            </div>

            {/* Senha */}
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Senha
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSenha ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setErro(''); }}
                  disabled={loading}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '11px 44px 11px 14px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1.5px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}
                >
                  {showSenha ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', color: '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>
                ⚠ {erro}
              </div>
            )}

            {/* Botão entrar */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                background: loading ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg, ${nucleo.color}, ${nucleo.color}cc)`,
                border: 'none',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: loading ? 'wait' : 'pointer',
                letterSpacing: '0.03em',
                transition: 'opacity 0.15s',
                opacity: loading ? 0.7 : 1,
                boxShadow: loading ? 'none' : `0 4px 20px ${nucleo.color}50`,
              }}
            >
              {loading ? '⏳ Verificando...' : '🔓 Entrar no Painel'}
            </button>

            {/* Alterar senha */}
            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => { setTela('alterar'); setAltMsg(''); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                🔑 Alterar minha senha
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAlterar} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button type="button" onClick={() => { setTela('login'); setAltMsg(''); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}>←</button>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.92rem' }}>Alterar Senha</div>
            </div>
            {[
              { label: 'Seu CPF', val: altCpf, set: (v: string) => setAltCpf(formatCpf(v)), ph: '000.000.000-00', type: 'text', mode: 'numeric' as const },
              { label: 'Senha Atual', val: altAtual, set: setAltAtual, ph: '••••••••', type: 'password', mode: undefined },
              { label: 'Nova Senha', val: altNova, set: setAltNova, ph: 'mínimo 6 caracteres', type: 'password', mode: undefined },
              { label: 'Confirmar Nova Senha', val: altConfirm, set: setAltConfirm, ph: '••••••••', type: 'password', mode: undefined },
            ].map(f => (
              <div key={f.label}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.68rem', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</div>
                <input
                  type={f.type}
                  inputMode={f.mode}
                  placeholder={f.ph}
                  value={f.val}
                  onChange={e => { f.set(e.target.value); setAltMsg(''); }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.11)', borderRadius: 9, color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
            ))}
            {altMsg && (
              <div style={{ borderRadius: 8, padding: '7px 11px', background: altMsg.startsWith('✓') ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${altMsg.startsWith('✓') ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`, color: altMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontSize: '0.77rem', fontWeight: 600 }}>
                {altMsg}
              </div>
            )}
            <button
              type="submit"
              disabled={altLoading}
              style={{ padding: '11px', borderRadius: 10, background: `linear-gradient(135deg,${nucleo.color},${nucleo.color}bb)`, border: 'none', color: '#fff', fontWeight: 800, cursor: altLoading ? 'wait' : 'pointer', opacity: altLoading ? 0.7 : 1, fontSize: '0.9rem' }}
            >
              {altLoading ? '⏳ Salvando...' : '✅ Salvar Nova Senha'}
            </button>
          </form>
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
