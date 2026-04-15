'use client';

/**
 * AlunoViewer — Embedded student area for the admin panel.
 * Accepts a studentId prop and renders the full student experience inline,
 * without login flow, without iframe, with real data sync.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Carteirinha from '@/components/Carteirinha';
import DocumentsBar from '@/components/DocumentsBar';

type Student = {
  id: string;
  nome_completo: string;
  apelido?: string;
  nome_social?: string;
  cpf?: string;
  identidade?: string;
  data_nascimento?: string;
  telefone?: string;
  email?: string;
  nucleo?: string;
  graduacao?: string;
  tipo_graduacao?: string;
  foto_url?: string;
  sexo?: string;
  inscricao_numero?: number;
  nome_pai?: string;
  nome_mae?: string;
  nome_responsavel?: string;
  cpf_responsavel?: string;
  menor_de_idade?: boolean;
  [key: string]: unknown;
};

type Justificativa = {
  id: string;
  data_falta: string;
  motivo: string;
  status: 'pendente' | 'aprovado' | 'recusado';
  resposta_mestre?: string;
  created_at: string;
};

type RegistroGraduacao = {
  id: string;
  data_graduacao: string;
  graduacao_recebida: string;
  evento: string;
  professor_responsavel: string;
  observacoes?: string;
  criado_em: string;
};

type Tab = 'dashboard' | 'evolucao' | 'carteirinha' | 'presenca' | 'financeiro' | 'graduacao' | 'fotos' | 'justificativas' | 'playlist' | 'conta';

const NUCLEO_COLORS: Record<string, string> = {
  'Poliesportivo Edson Alves': '#dc2626',
  'Poliesportivo do Ipiranga': '#ea580c',
  'Saracuruna': '#16a34a',
  'Vila Urussaí': '#9333ea',
  'Jayme Fichman': '#0891b2',
  'Academia Mais Saúde': '#059669',
};

const GRAD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Cru': { bg: '#f8f8f8', text: '#374151', border: '#d1d5db' },
  'Amarela': { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  'Laranja': { bg: '#fff7ed', text: '#9a3412', border: '#fb923c' },
  'Azul': { bg: '#eff6ff', text: '#1e40af', border: '#60a5fa' },
  'Vermelha': { bg: '#fef2f2', text: '#991b1b', border: '#f87171' },
  'Verde': { bg: '#f0fdf4', text: '#166534', border: '#4ade80' },
  'Roxa': { bg: '#faf5ff', text: '#6b21a8', border: '#c084fc' },
  'Marrom': { bg: '#fdf4dc', text: '#78350f', border: '#d97706' },
  'Preta': { bg: '#1f2937', text: '#f9fafb', border: '#4b5563' },
};

function getGradColor(grad: string) {
  return GRAD_COLORS[grad] || { bg: '#f0f9ff', text: '#0369a1', border: '#7dd3fc' };
}

function getNucleoColor(nucleo: string): string {
  return NUCLEO_COLORS[nucleo] || '#1d4ed8';
}

interface AlunoViewerProps {
  studentId: string;
  onClose?: () => void;
}

export default function AlunoViewer({ studentId, onClose }: AlunoViewerProps) {
  const [student, setStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [alunoInscricaoNum, setAlunoInscricaoNum] = useState<number | null>(null);
  const carteirinhaRef = useRef<HTMLDivElement>(null);
  const fotosFileRef = useRef<HTMLInputElement>(null);

  // Justificativas
  const [justificativas, setJustificativas] = useState<Justificativa[]>([]);
  const [justForm, setJustForm] = useState({ data_falta: '', motivo: '' });
  const [justLoading, setJustLoading] = useState(false);
  const [justMsg, setJustMsg] = useState('');
  const [justMsgType, setJustMsgType] = useState<'success' | 'error'>('success');

  // Graduação
  const [historico, setHistorico] = useState<RegistroGraduacao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Fotos
  const [fotosMedia, setFotosMedia] = useState<{ name: string; url: string; type: 'foto' | 'video'; size: number; created_at: string }[]>([]);
  const [fotosLoading, setFotosLoading] = useState(false);
  const [fotosUploading, setFotosUploading] = useState(false);
  const [fotosMsg, setFotosMsg] = useState('');

  // Playlist
  const [playlistItems, setPlaylistItems] = useState<{ id: string; title: string; url: string; platform: string; created_at: string }[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistAddUrl, setPlaylistAddUrl] = useState('');
  const [playlistAddTitle, setPlaylistAddTitle] = useState('');
  const [playlistAdding, setPlaylistAdding] = useState(false);
  const [playlistMsg, setPlaylistMsg] = useState('');
  const [playlistMsgType, setPlaylistMsgType] = useState<'success' | 'error'>('success');
  const [playlistEditId, setPlaylistEditId] = useState<string | null>(null);
  const [playlistEditTitle, setPlaylistEditTitle] = useState('');
  const [playlistEditUrl, setPlaylistEditUrl] = useState('');

  // Evolução
  const [evolucaoDates, setEvolucaoDates] = useState<string[]>([]);
  const [evolucaoEntries, setEvolucaoEntries] = useState<{ date: string; nucleo: string | null; local_nome: string | null; hora: string | null }[]>([]);
  const [evolucaoLoading, setEvolucaoLoading] = useState(false);

  // Presença
  const [presencaMsg, setPresencaMsg] = useState('');
  const [presencaLoading, setPresencaLoading] = useState(false);
  const [presencaStatus, setPresencaStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [presencaLocalSelecionado, setPresencaLocalSelecionado] = useState('');

  // ── Load student data ─────────────────────────────────────────────────────
  const loadStudentData = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aluno/dados?student_id=${sid}`);
      if (res.ok) {
        const { student: s } = await res.json();
        if (s) {
          setStudent(s);
          const ordNum = (s as Record<string, unknown>).ordem_inscricao as number | null ?? null;
          if (ordNum) {
            setAlunoInscricaoNum(ordNum);
          } else {
            fetch(`/api/aluno/gerar-id?student_id=${encodeURIComponent(sid)}`)
              .then(r => r.json())
              .then(d => {
                if (d.display_id) {
                  const match = (d.display_id as string).match(/(\d+)$/);
                  if (match) setAlunoInscricaoNum(parseInt(match[1], 10));
                }
              }).catch(() => {});
          }
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  const loadJustificativas = useCallback(async (sid: string) => {
    const res = await fetch(`/api/aluno/justificativas?student_id=${sid}`);
    if (res.ok) setJustificativas(await res.json());
  }, []);

  const loadHistorico = useCallback(async (sid: string) => {
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/historico-graduacoes?student_id=${sid}`);
      if (res.ok) { const { records } = await res.json(); setHistorico(records || []); }
    } catch {}
    setLoadingHistorico(false);
  }, []);

  const loadFotos = useCallback(async (sid: string) => {
    setFotosLoading(true);
    try {
      const res = await fetch(`/api/aluno/media?student_id=${sid}`);
      if (res.ok) { const { files } = await res.json(); setFotosMedia(files || []); }
    } catch {}
    setFotosLoading(false);
  }, []);

  // Load student whenever studentId changes
  useEffect(() => {
    if (studentId) {
      setActiveTab('dashboard');
      setStudent(null);
      setJustificativas([]); setHistorico([]); setFotosMedia([]); setPlaylistItems([]);
      setEvolucaoDates([]); setEvolucaoEntries([]);
      loadStudentData(studentId);
    }
  }, [studentId, loadStudentData]);

  // Tab-specific data loading
  useEffect(() => {
    if (!studentId) return;
    if (activeTab === 'justificativas') loadJustificativas(studentId);
    if (activeTab === 'graduacao') loadHistorico(studentId);
    if (activeTab === 'fotos') loadFotos(studentId);
    if (activeTab === 'playlist') {
      setPlaylistLoading(true);
      fetch(`/api/aluno/playlist?student_id=${studentId}`)
        .then(r => r.json())
        .then(d => { setPlaylistItems(Array.isArray(d) ? d : []); setPlaylistLoading(false); })
        .catch(() => setPlaylistLoading(false));
    }
    if (activeTab === 'evolucao') {
      setEvolucaoLoading(true);
      fetch(`/api/aluno/evolucao?student_id=${studentId}`)
        .then(r => r.json())
        .then(d => {
          setEvolucaoDates(Array.isArray(d.dates) ? d.dates : []);
          setEvolucaoEntries(Array.isArray(d.entries) ? d.entries : []);
          setEvolucaoLoading(false);
        })
        .catch(() => setEvolucaoLoading(false));
    }
  }, [studentId, activeTab, loadJustificativas, loadHistorico, loadFotos]);

  const nucleoColor = student ? getNucleoColor(student.nucleo || '') : '#1d4ed8';
  const displayName = student?.apelido || student?.nome_social || student?.nome_completo?.split(' ')[0] || 'Aluno';

  const cartData = student ? {
    nome: student.nome_completo,
    cpf: student.cpf || '',
    identidade: student.identidade || '',
    nucleo: student.nucleo || '',
    graduacao: student.graduacao || '',
    tipo_graduacao: student.tipo_graduacao || '',
    foto_url: student.foto_url || null,
    menor_de_idade: !!student.menor_de_idade,
    nome_pai: student.nome_pai as string || '',
    nome_mae: student.nome_mae as string || '',
    nome_responsavel: student.nome_responsavel as string || '',
    cpf_responsavel: student.cpf_responsavel as string || '',
    inscricao_numero: alunoInscricaoNum ?? (student.inscricao_numero as number | null) ?? null,
    telefone: student.telefone || '',
    student_id: student.id,
    data_nascimento: student.data_nascimento || '',
  } : null;

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard',      icon: '🏠', label: 'Início' },
    { id: 'evolucao',       icon: '📊', label: 'Evolução' },
    { id: 'carteirinha',    icon: '🪪', label: 'Carteirinha' },
    { id: 'presenca',       icon: '📍', label: 'Presença' },
    { id: 'financeiro',     icon: '💰', label: 'Financeiro' },
    { id: 'graduacao',      icon: '🎖️', label: 'Graduação' },
    { id: 'fotos',          icon: '📸', label: 'Fotos' },
    { id: 'justificativas', icon: '📝', label: 'Justific.' },
    { id: 'playlist',       icon: '🎵', label: 'Playlist' },
    { id: 'conta',          icon: '⚙️', label: 'Conta' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#9ca3af', fontSize: '0.9rem' }}>
        Carregando dados do aluno...
      </div>
    );
  }

  if (!student) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#9ca3af', fontSize: '0.9rem' }}>
        Aluno não encontrado.
      </div>
    );
  }

  return (
    <div style={{ background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif', borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb' }}>

      {/* Admin preview banner */}
      <div style={{ background: '#1d4ed8', color: '#fff', fontSize: '0.72rem', padding: '5px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Visualizando como <strong>{student.nome_completo}</strong> — {student.nucleo || 'ACCBM'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => loadStudentData(studentId)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}>↺ Atualizar</button>
          {onClose && <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 700 }}>✕</button>}
        </div>
      </div>

      {/* Compact header */}
      <header style={{ color: '#fff', backgroundColor: nucleoColor, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {student.foto_url ? (
            <img src={student.foto_url} alt={displayName} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🥋</div>
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2 }}>{displayName}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>{student.nucleo || 'ACCBM'} • {student.graduacao || 'Aluno'}</div>
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', overflowX: 'auto', padding: '0 6px', gap: 0 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '7px 9px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: activeTab === tab.id ? `2.5px solid ${nucleoColor}` : '2.5px solid transparent', color: activeTab === tab.id ? nucleoColor : '#6b7280', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.65rem', whiteSpace: 'nowrap', transition: 'all 0.15s', minWidth: 52 }}>
              <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div style={{ padding: '16px 16px 32px', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: `linear-gradient(135deg, ${nucleoColor}, ${nucleoColor}cc)`, borderRadius: 16, padding: '18px', color: '#fff', boxShadow: `0 6px 18px ${nucleoColor}40` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                {student.foto_url ? (
                  <img src={student.foto_url} alt={displayName} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.5)', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🥋</div>
                )}
                <div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bem-vindo(a)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.2 }}>{displayName}! 👋</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 10px' }}>
                  <div style={{ fontSize: '0.6rem', opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Nome Completo</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.2 }}>{student.nome_completo}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 10px' }}>
                  <div style={{ fontSize: '0.6rem', opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Graduação</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{student.graduacao || '—'}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 10px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.6rem', opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Núcleo</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{student.nucleo || 'ACCBM'}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {([
                { tab: 'carteirinha'    as Tab, icon: '🪪', label: 'Carteirinha',  color: '#eff6ff', iconBg: '#dbeafe', textColor: '#1e40af' },
                { tab: 'presenca'       as Tab, icon: '📍', label: 'Presença',     color: '#f0fdf4', iconBg: '#dcfce7', textColor: '#15803d' },
                { tab: 'financeiro'     as Tab, icon: '💰', label: 'Financeiro',   color: '#fef9c3', iconBg: '#fef08a', textColor: '#854d0e' },
                { tab: 'graduacao'      as Tab, icon: '🎖️', label: 'Graduação',    color: '#faf5ff', iconBg: '#e9d5ff', textColor: '#7e22ce' },
                { tab: 'fotos'          as Tab, icon: '📸', label: 'Fotos',        color: '#fdf2f8', iconBg: '#f5d0fe', textColor: '#86198f' },
                { tab: 'justificativas' as Tab, icon: '📝', label: 'Justificativas', color: '#fff7ed', iconBg: '#fed7aa', textColor: '#9a3412' },
              ] as { tab: Tab; icon: string; label: string; color: string; iconBg: string; textColor: string }[]).map(item => (
                <button key={item.tab} onClick={() => setActiveTab(item.tab)}
                  style={{ background: item.color, borderRadius: 12, padding: '12px 8px', border: 'none', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', margin: '0 auto 6px' }}>{item.icon}</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: item.textColor }}>{item.label}</div>
                </button>
              ))}
            </div>

            {student && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 10 }}>Dados do Aluno</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'CPF', value: student.cpf },
                    { label: 'Telefone', value: student.telefone },
                    { label: 'E-mail', value: student.email as string },
                    { label: 'Data Nasc.', value: student.data_nascimento ? new Date(student.data_nascimento + 'T12:00').toLocaleDateString('pt-BR') : undefined },
                    { label: 'Endereço', value: student.endereco ? `${student.endereco}${student.numero ? ', '+student.numero : ''} — ${student.bairro || ''}, ${student.cidade || ''}/${student.estado || ''}` : undefined },
                  ].map(({ label, value }) => value ? (
                    <div key={label} style={{ gridColumn: label === 'Endereço' ? '1 / -1' : undefined }}>
                      <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: label === 'Endereço' ? 'normal' : 'nowrap' }}>{String(value)}</div>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ACCBM</div>
              {([
                { href: '/hierarquia', icon: '🥋', label: 'Hierarquia', color: '#fef2f2', textColor: '#991b1b' },
                { href: '/organograma', icon: '🏛️', label: 'Organograma', color: '#eff6ff', textColor: '#1e40af' },
                { href: '/documentos', icon: '📚', label: 'Documentos Históricos', color: '#f0fdf4', textColor: '#166534' },
              ]).map(item => (
                <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: item.color, borderRadius: 10, padding: '10px 12px', textDecoration: 'none' }}>
                  <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: item.textColor, flex: 1 }}>{item.label}</span>
                  <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>↗</span>
                </a>
              ))}
            </div>

            <DocumentsBar readOnly studentPhone={student.telefone} studentName={student.nome_completo} />
          </div>
        )}

        {/* ── CARTEIRINHA ── */}
        {activeTab === 'carteirinha' && cartData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>🪪 Carteirinha</h2>
            <div ref={carteirinhaRef} style={{ display: 'flex', justifyContent: 'center' }}>
              <Carteirinha data={cartData} />
            </div>
            <button onClick={() => {
              const printArea = carteirinhaRef.current;
              if (!printArea) return;
              const w = window.open('', '_blank', 'width=600,height=450');
              if (!w) return;
              w.document.write(`<html><head><title>Carteirinha ACCBM — ${cartData.nome}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9}</style></head><body>${printArea.innerHTML}</body></html>`);
              w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
            }} style={{ padding: '10px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>
        )}

        {/* ── PRESENÇA ── */}
        {activeTab === 'presenca' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>📍 Registrar Presença</h2>
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📍</div>
              <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 700 }}>Presença de hoje</h3>
              <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5 }}>
                O registro será feito com a localização GPS do dispositivo.<br />
                O aluno precisa estar a até 200m do local de treino.
              </p>
              <div style={{ textAlign: 'left', marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>📍 Local de Treino</label>
                <select value={presencaLocalSelecionado} onChange={e => setPresencaLocalSelecionado(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="">— Selecione o local —</option>
                  <option value="Poliesportivo Edson Alves">Poliesportivo Edson Alves — Magé</option>
                  <option value="Poliesportivo do Ipiranga">Poliesportivo do Ipiranga — Magé</option>
                  <option value="Saracuruna">CIEP 318 — Saracuruna</option>
                  <option value="Vila Urussaí">Núcleo Vila Urussaí</option>
                  <option value="Jayme Fichman">Núcleo Jayme Fichman</option>
                  <option value="Academia Mais Saúde">Academia Mais Saúde</option>
                </select>
              </div>
              {presencaMsg && (
                <div style={{ background: presencaStatus === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${presencaStatus === 'success' ? '#bbf7d0' : '#fecaca'}`, color: presencaStatus === 'success' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.83rem' }}>
                  {presencaMsg}
                </div>
              )}
              <button
                onClick={() => {
                  if (!navigator.geolocation) { setPresencaMsg('Geolocalização não disponível.'); setPresencaStatus('error'); return; }
                  setPresencaLoading(true); setPresencaMsg(''); setPresencaStatus('idle');
                  navigator.geolocation.getCurrentPosition(async (pos) => {
                    try {
                      const res = await fetch('/api/checkins', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ student: { id: studentId, nome_completo: student.nome_completo, graduacao: student.graduacao || '', nucleo: presencaLocalSelecionado || student.nucleo || '', local_treino: presencaLocalSelecionado || student.nucleo || '', foto_url: student.foto_url || null, telefone: student.telefone || '', lat: pos.coords.latitude, lng: pos.coords.longitude } }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setPresencaMsg(data.error || 'Erro ao registrar.'); setPresencaStatus('error'); }
                      else if (data.alreadyRegistered) { setPresencaMsg('Presença já registrada hoje!'); setPresencaStatus('success'); }
                      else { setPresencaMsg('✅ Presença registrada com sucesso!'); setPresencaStatus('success'); }
                    } catch { setPresencaMsg('Erro de conexão.'); setPresencaStatus('error'); }
                    setPresencaLoading(false);
                  }, () => { setPresencaMsg('Permissão de localização negada.'); setPresencaStatus('error'); setPresencaLoading(false); });
                }}
                disabled={presencaLoading}
                style={{ background: presencaLoading ? '#9ca3af' : `linear-gradient(135deg, ${nucleoColor}, ${nucleoColor}cc)`, color: '#fff', border: 'none', borderRadius: 12, padding: '14px 28px', fontWeight: 800, fontSize: '0.95rem', cursor: presencaLoading ? 'not-allowed' : 'pointer', boxShadow: `0 4px 14px ${nucleoColor}40` }}>
                {presencaLoading ? '📍 Obtendo localização...' : '📍 Registrar Presença Agora'}
              </button>
            </div>
          </div>
        )}

        {/* ── FINANCEIRO ── */}
        {activeTab === 'financeiro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>💰 Ficha Financeira</h2>
            <div style={{ background: '#fff', borderRadius: 14, padding: '20px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>💰</div>
              <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 700 }}>Portal Financeiro</h3>
              <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#6b7280' }}>Mensalidades, batizado, uniformes e pagamentos.</p>
              <a href={`/financeiro?student_id=${studentId}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', textDecoration: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: '0.9rem' }}>
                💰 Abrir Ficha Financeira ↗
              </a>
            </div>
          </div>
        )}

        {/* ── GRADUAÇÃO ── */}
        {activeTab === 'graduacao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>🎖️ Histórico de Graduação</h2>
              <button onClick={() => loadHistorico(studentId)} style={{ background: 'none', border: `1px solid ${nucleoColor}`, color: nucleoColor, borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>🔄</button>
            </div>
            {student.graduacao && (() => {
              const c = getGradColor(student.graduacao as string);
              return (
                <div style={{ background: c.bg, border: `2px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>🎖️</div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: c.text, opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Graduação Atual</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: c.text }}>{student.graduacao}</div>
                    {student.tipo_graduacao && <div style={{ fontSize: '0.75rem', color: c.text, opacity: 0.7 }}>Tipo: {student.tipo_graduacao}</div>}
                  </div>
                </div>
              );
            })()}
            {loadingHistorico ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '0.85rem' }}>Carregando...</div>
            ) : historico.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151' }}>Nenhum registro encontrado</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historico.map((reg, idx) => {
                  const c = getGradColor(reg.graduacao_recebida);
                  return (
                    <div key={reg.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e5e7eb', display: 'flex', gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.bg, border: `2px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>{idx === 0 ? '⭐' : '🎖️'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, borderRadius: 6, padding: '2px 8px', fontSize: '0.78rem', fontWeight: 700 }}>{reg.graduacao_recebida}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: nucleoColor }}>{new Date(reg.data_graduacao + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', marginTop: 4 }}>{reg.evento}</div>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Prof. {reg.professor_responsavel}</div>
                        {reg.observacoes && <div style={{ marginTop: 4, fontSize: '0.73rem', color: '#6b7280', fontStyle: 'italic' }}>&ldquo;{reg.observacoes}&rdquo;</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── JUSTIFICATIVAS ── */}
        {activeTab === 'justificativas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>📝 Justificativas de Falta</h2>
            <div style={{ background: '#fff', borderRadius: 14, padding: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>Enviar justificativa</div>
              {justMsg && <div style={{ background: justMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${justMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: justMsgType === 'success' ? '#166534' : '#991b1b', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '0.8rem' }}>{justMsg}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="date" value={justForm.data_falta} onChange={e => setJustForm(p => ({ ...p, data_falta: e.target.value }))}
                  max={new Date().toISOString().split('T')[0]} min={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  style={{ border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                <textarea value={justForm.motivo} onChange={e => setJustForm(p => ({ ...p, motivo: e.target.value }))}
                  rows={3} placeholder="Motivo da falta..." maxLength={500}
                  style={{ border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', resize: 'none', width: '100%' }} />
                <button disabled={justLoading} onClick={async () => {
                  setJustLoading(true); setJustMsg('');
                  const res = await fetch('/api/aluno/justificativas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', student_id: studentId, ...justForm }) });
                  const data = await res.json();
                  if (res.ok) { setJustMsg('Justificativa enviada!'); setJustMsgType('success'); setJustForm({ data_falta: '', motivo: '' }); loadJustificativas(studentId); }
                  else { setJustMsg(data.error || 'Erro.'); setJustMsgType('error'); }
                  setJustLoading(false);
                }} style={{ background: nucleoColor, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: justLoading ? 0.7 : 1 }}>
                  {justLoading ? 'Enviando...' : 'Enviar Justificativa'}
                </button>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, padding: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>Justificativas enviadas</div>
              {justificativas.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px', fontSize: '0.82rem' }}>Nenhuma justificativa ainda.</div>
              ) : justificativas.map(j => (
                <div key={j.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{new Date(j.data_falta + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{j.motivo}</div>
                    {j.resposta_mestre && <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#1e40af' }}>💬 {j.resposta_mestre}</div>}
                  </div>
                  <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: j.status === 'aprovado' ? '#dcfce7' : j.status === 'recusado' ? '#fee2e2' : '#fef9c3', color: j.status === 'aprovado' ? '#166534' : j.status === 'recusado' ? '#991b1b' : '#854d0e' }}>
                    {j.status === 'aprovado' ? '✅ Aprovada' : j.status === 'recusado' ? '❌ Recusada' : '⏳ Pendente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FOTOS ── */}
        {activeTab === 'fotos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>📸 Fotos e Vídeos</h2>
              <button onClick={() => fotosFileRef.current?.click()} disabled={fotosUploading}
                style={{ background: '#86198f', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', opacity: fotosUploading ? 0.7 : 1 }}>
                {fotosUploading ? '⏳ Enviando...' : '⬆ Enviar'}
              </button>
              <input ref={fotosFileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setFotosUploading(true); setFotosMsg('');
                const fd = new FormData(); fd.append('file', file); fd.append('student_id', studentId);
                const res = await fetch('/api/aluno/media', { method: 'POST', body: fd });
                const json = await res.json();
                if (res.ok) { setFotosMsg('✓ Enviado!'); loadFotos(studentId); } else setFotosMsg('Erro: ' + (json.error || 'falha'));
                setFotosUploading(false); e.target.value = '';
              }} />
            </div>
            {fotosMsg && <div style={{ padding: '8px 12px', background: fotosMsg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', borderRadius: 8, fontSize: '0.8rem', color: fotosMsg.startsWith('✓') ? '#166534' : '#991b1b', fontWeight: 600 }}>{fotosMsg}</div>}
            {fotosLoading ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '0.85rem' }}>Carregando...</div>
            ) : fotosMedia.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', background: '#fdf2f8', borderRadius: 14, border: '2px dashed #f0abfc' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📷</div>
                <div style={{ fontWeight: 700, color: '#86198f', fontSize: '0.88rem' }}>Nenhum arquivo ainda</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {fotosMedia.map(m => (
                  <div key={m.name} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    {m.type === 'foto' ? (
                      <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={m.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} /></a>
                    ) : (
                      <a href={m.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', background: '#1f2937', textDecoration: 'none' }}>
                        <span style={{ fontSize: '2rem' }}>🎬</span>
                      </a>
                    )}
                    <div style={{ padding: '6px 8px', display: 'flex', gap: 4 }}>
                      <a href={m.url} download target="_blank" rel="noreferrer" style={{ flex: 1, background: '#eff6ff', color: '#1e40af', borderRadius: 5, padding: '3px 6px', fontSize: '0.65rem', fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>⬇</a>
                      <button onClick={async () => {
                        if (!confirm('Excluir?')) return;
                        const res = await fetch('/api/aluno/media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, name: m.name }) });
                        if (res.ok) setFotosMedia(prev => prev.filter(f => f.name !== m.name));
                      }} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 700 }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PLAYLIST ── */}
        {activeTab === 'playlist' && (() => {
          const platformMeta: Record<string, { icon: string; color: string; label: string }> = {
            youtube: { icon: '▶', color: '#dc2626', label: 'YouTube' },
            spotify: { icon: '🎧', color: '#16a34a', label: 'Spotify' },
            deezer:  { icon: '🎵', color: '#7c3aed', label: 'Deezer' },
            tiktok:  { icon: '🎶', color: '#0891b2', label: 'TikTok' },
            kwai:    { icon: '📱', color: '#ea580c', label: 'Kwai' },
            link:    { icon: '🔗', color: '#64748b', label: 'Link' },
          };
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>🎵 Playlist do Aluno</h2>
              <div style={{ background: '#fff', borderRadius: 14, padding: '14px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>➕ Adicionar link</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="url" value={playlistAddUrl} onChange={e => setPlaylistAddUrl(e.target.value)} placeholder="Cole o link (Spotify, YouTube, TikTok...)"
                    style={{ border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                  <input type="text" value={playlistAddTitle} onChange={e => setPlaylistAddTitle(e.target.value)} placeholder="Título (opcional)"
                    style={{ border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                  {playlistMsg && <div style={{ padding: '7px 10px', borderRadius: 7, background: playlistMsgType === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${playlistMsgType === 'success' ? '#bbf7d0' : '#fecaca'}`, color: playlistMsgType === 'success' ? '#166534' : '#991b1b', fontSize: '0.78rem' }}>{playlistMsg}</div>}
                  <button onClick={async () => {
                    if (!playlistAddUrl.trim()) return;
                    setPlaylistAdding(true); setPlaylistMsg('');
                    const res = await fetch('/api/aluno/playlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, url: playlistAddUrl.trim(), title: playlistAddTitle.trim() || undefined }) });
                    const data = await res.json();
                    if (res.ok) { setPlaylistItems(prev => [data.item, ...prev]); setPlaylistAddUrl(''); setPlaylistAddTitle(''); setPlaylistMsg('✅ Adicionado!'); setPlaylistMsgType('success'); }
                    else { setPlaylistMsg(data.error || 'Erro.'); setPlaylistMsgType('error'); }
                    setPlaylistAdding(false);
                  }} disabled={playlistAdding || !playlistAddUrl.trim()}
                    style={{ background: playlistAdding || !playlistAddUrl.trim() ? '#9ca3af' : nucleoColor, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                    {playlistAdding ? '⏳ Adicionando...' : '➕ Adicionar'}
                  </button>
                </div>
              </div>
              {playlistLoading ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '28px', fontSize: '0.85rem' }}>Carregando...</div>
              ) : playlistItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', background: '#f5f3ff', borderRadius: 14, border: '2px dashed #a78bfa' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎵</div>
                  <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.88rem' }}>Playlist vazia</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {playlistItems.map(item => {
                    const meta = platformMeta[item.platform] || platformMeta.link;
                    const isEditing = playlistEditId === item.id;
                    return (
                      <div key={item.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                        {isEditing ? (
                          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <input type="text" value={playlistEditTitle} onChange={e => setPlaylistEditTitle(e.target.value)} placeholder="Título" style={{ border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: '0.83rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                            <input type="url" value={playlistEditUrl} onChange={e => setPlaylistEditUrl(e.target.value)} placeholder="URL" style={{ border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: '0.83rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={async () => {
                                const res = await fetch('/api/aluno/playlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, id: item.id, title: playlistEditTitle.trim() || undefined, url: playlistEditUrl.trim() || undefined }) });
                                const data = await res.json();
                                if (res.ok) { setPlaylistItems(prev => prev.map(i => i.id === item.id ? data.item : i)); setPlaylistEditId(null); }
                              }} style={{ flex: 1, background: nucleoColor, color: '#fff', border: 'none', borderRadius: 7, padding: '7px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Salvar</button>
                              <button onClick={() => setPlaylistEditId(null)} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 7, padding: '7px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                            <span style={{ background: meta.color, color: '#fff', borderRadius: 7, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0, fontWeight: 800 }}>{meta.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                              <div style={{ fontSize: '0.65rem', color: meta.color, fontWeight: 600 }}>{meta.label}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ padding: '4px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e5e7eb', color: '#374151', fontSize: '0.65rem', fontWeight: 700, textDecoration: 'none' }}>↗</a>
                              <button onClick={() => { setPlaylistEditId(item.id); setPlaylistEditTitle(item.title); setPlaylistEditUrl(item.url); }} style={{ padding: '4px 7px', borderRadius: 6, background: '#eff6ff', border: 'none', color: '#1d4ed8', fontSize: '0.65rem', cursor: 'pointer' }}>✏️</button>
                              <button onClick={async () => { if (!confirm('Remover?')) return; const res = await fetch('/api/aluno/playlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, id: item.id }) }); if (res.ok) setPlaylistItems(prev => prev.filter(i => i.id !== item.id)); }} style={{ padding: '4px 7px', borderRadius: 6, background: '#fef2f2', border: 'none', color: '#dc2626', fontSize: '0.65rem', cursor: 'pointer' }}>🗑</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── EVOLUÇÃO ── */}
        {activeTab === 'evolucao' && (() => {
          const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          const todayStr = today.toISOString().split('T')[0];
          const byMonth: Record<string, number> = {};
          for (const d of evolucaoDates) { const ym = d.slice(0, 7); byMonth[ym] = (byMonth[ym] || 0) + 1; }
          const months6: { key: string; label: string; count: number }[] = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months6.push({ key, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), count: byMonth[key] || 0 });
          }
          const maxCount = Math.max(...months6.map(m => m.count), 1);
          const last30 = new Set<string>();
          const last30Arr: string[] = [];
          for (let i = 29; i >= 0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            const s = d.toISOString().split('T')[0];
            last30Arr.push(s);
            if (evolucaoDates.includes(s)) last30.add(s);
          }
          const totalDays = evolucaoDates.length;
          const thisMonthKey = todayStr.slice(0, 7);
          const thisMonthCount = byMonth[thisMonthKey] || 0;
          const lastMonthKey = (() => { const d = new Date(today.getFullYear(), today.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
          const lastMonthCount = byMonth[lastMonthKey] || 0;
          let streak = 0;
          for (let i = 0; i < 365; i++) { const d = new Date(today); d.setDate(d.getDate() - i); const s = d.toISOString().split('T')[0]; if (evolucaoDates.includes(s)) streak++; else if (i > 0) break; }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>📊 Dashboard de Evolução</h2>
              {evolucaoLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '0.85rem' }}>Carregando...</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Total treinos', value: totalDays, icon: '🥋', color: nucleoColor, bg: `${nucleoColor}15`, border: `${nucleoColor}30` },
                      { label: 'Este mês', value: thisMonthCount, icon: '📅', color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff' },
                      { label: 'Mês passado', value: lastMonthCount, icon: '📆', color: '#0891b2', bg: '#f0f9ff', border: '#bae6fd' },
                      { label: 'Sequência', value: `${streak}d`, icon: '🔥', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: '1.4rem' }}>{s.icon}</div>
                        <div><div style={{ fontSize: '1.3rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div><div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 1 }}>{s.label}</div></div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>Frequência Mensal</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                      {months6.map(m => {
                        const hPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
                        const isCurrent = m.key === thisMonthKey;
                        return (
                          <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: isCurrent ? nucleoColor : '#6b7280' }}>{m.count}</div>
                            <div style={{ width: '100%', borderRadius: '5px 5px 0 0', background: isCurrent ? nucleoColor : `${nucleoColor}55`, minHeight: 3, height: `${Math.max(hPct, 3)}%` }} />
                            <div style={{ fontSize: '0.55rem', color: isCurrent ? nucleoColor : '#9ca3af', fontWeight: isCurrent ? 700 : 400, whiteSpace: 'nowrap' }}>{m.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>Últimos 30 Dias</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
                      {last30Arr.map(d => {
                        const present = last30.has(d);
                        const isToday = d === todayStr;
                        return (
                          <div key={d} title={new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            style={{ aspectRatio: '1', borderRadius: 5, background: present ? nucleoColor : '#f3f4f6', border: isToday ? `2px solid ${nucleoColor}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color: present ? '#fff' : '#d1d5db', fontWeight: 700 }}>
                            {new Date(d + 'T12:00:00').getDate()}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {evolucaoDates.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>Histórico de Presenças</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {([...evolucaoEntries].length > 0
                          ? [...evolucaoEntries].reverse()
                          : [...evolucaoDates].reverse().map(d => ({ date: d, nucleo: null, local_nome: null, hora: null }))
                        ).slice(0, 10).map(entry => {
                          const localLabel = entry.local_nome || entry.nucleo || null;
                          return (
                            <div key={entry.date} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, borderLeft: `3px solid ${nucleoColor}` }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: nucleoColor, flexShrink: 0, marginTop: 5 }} />
                              <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize' }}>
                                  {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                </div>
                                {localLabel && <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 1 }}>📍 Núcleo: <strong style={{ color: '#374151' }}>{localLabel}</strong></div>}
                                {entry.hora && <div style={{ fontSize: '0.67rem', color: '#9ca3af', marginTop: 1 }}>🕐 {entry.hora}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {evolucaoDates.length > 10 && <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.72rem', color: '#9ca3af' }}>e mais {evolucaoDates.length - 10} anteriores</div>}
                    </div>
                  )}

                  {evolucaoDates.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px', background: '#f9fafb', borderRadius: 14, border: '2px dashed #e5e7eb' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🥋</div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151' }}>Nenhuma presença registrada</div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* ── CONTA ── */}
        {activeTab === 'conta' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>⚙️ Dados da Conta</h2>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '14px 16px', fontSize: '0.82rem', color: '#0369a1', lineHeight: 1.6 }}>
              ℹ️ Para alterar credenciais de acesso do aluno, utilize a aba <strong>Contas Alunos</strong> no painel administrativo.
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>Informações cadastradas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Nome completo', value: student.nome_completo },
                  { label: 'E-mail', value: student.email as string || 'Não cadastrado' },
                  { label: 'Telefone', value: student.telefone || 'Não cadastrado' },
                  { label: 'Núcleo', value: student.nucleo || 'ACCBM' },
                  { label: 'Graduação', value: student.graduacao || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
