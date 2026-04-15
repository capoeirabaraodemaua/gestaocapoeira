'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body style={{ fontFamily: 'monospace', padding: 32, background: '#1e293b', color: '#f8fafc' }}>
        <h2 style={{ color: '#f87171' }}>Erro detectado</h2>
        <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 13, color: '#fca5a5' }}>
          {error?.message || 'Erro desconhecido'}
          {'\n\n'}
          {error?.stack || ''}
        </pre>
        {error?.digest && <p style={{ color: '#94a3b8' }}>Digest: {error.digest}</p>}
        <button onClick={reset} style={{ marginTop: 16, padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
