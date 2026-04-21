'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { NUCLEOS, loadNucleosDinamicos, NucleoConfig } from '@/components/NucleoLoginPage';

export default function NucleoIndexPage() {
  const [nucleosList, setNucleosList] = useState<NucleoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemConfig, setSystemConfig] = useState<any>(null);

  useEffect(() => {
    // Carrega nucleos dinamicos e config do sistema
    Promise.all([
      loadNucleosDinamicos(),
      fetch('/api/admin/system-config').then(r => r.json()).catch(() => null)
    ]).then(([nucleos, config]) => {
      setNucleosList(Object.values(nucleos));
      setSystemConfig(config);
      setLoading(false);
    }).catch(() => {
      setNucleosList(Object.values(NUCLEOS));
      setLoading(false);
    });
  }, []);

  const systemName = systemConfig?.organization_name || 'Sistema de Gestao';
  const systemShort = systemConfig?.organization_short || 'DEMO';
  const logoUrl = systemConfig?.logo_url || '/logo-barao-maua.png';

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
          src={logoUrl}
          alt={systemShort}
          style={{ width: 110, height: 'auto', marginBottom: 14, filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))' }}
        />
        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          Sistema de Gestao
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginBottom: 6 }}>{systemShort}</div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)' }}>Selecione o seu nucleo para acessar o painel</div>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Carregando nucleos...</div>
      ) : nucleosList.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>*</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhum nucleo cadastrado</div>
          <div style={{ fontSize: '0.82rem' }}>Acesse o painel de administracao para cadastrar nucleos.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, width: '100%', maxWidth: 700 }}>
          {nucleosList.map(n => (
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
                  {n.emoji || '*'}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{n.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{n.cidade || 'Nucleo'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: 40, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/admin" style={{ textDecoration: 'none' }}>
          <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            Acesso Admin
          </div>
        </Link>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            Voltar ao Inicio
          </div>
        </Link>
      </div>
    </div>
  );
}
