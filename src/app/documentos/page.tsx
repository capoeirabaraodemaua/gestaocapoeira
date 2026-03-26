'use client';

import { useState, useEffect } from 'react';

type ManualFile = { name: string; size: number; created_at: string; url: string | null };

export default function DocumentosPage() {
  const [files, setFiles] = useState<ManualFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/manual')
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f172a,#1e293b)', fontFamily: 'Inter, system-ui, sans-serif', padding: '28px 16px 48px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <button onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/aluno'} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1, padding: 0 }}>←</button>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>📚 Documentos Históricos</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Associação Cultural de Capoeira Barão de Mauá</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '60px 0', fontSize: '0.9rem' }}>Carregando documentos...</div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '60px 0', fontSize: '0.9rem' }}>
            Nenhum documento disponível no momento.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {files.map(f => (
              <div key={f.name} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.8rem', lineHeight: 1, flexShrink: 0 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.name.replace(/\.pdf$/i, '').replace(/_/g, ' ')}
                  </div>
                  {f.size > 0 && (
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{(f.size / 1024).toFixed(0)} KB • PDF</div>
                  )}
                </div>
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                    ⬇ Baixar
                  </a>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>Indisponível</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <a href="/aluno" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textDecoration: 'none' }}>← Voltar para Área do Aluno</a>
        </div>
      </div>
    </div>
  );
}
