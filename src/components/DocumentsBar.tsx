'use client';

import { useState, useRef, useEffect } from 'react';
import {
  saveDocFile, getDocFile, downloadDocFile,
  cacheFileName, getCachedFileName,
} from '@/lib/docStorage';

// ── Storage keys ─────────────────────────────────────────────────────────────
const KEY_ESTATUTO  = 'accbm_estatuto';
const KEY_REGIMENTO = 'accbm_regimento';
const INFO_KEY = (nucleo: NucleoTab) => `accbm_info_${nucleo}`;

type NucleoTab = 'geral' | 'maua' | 'saracuruna';
const NUCLEO_LABELS: Record<NucleoTab, string> = {
  geral:       '🌐 Geral',
  maua:        '🔴 Mauá',
  saracuruna:  '🟢 Saracuruna',
};
const NUCLEO_COLORS: Record<NucleoTab, string> = {
  geral:       '#1d4ed8',
  maua:        '#dc2626',
  saracuruna:  '#16a34a',
};

export interface SimpleStudent {
  id: string;
  nome_completo: string;
  telefone: string;
  nucleo: string | null;
  email?: string;
}

interface DocumentsBarProps {
  /** List of students — used for bulk WhatsApp send */
  students?: SimpleStudent[];
  /** Pre-selected student for single-student context (e.g. detail modal) */
  studentPhone?: string;
  studentName?: string;
}

// ── Format file size ──────────────────────────────────────────────────────────
function fmtSize(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ── WhatsApp icon ─────────────────────────────────────────────────────────────
const WAIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function DocumentsBar({ students = [], studentPhone, studentName }: DocumentsBarProps) {
  // ── File names (from cache for fast render) ───────────────────────────────
  const [estatutoName,  setEstatutoName]  = useState<string | null>(() => getCachedFileName(KEY_ESTATUTO));
  const [regimentoName, setRegimentoName] = useState<string | null>(() => getCachedFileName(KEY_REGIMENTO));
  const [estatutoSize,  setEstatutoSize]  = useState<number | null>(null);
  const [regimentoSize, setRegimentoSize] = useState<number | null>(null);
  const [uploading,     setUploading]     = useState<'estatuto' | 'regimento' | null>(null);
  const [uploadError,   setUploadError]   = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<'estatuto' | 'regimento' | null>(null);

  // ── Info panel state ──────────────────────────────────────────────────────
  const [showInfo,     setShowInfo]     = useState(false);
  const [infoTab,      setInfoTab]      = useState<NucleoTab>('geral');
  const [infoTexts,    setInfoTexts]    = useState<Record<NucleoTab, string>>({
    geral: '', maua: '', saracuruna: '',
  });
  const [infoDraft,    setInfoDraft]    = useState('');
  const [infoEditing,  setInfoEditing]  = useState(false);
  const [sendModal,    setSendModal]    = useState<{ tab: NucleoTab; text: string } | null>(null);
  const [sentSet,      setSentSet]      = useState<Set<string>>(new Set());

  const estatutoRef  = useRef<HTMLInputElement>(null);
  const regimentoRef = useRef<HTMLInputElement>(null);

  // Load file sizes from IndexedDB on mount
  useEffect(() => {
    getDocFile(KEY_ESTATUTO).then(f => {
      if (f) { setEstatutoName(f.name); setEstatutoSize(f.size); cacheFileName(KEY_ESTATUTO, f.name); }
    }).catch(() => {});
    getDocFile(KEY_REGIMENTO).then(f => {
      if (f) { setRegimentoName(f.name); setRegimentoSize(f.size); cacheFileName(KEY_REGIMENTO, f.name); }
    }).catch(() => {});
    // Load saved info texts
    const loaded: Record<NucleoTab, string> = { geral: '', maua: '', saracuruna: '' };
    (['geral', 'maua', 'saracuruna'] as NucleoTab[]).forEach(n => {
      try { loaded[n] = localStorage.getItem(INFO_KEY(n)) || ''; } catch {}
    });
    setInfoTexts(loaded);
  }, []);

  // ── File upload handler ───────────────────────────────────────────────────
  const handleUpload = async (key: string, file: File, setName: (s: string) => void, setSize: (n: number) => void, which: 'estatuto' | 'regimento') => {
    setUploading(which);
    setUploadError(null);
    try {
      await saveDocFile(key, file);
      setName(file.name);
      setSize(file.size);
      cacheFileName(key, file.name);
      setUploadSuccess(which);
      setTimeout(() => setUploadSuccess(null), 3000);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Erro ao salvar arquivo.');
    }
    setUploading(null);
  };

  // ── File download handler ─────────────────────────────────────────────────
  const handleDownload = async (key: string, fallback: string) => {
    try {
      const f = await getDocFile(key);
      if (!f) { alert('Nenhum arquivo carregado ainda.\nClique em "⬆ Inserir arquivo" para fazer o upload.'); return; }
      downloadDocFile(f);
    } catch { alert('Erro ao fazer download.'); }
  };

  // ── Save info text for a núcleo ───────────────────────────────────────────
  const saveInfo = (tab: NucleoTab, text: string) => {
    setInfoTexts(prev => ({ ...prev, [tab]: text }));
    try { localStorage.setItem(INFO_KEY(tab), text); } catch {}
    setInfoEditing(false);
  };

  // ── Filter students for sending ───────────────────────────────────────────
  const studentsForTab = (tab: NucleoTab): SimpleStudent[] => {
    if (!students.length) return studentPhone ? [{ id: 'single', nome_completo: studentName || 'Aluno', telefone: studentPhone, nucleo: null }] : [];
    if (tab === 'geral') return students.filter(s => s.telefone);
    const label = tab === 'maua' ? 'Mauá' : 'Saracuruna';
    return students.filter(s => s.nucleo === label && s.telefone);
  };

  const buildWALink = (phone: string, text: string) => {
    const p = phone.replace(/\D/g, '');
    const br = p.startsWith('55') ? p : `55${p}`;
    const msg = encodeURIComponent(`ℹ️ *Informações — Capoeira Barão de Mauá*\n\n${text}\n\n_Associação Cultural de Capoeira Barão de Mauá_`);
    return `https://wa.me/${br}?text=${msg}`;
  };

  // ── Shared button style ───────────────────────────────────────────────────
  const docBtn = (color: string, hasFile: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700,
    fontSize: '0.82rem', border: 'none', width: '100%',
    background: hasFile ? `linear-gradient(135deg,${color},${color}cc)` : `linear-gradient(135deg,${color}88,${color}66)`,
    color: '#fff',
    boxShadow: hasFile ? `0 3px 12px ${color}44` : 'none',
    transition: 'all .15s',
  });

  const uploadBtn = (color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    background: `${color}11`, border: `1.5px dashed ${color}66`,
    color: color, padding: '5px 8px', borderRadius: 8,
    cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, width: '100%',
  });

  const currentText = infoTexts[infoTab];
  const tabStudents = sendModal ? studentsForTab(sendModal.tab) : [];

  return (
    <div style={{ margin: '12px 0 18px' }}>

      {/* ── Upload error toast ────────────────────────────────────────────── */}
      {uploadError && (
        <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '0.82rem', color: '#dc2626', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          ⚠ {uploadError}
          <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

        {/* ── Estatuto Social ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 145, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => handleDownload(KEY_ESTATUTO, 'Estatuto-Social-ACCBM.pdf')} style={docBtn('#dc2626', !!estatutoName)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Estatuto Social
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button onClick={() => { setUploadError(null); estatutoRef.current?.click(); }} disabled={uploading === 'estatuto'} style={uploadBtn('#dc2626')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {uploading === 'estatuto' ? 'Salvando...' : uploadSuccess === 'estatuto' ? '✓ Salvo!' : estatutoName ? '✓ Substituir' : '⬆ Inserir arquivo'}
          </button>
          <input ref={estatutoRef} type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(KEY_ESTATUTO, f, setEstatutoName, setEstatutoSize, 'estatuto'); e.target.value = ''; }} />
          {estatutoName && (
            <div style={{ fontSize: '0.62rem', color: '#dc262688', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingInline: 2 }}>
              📄 {estatutoName}{estatutoSize ? ` · ${fmtSize(estatutoSize)}` : ''}<br/>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ até 50 MB disponível</span>
            </div>
          )}
          {!estatutoName && (
            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textAlign: 'center' }}>Suporte até 50 MB</div>
          )}
        </div>

        {/* ── Regimento Interno ────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 145, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => handleDownload(KEY_REGIMENTO, 'Regimento-Interno-ACCBM.pdf')} style={docBtn('#1d4ed8', !!regimentoName)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            Regimento Interno
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button onClick={() => { setUploadError(null); regimentoRef.current?.click(); }} disabled={uploading === 'regimento'} style={uploadBtn('#1d4ed8')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {uploading === 'regimento' ? 'Salvando...' : uploadSuccess === 'regimento' ? '✓ Salvo!' : regimentoName ? '✓ Substituir' : '⬆ Inserir arquivo'}
          </button>
          <input ref={regimentoRef} type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(KEY_REGIMENTO, f, setRegimentoName, setRegimentoSize, 'regimento'); e.target.value = ''; }} />
          {regimentoName && (
            <div style={{ fontSize: '0.62rem', color: '#1d4ed888', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingInline: 2 }}>
              📄 {regimentoName}{regimentoSize ? ` · ${fmtSize(regimentoSize)}` : ''}<br/>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ até 50 MB disponível</span>
            </div>
          )}
          {!regimentoName && (
            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textAlign: 'center' }}>Suporte até 50 MB</div>
          )}
        </div>

        {/* ── Informações Gerais ────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 145, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => { setInfoDraft(infoTexts[infoTab]); setInfoEditing(false); setShowInfo(v => !v); }}
            style={docBtn(showInfo ? '#15803d' : '#16a34a', Object.values(infoTexts).some(Boolean))}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Informações Gerais
          </button>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {Object.entries(infoTexts).filter(([,v]) => v).map(([k]) => NUCLEO_LABELS[k as NucleoTab]).join(' · ') || 'Clique para editar'}
          </div>
        </div>
      </div>

      {/* ── Info expandable panel ────────────────────────────────────────────── */}
      {showInfo && (
        <div style={{ marginTop: 10, background: 'var(--bg-card)', border: '1.5px solid rgba(22,163,74,0.35)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(90deg,#16a34a,#15803d)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem' }}>ℹ️ Informações Gerais — ACCBM</span>
            <button onClick={() => { setShowInfo(false); setInfoEditing(false); }}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>

          {/* Núcleo tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
            {(['geral', 'maua', 'saracuruna'] as NucleoTab[]).map(tab => (
              <button key={tab} onClick={() => { setInfoTab(tab); setInfoDraft(infoTexts[tab]); setInfoEditing(false); }}
                style={{
                  flex: 1, padding: '9px 8px', border: 'none', borderBottom: infoTab === tab ? `2.5px solid ${NUCLEO_COLORS[tab]}` : '2.5px solid transparent',
                  background: 'none', cursor: 'pointer', fontWeight: infoTab === tab ? 700 : 500,
                  fontSize: '0.8rem', color: infoTab === tab ? NUCLEO_COLORS[tab] : 'var(--text-secondary)',
                  transition: 'all .15s',
                }}>
                {NUCLEO_LABELS[tab]}
                {infoTexts[tab] && <span style={{ marginLeft: 4, width: 6, height: 6, borderRadius: '50%', background: NUCLEO_COLORS[tab], display: 'inline-block', verticalAlign: 'middle' }} />}
              </button>
            ))}
          </div>

          <div style={{ padding: '14px 16px' }}>
            {infoEditing ? (
              <>
                <textarea
                  value={infoDraft}
                  onChange={e => setInfoDraft(e.target.value)}
                  placeholder={`Digite as informações para ${NUCLEO_LABELS[infoTab]} (horários, avisos, eventos, mensalidades, etc.)...`}
                  rows={6}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.88rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.65 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => setInfoEditing(false)}
                    style={{ padding: '9px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                    Cancelar
                  </button>
                  <button onClick={() => saveInfo(infoTab, infoDraft)}
                    style={{ flex: 1, padding: '9px 14px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                    ✓ Salvar
                  </button>
                  {infoDraft.trim() && (
                    <button onClick={() => {
                      saveInfo(infoTab, infoDraft);
                      const list = studentsForTab(infoTab);
                      if (!list.length) {
                        // Single student or no list — direct send
                        if (studentPhone) {
                          window.open(buildWALink(studentPhone, infoDraft), '_blank');
                        } else {
                          alert('Nenhum aluno cadastrado neste núcleo.');
                        }
                        return;
                      }
                      setSendModal({ tab: infoTab, text: infoDraft });
                    }}
                      style={{ flex: 1, padding: '9px 14px', background: 'linear-gradient(135deg,#25d366,#128c7e)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <WAIcon />
                      Salvar e Enviar
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {currentText ? (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.75, whiteSpace: 'pre-wrap', marginBottom: 12, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    {currentText}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontStyle: 'italic', textAlign: 'center', padding: '14px 0' }}>
                    Nenhuma informação para {NUCLEO_LABELS[infoTab]}. Clique em Editar.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setInfoDraft(currentText); setInfoEditing(true); }}
                    style={{ padding: '9px 16px', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.35)', color: '#16a34a', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                    ✏️ Editar
                  </button>
                  {currentText && (
                    <button onClick={() => {
                      const list = studentsForTab(infoTab);
                      if (!list.length) {
                        if (studentPhone) window.open(buildWALink(studentPhone, currentText), '_blank');
                        else alert('Nenhum aluno cadastrado neste núcleo com telefone.');
                        return;
                      }
                      setSendModal({ tab: infoTab, text: currentText });
                    }}
                      style={{ flex: 1, padding: '9px 14px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <WAIcon />
                      {studentPhone ? `Enviar p/ ${studentName || 'aluno'}` : `Enviar para ${NUCLEO_LABELS[infoTab]}`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Send modal (bulk WhatsApp per núcleo) ────────────────────────────── */}
      {sendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ background: `linear-gradient(135deg,${NUCLEO_COLORS[sendModal.tab]},${NUCLEO_COLORS[sendModal.tab]}cc)`, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>
                  Enviar Informações — {NUCLEO_LABELS[sendModal.tab]}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', marginTop: 2 }}>
                  {tabStudents.length} aluno(s) com telefone cadastrado
                </div>
              </div>
              <button onClick={() => { setSendModal(null); setSentSet(new Set()); }}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>✕</button>
            </div>

            {/* Message preview */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-input)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Mensagem a enviar:</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 80, overflow: 'auto' }}>
                {sendModal.text.slice(0, 200)}{sendModal.text.length > 200 ? '...' : ''}
              </div>
            </div>

            {/* Students list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
              {tabStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  Nenhum aluno com telefone cadastrado neste núcleo.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tabStudents.map(s => {
                    const sent = sentSet.has(s.id);
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: sent ? 'rgba(22,163,74,0.07)' : 'var(--bg-input)', border: `1px solid ${sent ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`, borderRadius: 10, transition: 'all .15s' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome_completo}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{s.telefone}</div>
                        </div>
                        <a
                          href={buildWALink(s.telefone, sendModal.text)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setSentSet(prev => new Set([...prev, s.id]))}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '7px 12px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.78rem',
                            background: sent ? 'rgba(22,163,74,0.15)' : 'linear-gradient(135deg,#25d366,#128c7e)',
                            color: sent ? '#16a34a' : '#fff',
                            border: sent ? '1px solid rgba(22,163,74,0.4)' : 'none',
                            flexShrink: 0,
                          }}
                        >
                          <WAIcon size={13} />
                          {sent ? '✓ Enviado' : 'Enviar'}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                {sentSet.size > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {sentSet.size} de {tabStudents.length} enviados</span>}
              </div>
              <button onClick={() => { setSendModal(null); setSentSet(new Set()); }}
                style={{ padding: '9px 20px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
