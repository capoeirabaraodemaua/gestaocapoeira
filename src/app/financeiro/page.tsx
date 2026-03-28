'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { FichaFinanceira, Mensalidade, Parcela, UniformeItem } from '@/app/api/financeiro/route';
import type { FinanceiroConfig } from '@/app/api/financeiro/config/route';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

/** Returns true if the due date is within 5 days from today (and not yet paid) */
function isVencendoEm5Dias(vencimento: string, status: string): boolean {
  if (status === 'pago' || !vencimento) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(vencimento + 'T12:00:00');
  const diff = (venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 5;
}

function isAtrasado(vencimento: string, status: string): boolean {
  if (status === 'pago' || !vencimento) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(vencimento + 'T12:00:00');
  return venc < hoje;
}

/** Generate ISO date string (YYYY-MM-DD) for due dates starting from today+1 month increments */
function gerarVencimento(index: number): string {
  const base = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  base.setMonth(base.getMonth() + index + 1);
  return base.toISOString().slice(0, 10);
}

function gerarParcelas(total: number, numParcelas: number): Parcela[] {
  const valorParcela = Math.round((total / numParcelas) * 100) / 100;
  // Adjust last parcela for rounding differences
  const soma = valorParcela * (numParcelas - 1);
  const ultima = Math.round((total - soma) * 100) / 100;
  return Array.from({ length: numParcelas }, (_, i) => ({
    numero: i + 1,
    valor: i === numParcelas - 1 ? ultima : valorParcela,
    vencimento: gerarVencimento(i),
    status: 'pendente' as const,
  }));
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    pago:         { label: '✓ Pago',        bg: 'rgba(22,163,74,0.12)',   color: '#16a34a' },
    pendente:     { label: '⏳ Pendente',    bg: 'rgba(234,179,8,0.12)',   color: '#ca8a04' },
    atrasado:     { label: '⚠ Atrasado',    bg: 'rgba(220,38,38,0.12)',   color: '#dc2626' },
    nao_definido: { label: '— N/D',         bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
    solicitado:   { label: '📋 Solicitado', bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    confirmado:   { label: '✓ Confirmado',  bg: 'rgba(124,58,237,0.12)',  color: '#7c3aed' },
    entregue:     { label: '🎁 Entregue',   bg: 'rgba(22,163,74,0.12)',   color: '#16a34a' },
    cancelado:    { label: '✗ Cancelado',   bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
  };
  const s = map[status] || { label: status, bg: 'rgba(100,116,139,0.12)', color: '#64748b' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

const METODOS = ['PIX', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro'];

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  padding: '18px 20px',
  marginBottom: 16,
};

const sectionHeader = (color: string, icon: string, title: string, sub?: string) => (
  <div style={{ background: `linear-gradient(135deg,${color}dd,${color}99)`, borderRadius: '10px 10px 0 0', padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
    <span style={{ fontSize: '1.2rem' }}>{icon}</span>
    <div>
      <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>{title}</div>
      {sub && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.72rem' }}>{sub}</div>}
    </div>
  </div>
);

const DEFAULT_CONFIG: FinanceiroConfig = {
  mensalidade_valor: 80,
  batizado_integral: 150,
  batizado_max_parcelas: 12,
  contribuicao_mensal: 30,
  updated_at: '',
};

export default function FinanceiroPage() {
  const { t } = useLanguage();
  const [step, setStep] = useState<'login' | 'sheet'>('login');
  const [cpfInput, setCpfInput] = useState('');
  const [erro, setErro] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [config, setConfig] = useState<FinanceiroConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch('/api/financeiro/config').then(r => r.json()).then(d => { if (d) setConfig({ ...DEFAULT_CONFIG, ...d }); }).catch(() => {});
  }, []);

  const [student, setStudent] = useState<{ id: string; nome_completo: string; cpf: string; nucleo: string | null; foto_url: string | null; graduacao: string } | null>(null);
  const [ficha, setFicha] = useState<FichaFinanceira | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [activeSection, setActiveSection] = useState<'batizado' | 'mensalidades' | 'contribuicao' | 'uniformes'>('batizado');

  // Parcelamento selection state (new plan — not yet finalised)
  const [numParcelas, setNumParcelas] = useState(1);
  // Which modalidade the student pre-selected before clicking Finalizar
  // 'none' = nothing chosen yet; 'integral' or 'parcelado' = chosen but not saved
  const [planoSelecionado, setPlanoSelecionado] = useState<'none' | 'integral' | 'parcelado'>('none');
  const [finalizando, setFinalizando] = useState(false);
  // Edit mode for active batizado plan (student can change number of parcelas)
  const [editandoParcelas, setEditandoParcelas] = useState(false);
  const [numParcelasEdit, setNumParcelasEdit] = useState(1);

  // Upload state
  const [uploadingComp, setUploadingComp] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUpload, setPendingUpload] = useState<{ tipo: string; ref: string } | null>(null);

  // Uniform request form
  const [unifDesc, setUnifDesc] = useState('');
  const [unifTam, setUnifTam] = useState('');
  const [unifQtd, setUnifQtd] = useState(1);
  const [unifValor, setUnifValor] = useState(50);

  const handleLogin = async () => {
    const raw = cpfInput.trim();
    const digits = raw.replace(/\D/g, '');
    if (!raw) { setErro('Digite seu CPF ou Numeração Única do documento.'); return; }
    setLoadingLogin(true);
    setErro('');

    const { data: rows, error } = await supabase
      .from('students')
      .select('id, nome_completo, cpf, identidade, nucleo, foto_url, graduacao, tipo_graduacao, data_nascimento, telefone, cep, endereco, numero, bairro, cidade, estado');

    if (error || !rows) {
      setErro('Erro ao verificar cadastro. Tente novamente.');
      setLoadingLogin(false);
      return;
    }

    const data = rows.find(s => {
      const storedCpfDigits = (s.cpf || '').replace(/\D/g, '');
      const storedIdentidade = (s.identidade || '').replace(/\D/g, '').toLowerCase();
      const inputDigits = digits;
      const inputRaw = raw.replace(/\s/g, '').toLowerCase();
      if (digits.length >= 11 && storedCpfDigits === inputDigits) return true;
      if (inputRaw && (
        (s.identidade || '').replace(/\s/g, '').toLowerCase() === inputRaw ||
        (storedIdentidade && storedIdentidade === inputDigits)
      )) return true;
      return false;
    });

    if (!data) {
      setErro('Documento não encontrado. Verifique seu CPF ou Numeração Única.');
      setLoadingLogin(false);
      return;
    }

    const camposObrigatorios: Record<string, string> = {
      nome_completo: 'Nome Completo', data_nascimento: 'Data de Nascimento', telefone: 'Telefone',
      cep: 'CEP', endereco: 'Endereço', numero: 'Número', bairro: 'Bairro', cidade: 'Cidade',
      estado: 'Estado', nucleo: 'Núcleo', graduacao: 'Graduação', tipo_graduacao: 'Tipo de Graduação',
    };
    const pendentes = Object.entries(camposObrigatorios)
      .filter(([field]) => { const val = (data as Record<string, unknown>)[field]; return !val || (typeof val === 'string' && !val.trim()); })
      .map(([, label]) => label);

    if (pendentes.length > 0) {
      setErro(`Cadastro incompleto. Complete seu cadastro antes de acessar a ficha financeira.\n\nDados pendentes: ${pendentes.join(', ')}`);
      setLoadingLogin(false);
      return;
    }

    setStudent(data);
    const res = await fetch(`/api/financeiro?student_id=${data.id}`);
    const fichaData: FichaFinanceira | null = await res.json();
    if (fichaData) {
      setFicha(fichaData);
    } else {
      const now = new Date().toISOString().slice(0, 10);
      const defaultFicha: FichaFinanceira = {
        student_id: data.id,
        nome_completo: data.nome_completo,
        cpf: digits,
        nucleo: data.nucleo || '',
        batizado: { modalidade: 'nao_definido', valor_total: config.batizado_integral, parcelas: [], status_geral: 'nao_definido' },
        contribuicao: { ativa: false, valor_mensal: config.contribuicao_mensal, historico: [] },
        mensalidades: [],
        uniformes: [],
        alertas: { comprovante_pendente: false, uniforme_solicitado: false, mensalidade_atrasada: false, batizado_modalidade_escolhida: false, mensalidade_registrada: false, contribuicao_registrada: false, pagamento_registrado: false, ultimas_acoes: [] },
        updated_at: now,
      };
      setFicha(defaultFicha);
    }
    setLoadingLogin(false);
    setStep('sheet');
  };

  const saveFicha = async (updated: FichaFinanceira) => {
    setSaving(true);
    const res = await fetch('/api/financeiro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const { data } = await res.json();
      if (data) setFicha(data);
      setSaveMsg('Salvo com sucesso!');
      setTimeout(() => setSaveMsg(''), 3000);
    } else {
      setSaveMsg('Erro ao salvar. Tente novamente.');
    }
    setSaving(false);
  };

  const uploadComprovante = async (file: File, tipo: string, ref: string): Promise<string | null> => {
    setUploadingComp(`${tipo}_${ref}`);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('student_id', student!.id);
    fd.append('tipo', tipo);
    fd.append('ref', ref);
    const res = await fetch('/api/financeiro/comprovante', { method: 'POST', body: fd });
    setUploadingComp(null);
    if (res.ok) { const { url } = await res.json(); return url; }
    return null;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUpload || !ficha) return;
    const url = await uploadComprovante(file, pendingUpload.tipo, pendingUpload.ref);
    if (!url) { alert('Erro ao enviar comprovante.'); return; }

    let updated = { ...ficha };
    if (pendingUpload.tipo === 'mensalidade') {
      updated.mensalidades = updated.mensalidades.map(m =>
        m.mes === pendingUpload.ref ? { ...m, comprovante_url: url, comprovante_pendente: true } : m
      );
    } else if (pendingUpload.tipo === 'batizado') {
      const num = parseInt(pendingUpload.ref);
      updated.batizado.parcelas = updated.batizado.parcelas.map(p =>
        p.numero === num ? { ...p, comprovante_url: url, ...(({ comprovante_enviado: true }) as any) } : p
      );
    } else if (pendingUpload.tipo === 'contribuicao') {
      updated.contribuicao.historico = updated.contribuicao.historico.map(m =>
        m.mes === pendingUpload.ref ? { ...m, comprovante_url: url, comprovante_pendente: true } : m
      );
    }
    await saveFicha(updated);
    setPendingUpload(null);
    e.target.value = '';
  };

  const triggerUpload = (tipo: string, ref: string) => {
    setPendingUpload({ tipo, ref });
    fileInputRef.current?.click();
  };

  const maxParcelas = config.batizado_max_parcelas || 12;
  const valorTotal = config.batizado_integral;
  const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;

  const confirmarParcelamento = async (modalidade: 'integral' | 'parcelado', qtd: number) => {
    if (!ficha) return;
    const n = modalidade === 'integral' ? 1 : qtd;
    const parcelas = gerarParcelas(valorTotal, n);
    const updated = { ...ficha, batizado: { ...ficha.batizado, modalidade, parcelas, valor_total: valorTotal } };
    setFicha(updated);
    await saveFicha(updated);
  };

  const addMensalidade = async () => {
    if (!ficha) return;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (ficha.mensalidades.find(m => m.mes === mes)) { alert('Mensalidade deste mês já existe.'); return; }
    const nova: Mensalidade = { mes, valor: config.mensalidade_valor, status: 'pendente' };
    const updated = { ...ficha, mensalidades: [...ficha.mensalidades, nova].sort((a, b) => b.mes.localeCompare(a.mes)) };
    setFicha(updated);
    await saveFicha(updated);
  };

  const setMensalidadeMetodo = async (mes: string, metodo: string) => {
    if (!ficha) return;
    const updated = { ...ficha, mensalidades: ficha.mensalidades.map(m => m.mes === mes ? { ...m, metodo } : m) };
    setFicha(updated);
    await saveFicha(updated);
  };

  const addUniforme = async () => {
    if (!ficha || !unifDesc.trim()) { alert('Descreva o item do uniforme.'); return; }
    const item: UniformeItem = {
      id: `unif_${Date.now()}`,
      descricao: unifDesc.trim(),
      tamanho: unifTam || undefined,
      quantidade: unifQtd,
      valor_unitario: unifValor,
      status: 'solicitado',
      data_solicitacao: new Date().toISOString().slice(0, 10),
    };
    const updated = { ...ficha, uniformes: [...ficha.uniformes, item] };
    setFicha(updated);
    await saveFicha(updated);
    setUnifDesc(''); setUnifTam(''); setUnifQtd(1); setUnifValor(50);
  };

  // Count near-due parcelas for alert banner
  const parcelasVencendo = ficha?.batizado.parcelas.filter(p => isVencendoEm5Dias(p.vencimento, p.status)) ?? [];
  const mensalidadesVencendo = ficha?.mensalidades.filter(m => {
    // For mensalidades we don't have explicit due date, skip
    return m.status === 'atrasado';
  }) ?? [];

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0c29,#1a1a2e,#16213e)', color: '#fff', fontFamily: 'Inter,sans-serif', padding: '0 0 60px' }}>
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,rgba(220,38,38,0.15),rgba(30,58,138,0.2))', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => {
          const hasStudentId = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('student_id');
          if (hasStudentId) { window.location.href = '/aluno'; } else { history.back(); }
        }} style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }} title="Voltar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#dc2626,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>💰</div>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', letterSpacing: '0.02em' }}>{t('financial_title')}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Associação Cultural de Capoeira Barão de Mauá</div>
        </div>
        {step === 'sheet' && (
          <button onClick={() => { setStep('login'); setStudent(null); setFicha(null); setCpfInput(''); }}
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.8rem' }}>
            ← Sair
          </button>
        )}
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── LOGIN ── */}
        {step === 'login' && (
          <div style={{ maxWidth: 380, margin: '40px auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>🔒</div>
              <div style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 6 }}>{t('financial_title')}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Use seu CPF ou Numeração Única do documento</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                  CPF ou Numeração Única do Documento
                </label>
                <input
                  type="text" inputMode="text" placeholder="Ex: 000.000.000-00 ou nº do documento"
                  value={cpfInput}
                  onChange={e => setCpfInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  autoFocus
                  style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center', letterSpacing: '0.06em' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>Opção 1</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>CPF cadastrado</div>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>000.000.000-00</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>Opção 2</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Nº do Documento</div>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>RG / CIN / Doc. Único</div>
                </div>
              </div>
              {erro && <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'pre-line' }}>⚠ {erro}</div>}
              <button onClick={handleLogin} disabled={loadingLogin}
                style={{ padding: '13px', background: 'linear-gradient(135deg,#dc2626,#1d4ed8)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', opacity: loadingLogin ? 0.6 : 1 }}>
                {loadingLogin ? t('common_loading') : `🔓 ${t('financial_access')}`}
              </button>
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem' }}>
                Use o CPF ou a numeração do seu documento de identidade cadastrado.
              </div>
            </div>
          </div>
        )}

        {/* ── SHEET ── */}
        {step === 'sheet' && student && ficha && (
          <div>
            {/* Student card */}
            <div style={{ background: 'linear-gradient(135deg,rgba(220,38,38,0.1),rgba(29,78,216,0.1))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '16px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              {student.foto_url
                ? <img src={student.foto_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>👤</div>
              }
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}>{student.nome_completo}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>{student.graduacao} · {student.nucleo || '—'}</div>
              </div>
              {saveMsg && (
                <div style={{ marginLeft: 'auto', background: saveMsg.includes('Erro') ? 'rgba(220,38,38,0.12)' : 'rgba(22,163,74,0.12)', border: `1px solid ${saveMsg.includes('Erro') ? 'rgba(220,38,38,0.3)' : 'rgba(22,163,74,0.3)'}`, borderRadius: 8, padding: '6px 12px', color: saveMsg.includes('Erro') ? '#f87171' : '#4ade80', fontSize: '0.8rem', fontWeight: 700 }}>
                  {saveMsg}
                </div>
              )}
            </div>

            {/* ── Alerta de vencimento próximo (5 dias) ── */}
            {parcelasVencendo.length > 0 && (
              <div style={{ background: 'rgba(234,179,8,0.1)', border: '2px solid rgba(234,179,8,0.4)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.9rem', marginBottom: 4 }}>
                    Parcela{parcelasVencendo.length > 1 ? 's' : ''} a vencer em até 5 dias!
                  </div>
                  {parcelasVencendo.map(p => (
                    <div key={p.numero} style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)' }}>
                      • Parcela {p.numero} — {formatMoeda(p.valor)} — vence em {formatDate(p.vencimento)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
              {([
                { key: 'batizado',      label: `🥋 ${t('financial_batizado')}`,     color: '#7c3aed' },
                { key: 'mensalidades',  label: `📅 ${t('financial_mensalidades')}`,  color: '#0891b2' },
                { key: 'contribuicao',  label: `🤝 ${t('financial_contribuicao')}`,  color: '#16a34a' },
                { key: 'uniformes',     label: `👕 ${t('financial_uniformes')}`,     color: '#d97706' },
              ] as const).map(s => (
                <button key={s.key} onClick={() => setActiveSection(s.key)}
                  style={{ padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, flexShrink: 0, border: activeSection === s.key ? 'none' : '1px solid rgba(255,255,255,0.1)', background: activeSection === s.key ? `${s.color}` : 'rgba(255,255,255,0.05)', color: '#fff', transition: 'all 0.2s' }}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* ── BATIZADO ── */}
            {activeSection === 'batizado' && (
              <div style={cardStyle}>
                {sectionHeader('#7c3aed', '🥋', 'Pagamento do Batizado', `Valor total: ${formatMoeda(valorTotal)} · até ${maxParcelas}× sem juros`)}

                {ficha.batizado.modalidade === 'nao_definido' ? (
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: 18, textAlign: 'center' }}>
                      Escolha a forma de pagamento do batizado:
                    </div>

                    {/* Step 1 — Integral option */}
                    <button
                      onClick={() => { setPlanoSelecionado('integral'); setNumParcelas(1); }}
                      style={{ width: '100%', padding: '16px 18px', background: planoSelecionado === 'integral' ? 'rgba(124,58,237,0.22)' : 'rgba(124,58,237,0.08)', border: `2px solid ${planoSelecionado === 'integral' ? 'rgba(124,58,237,0.8)' : 'rgba(124,58,237,0.3)'}`, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1.5rem' }}>💳</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Pagamento Integral</div>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', marginTop: 2 }}>
                            {formatMoeda(valorTotal)} à vista — parcela única
                          </div>
                        </div>
                        {planoSelecionado === 'integral' && <span style={{ marginLeft: 'auto', fontSize: '1.1rem' }}>✅</span>}
                      </div>
                    </button>

                    {/* Step 1 — Parcelado option */}
                    <div
                      onClick={() => { if (planoSelecionado !== 'parcelado') setPlanoSelecionado('parcelado'); }}
                      style={{ background: planoSelecionado === 'parcelado' ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.05)', border: `2px solid ${planoSelecionado === 'parcelado' ? 'rgba(59,130,246,0.7)' : 'rgba(59,130,246,0.25)'}`, borderRadius: 12, padding: '16px 18px', cursor: 'pointer', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: planoSelecionado === 'parcelado' ? 14 : 0 }}>
                        <span style={{ fontSize: '1.5rem' }}>📆</span>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Parcelado — sem juros</div>
                        {planoSelecionado === 'parcelado' && <span style={{ marginLeft: 'auto', fontSize: '1.1rem' }}>✅</span>}
                      </div>

                      {/* Parcelas grid — only shown after user selects "Parcelado" */}
                      {planoSelecionado === 'parcelado' && (
                        <div onClick={e => e.stopPropagation()}>
                          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Escolha a quantidade de parcelas:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                            {Array.from({ length: maxParcelas }, (_, i) => i + 1).map(n => {
                              const vp = Math.round((valorTotal / n) * 100) / 100;
                              const isSelected = numParcelas === n;
                              return (
                                <button key={n} onClick={() => setNumParcelas(n)}
                                  style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                    background: isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)',
                                    border: `1.5px solid ${isSelected ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.1)'}`,
                                    color: isSelected ? '#93c5fd' : 'rgba(255,255,255,0.6)',
                                  }}>
                                  {n}× <span style={{ fontWeight: 400, fontSize: '0.72rem' }}>{formatMoeda(vp)}</span>
                                </button>
                              );
                            })}
                          </div>
                          {/* Preview */}
                          <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 2 }}>
                            <div style={{ fontWeight: 700, color: '#93c5fd', fontSize: '0.82rem', marginBottom: 4 }}>
                              Plano selecionado: {numParcelas}× de {formatMoeda(valorParcela)}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {gerarParcelas(valorTotal, numParcelas).map(p => (
                                <span key={p.numero} style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 7px', color: 'rgba(255,255,255,0.5)' }}>
                                  {p.numero}ª {formatMoeda(p.valor)} · {formatDate(p.vencimento)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 2 — Finalizar button (only active when a plan is selected) */}
                    {planoSelecionado !== 'none' && (
                      <div style={{ background: 'rgba(22,163,74,0.08)', border: '2px solid rgba(22,163,74,0.35)', borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', marginBottom: 12 }}>
                          {planoSelecionado === 'integral'
                            ? `💳 Integral — ${formatMoeda(valorTotal)} à vista`
                            : `📆 ${numParcelas}× de ${formatMoeda(valorParcela)} (total ${formatMoeda(valorTotal)})`}
                          <br/>
                          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                            Revise antes de finalizar. Após clicar em Finalizar, o evento será criado e enviado ao painel administrativo.
                          </span>
                        </div>
                        <button
                          disabled={finalizando}
                          onClick={async () => {
                            setFinalizando(true);
                            await confirmarParcelamento(planoSelecionado, planoSelecionado === 'integral' ? 1 : numParcelas);
                            setPlanoSelecionado('none');
                            setFinalizando(false);
                          }}
                          style={{ width: '100%', padding: '13px', background: finalizando ? '#374151' : 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 900, cursor: finalizando ? 'wait' : 'pointer', fontSize: '1rem', letterSpacing: '0.02em' }}>
                          {finalizando ? '⏳ Criando evento...' : '✅ Finalizar e Criar Evento'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* Plano ativo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                      <span style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, padding: '5px 13px', color: '#a78bfa', fontWeight: 700, fontSize: '0.85rem' }}>
                        {ficha.batizado.modalidade === 'integral'
                          ? `💳 Integral — ${formatMoeda(ficha.batizado.valor_total)}`
                          : `📆 ${ficha.batizado.parcelas.length}× de ${formatMoeda(ficha.batizado.parcelas[0]?.valor ?? 0)}`}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>
                        Total: {formatMoeda(ficha.batizado.valor_total || valorTotal)}
                      </span>
                      {/* Progress */}
                      {ficha.batizado.parcelas.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#4ade80' }}>
                          {ficha.batizado.parcelas.filter(p => p.status === 'pago').length}/{ficha.batizado.parcelas.length} pagas
                        </span>
                      )}
                      <button onClick={() => {
                        setEditandoParcelas(!editandoParcelas);
                        setNumParcelasEdit(ficha.batizado.parcelas.length || 1);
                      }}
                        style={{ marginLeft: 'auto', background: editandoParcelas ? 'rgba(124,58,237,0.2)' : 'none', border: `1px solid ${editandoParcelas ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.1)'}`, color: editandoParcelas ? '#c4b5fd' : 'rgba(255,255,255,0.4)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }}>
                        ✏️ Alterar parcelamento
                      </button>
                    </div>

                    {/* Inline edit panel — change number of parcelas */}
                    {editandoParcelas && (
                      <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                        <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: '0.85rem', marginBottom: 10 }}>✏️ Alterar quantidade de parcelas</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          <button onClick={() => setNumParcelasEdit(1)}
                            style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, background: numParcelasEdit === 1 ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${numParcelasEdit === 1 ? 'rgba(124,58,237,0.8)' : 'rgba(255,255,255,0.1)'}`, color: numParcelasEdit === 1 ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}>
                            1× <span style={{ fontWeight: 400, fontSize: '0.72rem' }}>{formatMoeda(valorTotal)}</span>
                          </button>
                          {Array.from({ length: maxParcelas - 1 }, (_, i) => i + 2).map(n => {
                            const vp = Math.round((valorTotal / n) * 100) / 100;
                            const isSelected = numParcelasEdit === n;
                            return (
                              <button key={n} onClick={() => setNumParcelasEdit(n)}
                                style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, background: isSelected ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${isSelected ? 'rgba(124,58,237,0.8)' : 'rgba(255,255,255,0.1)'}`, color: isSelected ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}>
                                {n}× <span style={{ fontWeight: 400, fontSize: '0.72rem' }}>{formatMoeda(vp)}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                          Novo plano: <strong style={{ color: '#c4b5fd' }}>{numParcelasEdit}× de {formatMoeda(Math.round((valorTotal / numParcelasEdit) * 100) / 100)}</strong>
                          {' '}· Total: {formatMoeda(valorTotal)} · Novas datas de vencimento serão geradas.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={async () => {
                            const mod = numParcelasEdit === 1 ? 'integral' : 'parcelado';
                            await confirmarParcelamento(mod, numParcelasEdit);
                            setEditandoParcelas(false);
                          }}
                            style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' }}>
                            ✓ Confirmar alteração
                          </button>
                          <button onClick={() => setEditandoParcelas(false)}
                            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Parcelas */}
                    {ficha.batizado.parcelas.map(p => {
                      const vencendo = isVencendoEm5Dias(p.vencimento, p.status);
                      const atrasada = isAtrasado(p.vencimento, p.status);
                      const statusFinal = atrasada && p.status !== 'pago' ? 'atrasado' : p.status;
                      return (
                        <div key={p.numero} style={{ background: vencendo ? 'rgba(234,179,8,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${vencendo ? 'rgba(234,179,8,0.35)' : atrasada ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                            <div>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                                Parcela {p.numero}/{ficha.batizado.parcelas.length} — {formatMoeda(p.valor)}
                              </span>
                              {p.vencimento && (
                                <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                                  vence {formatDate(p.vencimento)}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {statusBadge(statusFinal)}
                              {vencendo && <span style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 20, padding: '2px 8px', fontSize: '0.68rem', color: '#fbbf24', fontWeight: 700 }}>⏰ A vencer</span>}
                            </div>
                          </div>
                          {/* Method select */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                            {METODOS.map(m => (
                              <button key={m} onClick={async () => {
                                const updated = { ...ficha, batizado: { ...ficha.batizado, parcelas: ficha.batizado.parcelas.map(pp => pp.numero === p.numero ? { ...pp, metodo: m } : pp) } };
                                setFicha(updated); await saveFicha(updated);
                              }}
                                style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, background: p.metodo === m ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${p.metodo === m ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.08)'}`, color: p.metodo === m ? '#c4b5fd' : 'rgba(255,255,255,0.5)' }}>
                                {m}
                              </button>
                            ))}
                          </div>
                          {/* Comprovante */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {p.comprovante_url
                              ? <a href={p.comprovante_url} target="_blank" rel="noreferrer" style={{ color: '#a78bfa', fontSize: '0.78rem', textDecoration: 'underline' }}>📎 Ver comprovante</a>
                              : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>Sem comprovante</span>
                            }
                            <button onClick={() => triggerUpload('batizado', String(p.numero))}
                              disabled={uploadingComp === `batizado_${p.numero}`}
                              style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', color: '#c4b5fd', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                              {uploadingComp === `batizado_${p.numero}` ? '⏳' : '📤'} Enviar comprovante
                            </button>
                          </div>
                          {(p as any).comprovante_enviado && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#fbbf24' }}>⏳ Comprovante enviado — aguardando confirmação do admin</div>}
                        </div>
                      );
                    })}

                    {/* Resumo total pago */}
                    {ficha.batizado.parcelas.length > 0 && (
                      <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(124,58,237,0.08)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                          Total pago: {formatMoeda(ficha.batizado.parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0))}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                          Saldo restante: {formatMoeda(ficha.batizado.parcelas.filter(p => p.status !== 'pago').reduce((s, p) => s + p.valor, 0))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── MENSALIDADES ── */}
            {activeSection === 'mensalidades' && (
              <div style={cardStyle}>
                {sectionHeader('#0891b2', '📅', 'Mensalidades', `Valor padrão: ${formatMoeda(config.mensalidade_valor)}/mês`)}
                <button onClick={addMensalidade}
                  style={{ marginBottom: 14, padding: '8px 18px', background: 'rgba(8,145,178,0.2)', border: '1px solid rgba(8,145,178,0.4)', color: '#67e8f9', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  + Registrar mês atual
                </button>
                {ficha.mensalidades.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '30px 0', fontSize: '0.85rem' }}>Nenhuma mensalidade registrada ainda.</div>
                )}
                {ficha.mensalidades.map(m => {
                  const [y, mo] = m.mes.split('-');
                  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                  const label = `${names[parseInt(mo)-1]}/${y}`;
                  return (
                    <div key={m.mes} style={{ background: m.status === 'atrasado' ? 'rgba(220,38,38,0.05)' : 'rgba(255,255,255,0.03)', border: `1px solid ${m.status === 'atrasado' ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{label} — {formatMoeda(m.valor)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {statusBadge(m.status)}
                          {m.status !== 'pago' && !m.admin_confirmado && (
                            <button onClick={async () => {
                              if (!confirm(`Excluir mensalidade de ${label}?`)) return;
                              const updated = { ...ficha, mensalidades: ficha.mensalidades.filter(x => x.mes !== m.mes) };
                              setFicha(updated); await saveFicha(updated);
                            }} style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
                              🗑
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        {METODOS.map(mt => (
                          <button key={mt} onClick={() => setMensalidadeMetodo(m.mes, mt)}
                            style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, background: m.metodo === mt ? 'rgba(8,145,178,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${m.metodo === mt ? 'rgba(8,145,178,0.6)' : 'rgba(255,255,255,0.08)'}`, color: m.metodo === mt ? '#67e8f9' : 'rgba(255,255,255,0.5)' }}>
                            {mt}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {m.comprovante_url
                          ? <a href={m.comprovante_url} target="_blank" rel="noreferrer" style={{ color: '#67e8f9', fontSize: '0.78rem', textDecoration: 'underline' }}>📎 Ver comprovante</a>
                          : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>Sem comprovante</span>
                        }
                        <button onClick={() => triggerUpload('mensalidade', m.mes)}
                          disabled={uploadingComp === `mensalidade_${m.mes}`}
                          style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(8,145,178,0.12)', border: '1px solid rgba(8,145,178,0.3)', color: '#67e8f9', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                          {uploadingComp === `mensalidade_${m.mes}` ? '⏳' : '📤'} Enviar comprovante
                        </button>
                        {m.comprovante_pendente && !m.admin_confirmado && <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>⏳ Aguardando confirmação</span>}
                        {m.admin_confirmado && <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>✅ Confirmado pelo admin</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── CONTRIBUIÇÃO ── */}
            {activeSection === 'contribuicao' && (
              <div style={cardStyle}>
                {sectionHeader('#16a34a', '🤝', 'Contribuição — Projeto Social', `Valor sugerido: ${formatMoeda(config.contribuicao_mensal)}/mês`)}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Participar do projeto social?</span>
                    {[true, false].map(v => (
                      <button key={String(v)} onClick={async () => {
                        const updated = { ...ficha, contribuicao: { ...ficha.contribuicao, ativa: v } };
                        setFicha(updated); await saveFicha(updated);
                      }}
                        style={{ padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', background: ficha.contribuicao.ativa === v ? (v ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.2)') : 'rgba(255,255,255,0.05)', border: `1px solid ${ficha.contribuicao.ativa === v ? (v ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.4)') : 'rgba(255,255,255,0.08)'}`, color: ficha.contribuicao.ativa === v ? (v ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.5)' }}>
                        {v ? 'Sim' : 'Não'}
                      </button>
                    ))}
                  </div>
                  {ficha.contribuicao.ativa && (
                    <div>
                      <button onClick={async () => {
                        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                        const mes = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                        if (ficha.contribuicao.historico.find(m => m.mes === mes)) { alert('Contribuição deste mês já registrada.'); return; }
                        const nova: Mensalidade = { mes, valor: ficha.contribuicao.valor_mensal, status: 'pendente' };
                        const updated = { ...ficha, contribuicao: { ...ficha.contribuicao, historico: [...ficha.contribuicao.historico, nova].sort((a,b) => b.mes.localeCompare(a.mes)) } };
                        setFicha(updated); await saveFicha(updated);
                      }}
                        style={{ marginBottom: 12, padding: '7px 16px', background: 'rgba(22,163,74,0.2)', border: '1px solid rgba(22,163,74,0.4)', color: '#4ade80', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                        + Registrar contribuição do mês
                      </button>
                      {ficha.contribuicao.historico.map(m => {
                        const [y, mo] = m.mes.split('-');
                        const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                        return (
                          <div key={m.mes} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{names[parseInt(mo)-1]}/{y} — {formatMoeda(m.valor)}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {statusBadge(m.status)}
                                {m.status !== 'pago' && !m.admin_confirmado && (
                                  <button onClick={async () => {
                                    if (!confirm(`Excluir contribuição de ${names[parseInt(mo)-1]}/${y}?`)) return;
                                    const updated = { ...ficha, contribuicao: { ...ficha.contribuicao, historico: ficha.contribuicao.historico.filter(x => x.mes !== m.mes) } };
                                    setFicha(updated); await saveFicha(updated);
                                  }} style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
                                    🗑
                                  </button>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                              {METODOS.map(mt => (
                                <button key={mt} onClick={async () => {
                                  const updated = { ...ficha, contribuicao: { ...ficha.contribuicao, historico: ficha.contribuicao.historico.map(c => c.mes === m.mes ? { ...c, metodo: mt } : c) } };
                                  setFicha(updated); await saveFicha(updated);
                                }}
                                  style={{ padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, background: m.metodo === mt ? 'rgba(22,163,74,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${m.metodo === mt ? 'rgba(22,163,74,0.5)' : 'rgba(255,255,255,0.08)'}`, color: m.metodo === mt ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>
                                  {mt}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              {m.comprovante_url
                                ? <a href={m.comprovante_url} target="_blank" rel="noreferrer" style={{ color: '#4ade80', fontSize: '0.75rem', textDecoration: 'underline' }}>📎 Ver comprovante</a>
                                : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>Sem comprovante</span>
                              }
                              <button onClick={() => triggerUpload('contribuicao', m.mes)}
                                style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                                {uploadingComp === `contribuicao_${m.mes}` ? '⏳' : '📤'} Enviar comprovante
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── UNIFORMES ── */}
            {activeSection === 'uniformes' && (
              <div style={cardStyle}>
                {sectionHeader('#d97706', '👕', 'Solicitação de Uniformes')}
                <div style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fbbf24', marginBottom: 10 }}>Nova solicitação</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input value={unifDesc} onChange={e => setUnifDesc(e.target.value)} placeholder="Item (ex: Abadá, Camiseta...)"
                      style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: '0.82rem', outline: 'none' }} />
                    <input value={unifTam} onChange={e => setUnifTam(e.target.value)} placeholder="Tamanho (P, M, G...)"
                      style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: '0.82rem', outline: 'none' }} />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>Qtd:</span>
                      <input type="number" min={1} max={10} value={unifQtd} onChange={e => setUnifQtd(parseInt(e.target.value)||1)}
                        style={{ width: 60, padding: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: '0.82rem', outline: 'none', textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>Valor unit.:</span>
                      <input type="number" min={0} value={unifValor} onChange={e => setUnifValor(parseFloat(e.target.value)||0)}
                        style={{ width: 80, padding: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: '0.82rem', outline: 'none', textAlign: 'center' }} />
                    </div>
                  </div>
                  <button onClick={addUniforme} style={{ width: '100%', padding: '9px', background: 'linear-gradient(135deg,#d97706,#b45309)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                    📋 Enviar Solicitação
                  </button>
                </div>
                {ficha.uniformes.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '20px 0', fontSize: '0.85rem' }}>Nenhuma solicitação registrada.</div>
                )}
                {ficha.uniformes.map(u => (
                  <div key={u.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{u.descricao}{u.tamanho ? ` (${u.tamanho})` : ''}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {statusBadge(u.status)}
                        {u.status === 'solicitado' && (
                          <button onClick={async () => {
                            if (!confirm(`Cancelar solicitação de "${u.descricao}"?`)) return;
                            const updated = { ...ficha, uniformes: ficha.uniformes.filter(x => x.id !== u.id) };
                            setFicha(updated); await saveFicha(updated);
                          }} style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem' }}>
                      {u.quantidade}× {formatMoeda(u.valor_unitario)} · Total: {formatMoeda(u.quantidade * u.valor_unitario)} · Solicitado em {formatDate(u.data_solicitacao)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
