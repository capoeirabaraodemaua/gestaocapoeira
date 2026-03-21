'use client';
import Link from 'next/link';
import { NUCLEOS } from '@/components/NucleoLoginPage';

export default function NucleoIndexPage() {
  const list = Object.values(NUCLEOS);
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#0f172a,#1e293b)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-barao-maua.png"
          alt="Barão de Mauá"
          style={{ width: 110, height: 'auto', marginBottom: 14, filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))' }}
        />
        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          Associação Cultural de Capoeira
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginBottom: 6 }}>Barão de Mauá</div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)' }}>Selecione o seu núcleo para acessar o painel</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, width: '100%', maxWidth: 700 }}>
        {list.map(n => (
          <Link key={n.key} href={`/nucleo/${n.key}`} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'linear-gradient(160deg,#1a2035,#161e30)',
              border: `1.5px solid ${n.color}40`,
              borderRadius: 14,
              padding: '20px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              cursor: 'pointer',
              transition: 'transform 0.12s, box-shadow 0.12s',
              boxShadow: `0 4px 20px rgba(0,0,0,0.3)`,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 30px ${n.color}30`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${n.color}20`, border: `2px solid ${n.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                🥋
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#fff', marginBottom: 2 }}>{n.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{n.cidade}</div>
              </div>
              <div style={{ marginLeft: 'auto', color: `${n.colorLight}`, fontSize: '1.2rem', opacity: 0.7 }}>→</div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem', textDecoration: 'none' }}>
          ← Voltar para o site
        </Link>
      </div>
    </div>
  );
}
