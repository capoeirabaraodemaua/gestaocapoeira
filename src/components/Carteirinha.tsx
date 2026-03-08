'use client';
import { getCordaColors, nomenclaturaGraduacao } from '@/lib/graduacoes';

export interface CarteirinhaData {
  nome: string;
  cpf: string;
  identidade: string;
  nucleo: string;
  graduacao: string;
  tipo_graduacao: string;
  foto_url: string | null;
  menor_de_idade: boolean;
  nome_pai: string;
  nome_mae: string;
  nome_responsavel: string | null;
  cpf_responsavel: string | null;
  inscricao_numero?: number | null;
  telefone?: string | null;
}

interface Props {
  data: CarteirinhaData;
}

export default function Carteirinha({ data }: Props) {
  const colors = getCordaColors(data.graduacao);
  const nomenclatura = nomenclaturaGraduacao[data.graduacao] || '';
  const isMaua = data.nucleo === 'Mauá';
  const sig = isMaua
    ? { imgSrc: '/assinatura-frazao.png', nome: 'Mestre Márcio da Silva Frazão', cargo: 'Presidente — ACCBM' }
    : { imgSrc: '/assinatura-naldo.png', nome: 'Mestre Elionaldo Pontes de Lima', cargo: 'Vice-Presidente — ACCBM' };

  return (
    <div
      id="carteirinha-print"
      style={{
        width: 500,
        height: 290,
        background: '#ffffff',
        borderRadius: 14,
        overflow: 'hidden',
        border: '2px solid #b91c1c',
        fontFamily: 'Inter, Arial, sans-serif',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Top stripe */}
      <div style={{ height: 5, background: 'linear-gradient(90deg, #b91c1c 0%, #7c3aed 50%, #b91c1c 100%)', flexShrink: 0 }} />

      {/* Main body — row */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT PANEL — dark, logo + photo + cord */}
        <div style={{
          width: 130,
          background: 'linear-gradient(180deg, #1a1a2e 0%, #0f3460 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 10px 8px',
          gap: 8,
          flexShrink: 0,
        }}>
          <img
            src="/logo-maua.png"
            alt="ACCBM"
            style={{ width: 48, height: 48, objectFit: 'contain' }}
          />
          {/* Photo */}
          {data.foto_url ? (
            <img
              src={data.foto_url}
              alt=""
              style={{ width: 68, height: 82, objectFit: 'cover', borderRadius: 6, border: '2px solid #b91c1c' }}
              crossOrigin="anonymous"
            />
          ) : (
            <div style={{ width: 68, height: 82, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
            </div>
          )}
          {/* Cord bar */}
          <div style={{ display: 'flex', width: 68, height: 7, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
            {colors.map((c, i) => (
              <div key={i} style={{ flex: 1, background: c === '#FFFFFF' ? '#e5e7eb' : c }} />
            ))}
          </div>
          {/* Nucleo label */}
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', lineHeight: 1.3 }}>
            {data.nucleo}
          </div>
        </div>

        {/* RIGHT PANEL — white, all info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 12px 6px', overflow: 'hidden' }}>

          {/* Header row: org name + matricula */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Associação Cultural de Capoeira
              </div>
              <div style={{ color: '#b91c1c', fontSize: '0.8rem', fontWeight: 900, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.1 }}>
                Barão de Mauá
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.45rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Carteirinha de Associado
              </div>
            </div>
            {data.inscricao_numero != null && (
              <div style={{ textAlign: 'right', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', borderRadius: 6, padding: '3px 8px' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.42rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Matrícula</div>
                <div style={{ color: '#fbbf24', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.04em' }}>
                  ACCBM-{String(data.inscricao_numero).padStart(6, '0')}
                </div>
              </div>
            )}
          </div>

          {/* Name + nomenclatura */}
          <div style={{ marginBottom: 5 }}>
            <div style={{ color: '#111827', fontWeight: 800, fontSize: '0.82rem', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.nome}</div>
            {nomenclatura && (
              <div style={{ display: 'inline-block', background: '#1a1a2e', color: '#f87171', fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 3, padding: '1px 6px', marginTop: 3 }}>
                {nomenclatura}
              </div>
            )}
          </div>

          {/* Data grid — two columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px', flex: 1 }}>
            {[
              ['CPF', data.cpf],
              ['RG', data.identidade],
              ['Corda', data.graduacao],
              ['Tipo', data.tipo_graduacao === 'infantil' ? 'Infantil' : 'Adulta'],
              data.nome_pai ? ['Pai', data.nome_pai] : null,
              data.nome_mae ? ['Mãe', data.nome_mae] : null,
              data.menor_de_idade && data.nome_responsavel ? ['Resp.', data.nome_responsavel] : null,
            ].filter(Boolean).map((item) => {
              const [label, val] = item as string[];
              return val ? (
                <div key={label} style={{ display: 'flex', gap: 4, alignItems: 'baseline', minWidth: 0 }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.48rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
                  <span style={{ color: '#374151', fontSize: '0.62rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                </div>
              ) : null;
            })}
          </div>

          {/* Signature row */}
          <div style={{ borderTop: '1.5px solid #b91c1c', paddingTop: 5, display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <img
              src={sig.imgSrc}
              alt="Assinatura"
              style={{ height: 28, maxWidth: 90, objectFit: 'contain', flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.5rem', fontWeight: 700, color: '#1f2937', lineHeight: 1.3 }}>{sig.nome}</div>
              <div style={{ fontSize: '0.46rem', color: '#6b7280' }}>{sig.cargo}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: '#9ca3af', fontSize: '0.42rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Emitido em</div>
              <div style={{ color: '#374151', fontSize: '0.5rem', fontWeight: 600 }}>{new Date().toLocaleDateString('pt-BR')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stripe */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #b91c1c 0%, #7c3aed 50%, #b91c1c 100%)', flexShrink: 0 }} />
    </div>
  );
}
