'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function ResetSenhaContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [estado, setEstado] = useState<'validando' | 'formulario' | 'sucesso' | 'erro'>('validando');
  const [nome, setNome] = useState('');
  const [nucleo, setNucleo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [msgErro, setMsgErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSenha, setShowSenha] = useState(false);

  useEffect(() => {
    if (!token) { setEstado('erro'); setMsgErro('Link inválido. Token não encontrado.'); return; }
    fetch('/api/admin/panel-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate-reset-token', token }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setNome(d.nome || ''); setNucleo(d.nucleo || ''); setEstado('formulario'); }
        else { setEstado('erro'); setMsgErro(d.error || 'Token inválido ou expirado.'); }
      })
      .catch(() => { setEstado('erro'); setMsgErro('Erro de conexão.'); });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha.length < 6) { setMsgErro('Senha deve ter pelo menos 6 caracteres.'); return; }
    if (novaSenha !== confirmar) { setMsgErro('As senhas não coincidem.'); return; }
    setLoading(true);
    setMsgErro('');
    try {
      const res = await fetch('/api/admin/panel-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-by-token', token, new_password: novaSenha }),
      });
      const d = await res.json();
      if (res.ok && d.ok) { setEstado('sucesso'); }
      else { setMsgErro(d.error || 'Erro ao redefinir senha.'); }
    } catch { setMsgErro('Erro de conexão. Tente novamente.'); }
    setLoading(false);
  }

  const NUCLEO_COLORS: Record<string, string> = {
    'edson-alves': '#dc2626', 'ipiranga': '#ea580c', 'saracuruna': '#16a34a',
    'vila-urussai': '#9333ea', 'jayme-fichman': '#0891b2', 'geral': '#1d4ed8',
  };
  const cor = NUCLEO_COLORS[nucleo] || '#1d4ed8';

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(160deg, #0f172a 0%, #1e293b 60%, ${cor}18 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '20px 16px', fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: 'linear-gradient(160deg,#1a2035,#161e30)',
        border: `1.5px solid ${cor}40`,
        borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 420,
        boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${cor}20`,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-barao-maua.png" alt="Barão de Mauá"
            style={{ width: 72, height: 'auto', marginBottom: 14, filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.6))' }} />
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            Redefinição de Senha
          </div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Painel de Nucleo - Sistema DEMO</div>
          <div style={{
            display: 'inline-block', marginTop: 10,
            background: `${cor}20`, border: `1px solid ${cor}50`,
            color: cor, borderRadius: 8, padding: '3px 12px',
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>Criar Nova Senha</div>
        </div>

        {estado === 'validando' && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', padding: '20px 0' }}>
            ⏳ Validando link...
          </div>
        )}

        {estado === 'erro' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: '16px', color: '#f87171', fontSize: '0.85rem', fontWeight: 600, marginBottom: 20 }}>
              ⚠ {msgErro}
            </div>
            <a href="/nucleo" style={{ color: cor, fontSize: '0.8rem', textDecoration: 'underline' }}>← Voltar ao painel</a>
          </div>
        )}

        {estado === 'formulario' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {nome && (
              <div style={{ background: `${cor}15`, border: `1px solid ${cor}30`, borderRadius: 10, padding: '10px 14px', color: 'rgba(255,255,255,0.8)', fontSize: '0.82rem' }}>
                Olá, <strong>{nome}</strong>! Defina sua nova senha abaixo.
              </div>
            )}

            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.68rem', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Nova Senha
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSenha ? 'text' : 'password'}
                  placeholder="mínimo 6 caracteres"
                  value={novaSenha}
                  onChange={e => { setNovaSenha(e.target.value); setMsgErro(''); }}
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '11px 44px 11px 14px',
                    background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: '#fff', fontSize: '1rem', outline: 'none',
                  }}
                />
                <button type="button" onClick={() => setShowSenha(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}>
                  {showSenha ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.68rem', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Confirmar Nova Senha
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmar}
                onChange={e => { setConfirmar(e.target.value); setMsgErro(''); }}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '11px 14px',
                  background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
                  borderRadius: 10, color: '#fff', fontSize: '1rem', outline: 'none',
                }}
              />
            </div>

            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px' }}>
              • Mínimo 6 caracteres<br />
              • Use letras e números para maior segurança<br />
              • Não compartilhe sua senha com terceiros
            </div>

            {msgErro && (
              <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', color: '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>
                ⚠ {msgErro}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              padding: '12px', borderRadius: 10,
              background: loading ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg, ${cor}, ${cor}cc)`,
              border: 'none', color: '#fff', fontWeight: 800, fontSize: '0.95rem',
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
              boxShadow: loading ? 'none' : `0 4px 20px ${cor}50`,
            }}>
              {loading ? '⏳ Salvando...' : '✅ Salvar Nova Senha'}
            </button>
          </form>
        )}

        {estado === 'sucesso' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
            <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>Senha redefinida com sucesso!</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', marginBottom: 24 }}>
              Você já pode fazer login com sua nova senha.
            </div>
            <button
              onClick={() => router.push('/nucleo')}
              style={{
                padding: '11px 28px', borderRadius: 10,
                background: `linear-gradient(135deg, ${cor}, ${cor}cc)`,
                border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Ir para o Login
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <a href="/" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem', textDecoration: 'none' }}>
          ← Voltar para o site
        </a>
      </div>
    </div>
  );
}

export default function ResetSenhaPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter, sans-serif' }}>Carregando...</div>
      </div>
    }>
      <ResetSenhaContent />
    </Suspense>
  );
}
