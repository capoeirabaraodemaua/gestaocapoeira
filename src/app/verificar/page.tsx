'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCordaColors, nomenclaturaGraduacao } from '@/lib/graduacoes';

interface StudentData {
  student_id: string;
  nome_completo: string;
  nome_social?: string | null;
  apelido?: string | null;
  nucleo: string;
  graduacao: string;
  tipo_graduacao: string;
  foto_url?: string | null;
  menor_de_idade?: boolean;
  nome_pai?: string | null;
  nome_mae?: string | null;
  nome_responsavel?: string | null;
  inscricao_numero?: number | null;
  sexo?: string | null;
  created_at?: string | null;
}

function CordaBar({ graduacao }: { graduacao: string }) {
  const colors = getCordaColors(graduacao);
  return (
    <div style={{ display: 'flex', width: 80, height: 10, borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.3)' }}>
      {colors.map((c, i) => (
        <div key={i} style={{ flex: 1, background: c === '#FFFFFF' ? '#e5e7eb' : c }} />
      ))}
    </div>
  );
}

function VerificarContent() {
  const params   = useSearchParams();
  const idParam  = params.get('id');
  const matParam = params.get('mat');

  const [data, setData]       = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!idParam && !matParam) {
      setLoading(false);
      setError('Nenhum identificador informado.');
      return;
    }
    const url = idParam
      ? `/api/verificar?id=${encodeURIComponent(idParam)}`
      : `/api/verificar?mat=${encodeURIComponent(matParam!)}`;

    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error('Associado não encontrado no sistema.');
        return r.json();
      })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [idParam, matParam]);

  const nomenclatura = data ? (nomenclaturaGraduacao[data.graduacao] || '') : '';
  const matriculaStr = data?.inscricao_numero != null
    ? `DEMO-${String(data.inscricao_numero).padStart(6, '0')}`
    : null;
  const emissao = new Date().toLocaleDateString('pt-BR');
  const validade = new Date();
  validade.setFullYear(validade.getFullYear() + 1);
  const validadeStr = validade.toLocaleDateString('pt-BR');
  const displayName = data?.nome_social || data?.nome_completo || '';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f172a 0%, #1e3a8a 40%, #1d4ed8 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '28px 16px 40px',
      fontFamily: 'Inter, Arial, sans-serif',
    }}>

      {/* Logo + titulo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <img src="/logo-barao-maua.png" alt="Sistema DEMO" style={{ width: 44, height: 44, objectFit: 'contain' }} />
        <div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Sistema de Gestao
          </div>
          <div style={{ color: '#fbbf24', fontSize: '1rem', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.2 }}>
            DEMO
          </div>
        </div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28 }}>
        Verificacao de Credencial
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', padding: '48px 0' }}>
          <div style={{ width: 22, height: 22, border: '3px solid rgba(255,255,255,0.2)', borderTop: '3px solid #fbbf24', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Buscando credencial...
        </div>
      )}

      {/* Erro */}
      {error && !loading && (
        <div style={{
          background: 'rgba(220,38,38,0.12)',
          border: '1.5px solid rgba(220,38,38,0.4)',
          borderRadius: 14,
          padding: '28px 32px',
          textAlign: 'center',
          maxWidth: 340,
        }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>Credencial não encontrada</div>
          <div style={{ color: 'rgba(252,165,165,0.75)', fontSize: '0.82rem' }}>{error}</div>
        </div>
      )}

      {/* Carteirinha */}
      {data && !loading && (
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Badge válida */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'rgba(34,197,94,0.12)',
            border: '1.5px solid rgba(34,197,94,0.35)',
            borderRadius: 30,
            padding: '8px 20px',
            color: '#86efac',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            <span style={{ fontSize: '1.1rem' }}>✅</span>
            Credencial válida e autenticada
          </div>

          {/* Card principal */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '2px solid #1d4ed8',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}>

            {/* Topo tricolor */}
            <div style={{ height: 6, display: 'flex' }}>
              <div style={{ flex: 1, background: '#dc2626' }} />
              <div style={{ flex: 1, background: '#1d4ed8' }} />
              <div style={{ flex: 1, background: '#16a34a' }} />
            </div>

            {/* Header azul */}
            <div style={{
              background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/logo-maua.png" alt="DEMO" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Assoc. Cultural de Capoeira
                  </div>
                  <div style={{ color: '#fbbf24', fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Barão de Mauá
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Credencial de Associado
                  </div>
                </div>
              </div>
              {matriculaStr && (
                <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '4px 10px', textAlign: 'right' }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Matrícula</div>
                  <div style={{ color: '#fbbf24', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.04em' }}>{matriculaStr}</div>
                </div>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>

              {/* Foto */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                {data.foto_url ? (
                  <img src={data.foto_url} alt=""
                    style={{ width: 76, height: 90, objectFit: 'cover', borderRadius: 8, border: '2px solid #1d4ed8' }}
                    crossOrigin="anonymous" />
                ) : (
                  <div style={{ width: 76, height: 90, borderRadius: 8, background: '#e0e7ff', border: '2px solid #a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/>
                    </svg>
                  </div>
                )}
                <CordaBar graduacao={data.graduacao} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>

                {/* Nome */}
                <div style={{ color: '#1e3a8a', fontWeight: 800, fontSize: '1rem', lineHeight: 1.2, marginBottom: 2 }}>
                  {displayName}
                </div>
                {data.nome_social && data.nome_social !== data.nome_completo && (
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginBottom: 2 }}>({data.nome_completo})</div>
                )}
                {data.apelido && (
                  <div style={{ color: '#7c3aed', fontSize: '0.72rem', fontStyle: 'italic', marginBottom: 4 }}>"{data.apelido}"</div>
                )}

                {/* Badge graduação */}
                {nomenclatura && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                    <span style={{ background: 'linear-gradient(90deg,#16a34a,#15803d)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 4, padding: '2px 8px' }}>
                      {nomenclatura}
                    </span>
                  </div>
                )}

                {/* Dados */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                  {[
                    ['Corda', data.graduacao],
                    ['Tipo', data.tipo_graduacao === 'infantil' ? 'Infantil' : 'Adulta'],
                    ['Núcleo', data.nucleo],
                    matriculaStr ? ['Matrícula', matriculaStr] : null,
                    data.nome_pai ? ['Pai', data.nome_pai] : null,
                    data.nome_mae ? ['Mãe', data.nome_mae] : null,
                    data.menor_de_idade && data.nome_responsavel ? ['Resp.', data.nome_responsavel] : null,
                  ].filter(Boolean).map((item) => {
                    const [label, val] = item as string[];
                    return val ? (
                      <div key={label} style={{ display: 'flex', gap: 4, alignItems: 'baseline', minWidth: 0 }}>
                        <span style={{ color: '#3b82f6', fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>{label}</span>
                        <span style={{ color: '#1e3a8a', fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              background: 'linear-gradient(90deg,#dc2626 0%,#1d4ed8 50%,#16a34a 100%)',
              padding: '6px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Emitido: <strong>{emissao}</strong>
              </span>
              <span style={{ color: '#fbbf24', fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ✦ Válida até {validadeStr} ✦
              </span>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.5rem', textTransform: 'uppercase' }}>DEMO</span>
            </div>
          </div>

          {/* Rodapé */}
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.62rem', letterSpacing: '0.05em' }}>
            Sistema de Gestao de Alunos — DEMO
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function VerificarPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f172a,#1e3a8a,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: '0.9rem' }}>Carregando...</div>
      </div>
    }>
      <VerificarContent />
    </Suspense>
  );
}
