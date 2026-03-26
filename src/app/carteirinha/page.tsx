'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Carteirinha, { CarteirinhaData } from '@/components/Carteirinha';

function CarteirinhaContent() {
  const searchParams = useSearchParams();
  const [cpf, setCpf] = useState('');
  const [data, setData] = useState<CarteirinhaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  const formatCPF = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const buscar = async (cpfValue?: string) => {
    const target = cpfValue ?? cpf;
    const cpfClean = target.replace(/\D/g, '');
    if (cpfClean.length < 11) { setError('CPF inválido.'); return; }
    setLoading(true); setError(''); setData(null);
    try {
      const { data: row, error: err } = await supabase
        .from('students')
        .select('*')
        .eq('cpf', target)
        .limit(1)
        .single();
      if (err || !row) {
        setError('Aluno não encontrado. Verifique o CPF informado.');
      } else {
        const studentUuid = (row as any).id as string | null;
        let inscricaoNum: number | null = (row as any).ordem_inscricao ?? null;
        // Fallback: busca via gerar-id (mapa estável por student_id)
        if (!inscricaoNum && studentUuid) {
          try {
            const idRes = await fetch(`/api/aluno/gerar-id?student_id=${encodeURIComponent(studentUuid)}`);
            const idData = await idRes.json();
            if (idData.display_id) {
              const match = (idData.display_id as string).match(/(\d+)$/);
              if (match) inscricaoNum = parseInt(match[1], 10);
            }
          } catch {}
        }
        setData({
          nome: row.nome_completo,
          cpf: row.cpf,
          identidade: row.identidade,
          nucleo: row.nucleo || '',
          graduacao: row.graduacao || '',
          tipo_graduacao: row.tipo_graduacao || '',
          foto_url: row.foto_url || null,
          menor_de_idade: row.menor_de_idade || false,
          nome_pai: row.nome_pai || '',
          nome_mae: row.nome_mae || '',
          nome_responsavel: row.nome_responsavel || null,
          cpf_responsavel: row.cpf_responsavel || null,
          inscricao_numero: inscricaoNum,
          telefone: row.telefone || null,
          student_id: studentUuid,
        });
      }
    } catch { setError('Erro ao buscar dados. Tente novamente.'); }
    setLoading(false);
  };

  // Auto-load if CPF comes in the URL (?cpf=XXX.XXX.XXX-XX)
  useEffect(() => {
    const cpfParam = searchParams.get('cpf');
    if (cpfParam) {
      const formatted = formatCPF(cpfParam);
      setCpf(formatted);
      buscar(formatted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [generating, setGenerating] = useState(false);

  const captureCanvas = async (el: HTMLElement) => {
    const html2canvas = (await import('html2canvas')).default;
    return html2canvas(el, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
  };

  const imprimir = async () => {
    const el = cardRef.current;
    if (!el || !data) return;
    setGenerating(true);
    try {
      const canvas = await captureCanvas(el);
      const imgData = canvas.toDataURL('image/png');
      const nome = data.nome;
      // Abre nova janela — se bloqueada pelo navegador, faz download direto
      const win = window.open('', '_blank');
      if (!win) {
        const a = document.createElement('a');
        a.href = imgData;
        a.download = `credencial-accbm.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      win.document.write(`<!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Credencial — ${nome}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          @page { size: A6 landscape; margin: 4mm; }
          html, body { width:100%; height:100%; background:#fff; display:flex; justify-content:center; align-items:center; }
          img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
          @media print { html,body { margin:0; padding:0; } }
        </style>
        </head><body><img src="${imgData}" /><script>window.onload=()=>{window.print();setTimeout(()=>window.close(),2500);}<\/script></body></html>
      `);
      win.document.close();
    } finally {
      setGenerating(false);
    }
  };

  const baixarPng = async () => {
    const el = cardRef.current;
    if (!el || !data) return;
    setGenerating(true);
    try {
      const canvas = await captureCanvas(el);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `credencial-accbm-${data.nome.split(' ')[0].toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      {/* Logo + título */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <img src="/logo-maua.png" alt="ACCBM" style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 10 }} />
        <div style={{ color: '#f87171', fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Capoeira Barão de Mauá
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', marginTop: 4 }}>
          {loading ? 'Carregando sua carteirinha…' : data ? `Bem-vindo(a), ${data.nome.split(' ')[0]}!` : 'Informe seu CPF para gerar sua carteirinha'}
        </div>
      </div>

      {/* Search box — hide if auto-loaded successfully */}
      {!data && (
        <div style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.06)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', padding: '24px 20px', marginBottom: 24 }}>
          <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 8 }}>
            CPF do Aluno
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={cpf}
              onChange={e => setCpf(formatCPF(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder="000.000.000-00"
              style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: '0.95rem', outline: 'none', fontFamily: 'Inter, sans-serif' }}
            />
            <button
              onClick={() => buscar()}
              disabled={loading}
              style={{ background: 'linear-gradient(135deg,#b45309,#78350f)', border: 'none', color: '#fff', padding: '11px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {error && (
            <p style={{ color: '#f87171', fontSize: '0.82rem', marginTop: 10, fontWeight: 600 }}>⚠ {error}</p>
          )}
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: 24 }}>Carregando…</div>
      )}

      {/* Result */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
          <div ref={cardRef} style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <Carteirinha data={data} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Imprimir / PDF */}
            <button
              onClick={imprimir}
              disabled={generating}
              style={{ padding: '11px 22px', background: generating ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 10, cursor: generating ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, opacity: generating ? 0.7 : 1 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              {generating ? 'Gerando...' : 'Imprimir / Salvar PDF'}
            </button>
            {/* Download PNG — alternativa para mobile */}
            <button
              onClick={baixarPng}
              disabled={generating}
              style={{ padding: '11px 22px', background: generating ? 'rgba(29,78,216,0.1)' : 'rgba(29,78,216,0.25)', border: '1px solid rgba(29,78,216,0.5)', color: '#93c5fd', borderRadius: 10, cursor: generating ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, opacity: generating ? 0.7 : 1 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {generating ? 'Gerando...' : 'Salvar Imagem'}
            </button>
            <button
              onClick={() => { setData(null); setCpf(''); setError(''); }}
              style={{ padding: '11px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
            >
              Buscar outro CPF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CarteirinhaPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Carregando…</div>
      </div>
    }>
      <CarteirinhaContent />
    </Suspense>
  );
}
