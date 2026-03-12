'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Carteirinha, { CarteirinhaData } from '@/components/Carteirinha';
import { Suspense } from 'react';

function VerificarContent() {
  const params = useSearchParams();
  const mat = params.get('mat');
  const [data, setData] = useState<CarteirinhaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mat) { setLoading(false); setError('Matrícula não informada.'); return; }
    fetch(`/api/verificar?mat=${encodeURIComponent(mat)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Associado não encontrado.');
        return r.json();
      })
      .then((d) => {
        setData({
          nome: d.nome_completo,
          cpf: '',
          identidade: '',
          nucleo: d.nucleo,
          graduacao: d.graduacao,
          tipo_graduacao: d.tipo_graduacao,
          foto_url: d.foto_url,
          menor_de_idade: d.menor_de_idade,
          nome_pai: d.nome_pai,
          nome_mae: d.nome_mae,
          nome_responsavel: d.nome_responsavel,
          cpf_responsavel: d.cpf_responsavel,
          inscricao_numero: d.inscricao_numero,
          apelido: d.apelido,
          nome_social: d.nome_social,
          sexo: d.sexo,
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mat]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
          <img src="/logo-maua.png" alt="ACCBM" style={{ width: 48, height: 48, objectFit: 'contain' }} />
          <div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Associação Cultural de Capoeira</div>
            <div style={{ color: '#fbbf24', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Barão de Mauá</div>
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ✦ Verificação de Credencial ✦
        </div>
      </div>

      {loading && (
        <div style={{ color: '#fff', fontSize: '1rem', padding: '40px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid #fbbf24', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Carregando...
        </div>
      )}

      {error && !loading && (
        <div style={{ background: 'rgba(220,38,38,0.15)', border: '1.5px solid #dc2626', borderRadius: 10, padding: '20px 32px', color: '#fca5a5', textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>Credencial não encontrada</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{error}</div>
        </div>
      )}

      {data && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 20px', color: '#86efac', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1rem' }}>✅</span> Credencial válida e autenticada
          </div>
          <Carteirinha data={data} />
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem', textAlign: 'center', marginTop: 4 }}>
            ACCBM — accbm.org.br
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function VerificarPage() {
  return (
    <Suspense>
      <VerificarContent />
    </Suspense>
  );
}
