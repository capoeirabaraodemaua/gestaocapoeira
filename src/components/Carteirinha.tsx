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

  return (
    <div
      id="carteirinha-print"
      style={{
        width: 320,
        background: '#ffffff',
        borderRadius: 14,
        overflow: 'hidden',
        border: '2px solid #b91c1c',
        fontFamily: 'Inter, Arial, sans-serif',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        margin: '0 auto',
      }}
    >
      {/* Top stripe */}
      <div style={{ height: 6, background: 'linear-gradient(90deg, #b91c1c 0%, #7c3aed 50%, #b91c1c 100%)' }} />

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
        padding: '14px 16px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <img
          src="/logo-maua.png"
          alt="ACCBM"
          style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Associação Cultural de Capoeira
          </div>
          <div style={{ color: '#f87171', fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.2 }}>
            Barão de Mauá
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.55rem', marginTop: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ACCBM — Carteirinha de Associado
          </div>
        </div>
        {data.inscricao_numero != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nº</div>
            <div style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 900, letterSpacing: '0.04em' }}>
              {String(data.inscricao_numero).padStart(4, '0')}
            </div>
          </div>
        )}
      </div>

      {/* Photo + Info */}
      <div style={{ background: '#f8f8f8', padding: '14px 16px', display: 'flex', gap: 14 }}>
        {/* Photo */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {data.foto_url ? (
            <img
              src={data.foto_url}
              alt=""
              style={{ width: 74, height: 90, objectFit: 'cover', borderRadius: 8, border: '2px solid #b91c1c' }}
              crossOrigin="anonymous"
            />
          ) : (
            <div style={{ width: 74, height: 90, borderRadius: 8, background: '#e5e7eb', border: '2px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
            </div>
          )}
          {/* Cord bar */}
          <div style={{ display: 'flex', width: 74, height: 7, borderRadius: 4, overflow: 'hidden', border: '1px solid #d1d5db' }}>
            {colors.map((c, i) => (
              <div key={i} style={{ flex: 1, background: c === '#FFFFFF' ? '#e5e7eb' : c }} />
            ))}
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#111827', fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.3, marginBottom: 8 }}>{data.nome}</div>

          {nomenclatura && (
            <div style={{ display: 'inline-block', background: '#1a1a2e', color: '#f87171', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 4, padding: '2px 7px', marginBottom: 8 }}>
              {nomenclatura}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              ['CPF', data.cpf],
              ['RG', data.identidade],
              ['Núcleo', data.nucleo],
              ['Corda', data.graduacao],
            ].map(([label, val]) => val ? (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ color: '#6b7280', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 44, flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#1f2937', fontSize: '0.72rem', fontWeight: 600 }}>{val}</span>
              </div>
            ) : null)}
            {data.nome_pai && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ color: '#6b7280', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 44, flexShrink: 0 }}>Pai</span>
                <span style={{ color: '#1f2937', fontSize: '0.72rem', fontWeight: 600 }}>{data.nome_pai}</span>
              </div>
            )}
            {data.nome_mae && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ color: '#6b7280', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 44, flexShrink: 0 }}>Mãe</span>
                <span style={{ color: '#1f2937', fontSize: '0.72rem', fontWeight: 600 }}>{data.nome_mae}</span>
              </div>
            )}
            {data.menor_de_idade && data.nome_responsavel && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ color: '#6b7280', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 44, flexShrink: 0 }}>Resp.</span>
                <span style={{ color: '#1f2937', fontSize: '0.72rem', fontWeight: 600 }}>{data.nome_responsavel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Signature area */}
      <div style={{ background: '#ffffff', padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
        {(() => {
          const sig = isMaua
            ? { imgSrc: '/assinatura-frazao.png', nome: 'Mestre Márcio da Silva Frazão', cargo: 'Presidente — ACCBM', nucleo: 'Núcleo Mauá' }
            : { imgSrc: '/assinatura-naldo.png', nome: 'Mestre Elionaldo Pontes de Lima', cargo: 'Vice-Presidente — ACCBM', nucleo: 'Núcleo Saracuruna' };
          return (
            <div style={{ textAlign: 'center', borderTop: '2px solid #b91c1c', paddingTop: 10 }}>
              <img
                src={sig.imgSrc}
                alt={`Assinatura ${sig.nome}`}
                style={{ height: 40, maxWidth: '80%', objectFit: 'contain', display: 'block', margin: '0 auto 6px' }}
              />
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#1f2937', lineHeight: 1.4 }}>{sig.nome}</div>
              <div style={{ fontSize: '0.52rem', color: '#6b7280' }}>{sig.cargo}</div>
              <div style={{ fontSize: '0.52rem', color: '#9ca3af' }}>{sig.nucleo}</div>
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
        padding: '8px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Emitido em {new Date().toLocaleDateString('pt-BR')}
        </span>
        {data.inscricao_numero != null && (
          <span style={{ color: '#fbbf24', fontSize: '0.55rem', fontWeight: 700 }}>
            Inscrição #{String(data.inscricao_numero).padStart(4, '0')}
          </span>
        )}
      </div>

      {/* Bottom stripe */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #b91c1c 0%, #7c3aed 50%, #b91c1c 100%)' }} />
    </div>
  );
}
