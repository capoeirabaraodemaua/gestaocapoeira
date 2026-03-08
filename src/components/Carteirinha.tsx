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

  // Validity: 1 year from today
  const hoje = new Date();
  const validade = new Date(hoje);
  validade.setFullYear(validade.getFullYear() + 1);
  const emissaoStr = hoje.toLocaleDateString('pt-BR');
  const validadeStr = validade.toLocaleDateString('pt-BR');

  return (
    <div
      id="carteirinha-print"
      style={{
        width: 500,
        minHeight: 290,
        background: '#ffffff',
        borderRadius: 12,
        overflow: 'hidden',
        border: '2px solid #1d4ed8',
        fontFamily: 'Inter, Arial, sans-serif',
        boxShadow: '0 6px 28px rgba(29,78,216,0.22)',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Top stripe — tricolor */}
      <div style={{ height: 6, display: 'flex', flexShrink: 0 }}>
        <div style={{ flex: 1, background: '#dc2626' }} />
        <div style={{ flex: 1, background: '#1d4ed8' }} />
        <div style={{ flex: 1, background: '#16a34a' }} />
      </div>

      {/* Header — centered, dark blue */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)',
        padding: '10px 16px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        position: 'relative',
        flexShrink: 0,
      }}>
        {/* Logo + org name centered */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo-maua.png" alt="ACCBM" style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Associação Cultural de Capoeira
            </div>
            <div style={{ color: '#fbbf24', fontSize: '1rem', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.15 }}>
              Barão de Mauá
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.5rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>
              Credencial de Associado
            </div>
          </div>
        </div>

        {/* Matricula badge top-right */}
        {data.inscricao_numero != null && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', textAlign: 'right', background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '3px 8px' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.42rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Matrícula</div>
            <div style={{ color: '#fbbf24', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.04em' }}>
              ACCBM-{String(data.inscricao_numero).padStart(6, '0')}
            </div>
          </div>
        )}
      </div>

      {/* Main body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT — photo + cord */}
        <div style={{
          width: 110,
          background: 'linear-gradient(180deg, #f0f9ff 0%, #dbeafe 100%)',
          borderRight: '2px solid #bfdbfe',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 8px 8px',
          gap: 7,
          flexShrink: 0,
        }}>
          {data.foto_url ? (
            <img
              src={data.foto_url}
              alt=""
              style={{ width: 72, height: 88, objectFit: 'cover', borderRadius: 6, border: '2px solid #1d4ed8' }}
              crossOrigin="anonymous"
            />
          ) : (
            <div style={{ width: 72, height: 88, borderRadius: 6, background: '#e0e7ff', border: '2px solid #a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
            </div>
          )}
          {/* Cord bar */}
          <div style={{ display: 'flex', width: 72, height: 8, borderRadius: 4, overflow: 'hidden', border: '1px solid #93c5fd' }}>
            {colors.map((c, i) => (
              <div key={i} style={{ flex: 1, background: c === '#FFFFFF' ? '#e5e7eb' : c }} />
            ))}
          </div>
          <div style={{ color: '#1e40af', fontSize: '0.44rem', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center', fontWeight: 700 }}>
            {data.nucleo}
          </div>
        </div>

        {/* RIGHT — info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 12px 6px', overflow: 'hidden' }}>

          {/* Name + nomenclatura */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: '#1e3a8a', fontWeight: 800, fontSize: '0.88rem', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.nome}</div>
            {nomenclatura && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                <span style={{ background: 'linear-gradient(90deg,#16a34a,#15803d)', color: '#fff', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 4, padding: '2px 7px' }}>
                  {nomenclatura}
                </span>
              </div>
            )}
          </div>

          {/* Data grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', flex: 1 }}>
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
                  <span style={{ color: '#3b82f6', fontSize: '0.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>{label}</span>
                  <span style={{ color: '#1e3a8a', fontSize: '0.62rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                </div>
              ) : null;
            })}
          </div>

          {/* Signature — centered below data */}
          <div style={{ borderTop: '1.5px solid #bfdbfe', paddingTop: 6, marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <img
              src={sig.imgSrc}
              alt="Assinatura"
              style={{ height: 32, maxWidth: 120, objectFit: 'contain' }}
            />
            <div style={{ fontSize: '0.5rem', fontWeight: 700, color: '#1e3a8a', lineHeight: 1.3, textAlign: 'center' }}>{sig.nome}</div>
            <div style={{ fontSize: '0.45rem', color: '#3b82f6', textAlign: 'center' }}>{sig.cargo}</div>
          </div>
        </div>
      </div>

      {/* Footer — validity + emission */}
      <div style={{
        background: 'linear-gradient(90deg, #dc2626 0%, #1d4ed8 50%, #16a34a 100%)',
        padding: '5px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.48rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Emitido: <strong>{emissaoStr}</strong>
        </span>
        <span style={{ color: '#fbbf24', fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ✦ Válida até {validadeStr} ✦
        </span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.48rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ACCBM
        </span>
      </div>
    </div>
  );
}
