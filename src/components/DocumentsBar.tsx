'use client';

import { useState, useRef } from 'react';

// ─── Storage keys for uploaded files & info text ─────────────────────────────
const ESTATUTO_KEY   = 'accbm_estatuto_file';
const REGIMENTO_KEY  = 'accbm_regimento_file';
const INFO_TEXT_KEY  = 'accbm_info_geral_text';

interface DocumentsBarProps {
  /** Pass the student's phone (digits only) for the WhatsApp send action */
  studentPhone?: string;
  studentName?: string;
  /** 'admin' shows upload controls; 'public' shows download-only */
  mode?: 'admin' | 'public';
}

export default function DocumentsBar({ studentPhone, studentName, mode = 'public' }: DocumentsBarProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [infoText, setInfoText]  = useState(() => {
    try { return localStorage.getItem(INFO_TEXT_KEY) || ''; } catch { return ''; }
  });
  const [infoEditing, setInfoEditing] = useState(false);
  const [infoDraft, setInfoDraft]     = useState(infoText);
  const [estatutoName, setEstatutoName] = useState<string | null>(() => {
    try { const d = localStorage.getItem(ESTATUTO_KEY); return d ? JSON.parse(d).name : null; } catch { return null; }
  });
  const [regimentoName, setRegimentoName] = useState<string | null>(() => {
    try { const d = localStorage.getItem(REGIMENTO_KEY); return d ? JSON.parse(d).name : null; } catch { return null; }
  });

  const estatutoRef  = useRef<HTMLInputElement>(null);
  const regimentoRef = useRef<HTMLInputElement>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const saveFileToStorage = (key: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        localStorage.setItem(key, JSON.stringify({ name: file.name, data: reader.result as string }));
      } catch { alert('Arquivo muito grande para armazenar localmente. Use arquivos menores.'); }
    };
    reader.readAsDataURL(file);
  };

  const downloadFromStorage = (key: string, fallbackName: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { alert('Nenhum arquivo cadastrado ainda. Acesse o Painel Administrativo para fazer o upload.'); return; }
      const { name, data } = JSON.parse(raw);
      const a = document.createElement('a');
      a.href = data;
      a.download = name || fallbackName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch { alert('Erro ao fazer download.'); }
  };

  const sendInfoWhatsApp = () => {
    const phone = (studentPhone || '').replace(/\D/g, '');
    const br = phone.startsWith('55') ? phone : `55${phone}`;
    const dest = phone.length >= 10 ? br : '';
    const msg = encodeURIComponent(
      `ℹ️ *Informações — Capoeira Barão de Mauá*\n\n${infoText}\n\n_Associação Cultural de Capoeira Barão de Mauá_`
    );
    window.open(`https://wa.me/${dest}?text=${msg}`, '_blank');
  };

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '10px 16px', borderRadius: 10,
    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
    border: 'none', textDecoration: 'none', transition: 'opacity .15s',
  };

  return (
    <div style={{ margin: '20px 0' }}>
      {/* Three buttons row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

        {/* ── Estatuto Social ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
          <button
            onClick={() => downloadFromStorage(ESTATUTO_KEY, 'Estatuto-Social-ACCBM.pdf')}
            style={{ ...btnBase, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', justifyContent: 'center', width: '100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Estatuto Social
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 2 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          {mode === 'admin' && (
            <button onClick={() => estatutoRef.current?.click()}
              style={{ background: 'rgba(220,38,38,0.08)', border: '1px dashed rgba(220,38,38,0.4)', color: '#dc2626', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {estatutoName ? `✓ ${estatutoName.slice(0, 20)}…` : 'Upload do arquivo'}
            </button>
          )}
          <input ref={estatutoRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              setEstatutoName(f.name);
              saveFileToStorage(ESTATUTO_KEY, f);
            }} />
        </div>

        {/* ── Regimento Interno ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
          <button
            onClick={() => downloadFromStorage(REGIMENTO_KEY, 'Regimento-Interno-ACCBM.pdf')}
            style={{ ...btnBase, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', justifyContent: 'center', width: '100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            Regimento Interno
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 2 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          {mode === 'admin' && (
            <button onClick={() => regimentoRef.current?.click()}
              style={{ background: 'rgba(29,78,216,0.08)', border: '1px dashed rgba(29,78,216,0.4)', color: '#1d4ed8', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {regimentoName ? `✓ ${regimentoName.slice(0, 20)}…` : 'Upload do arquivo'}
            </button>
          )}
          <input ref={regimentoRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              setRegimentoName(f.name);
              saveFileToStorage(REGIMENTO_KEY, f);
            }} />
        </div>

        {/* ── Informações Gerais ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
          <button
            onClick={() => { setInfoDraft(infoText); setShowInfo(v => !v); }}
            style={{ ...btnBase, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', justifyContent: 'center', width: '100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Informações Gerais
          </button>
        </div>
      </div>

      {/* ── Info panel (expandable) ────────────────────────────────────────── */}
      {showInfo && (
        <div style={{ marginTop: 12, background: 'var(--bg-card)', border: '1.5px solid rgba(22,163,74,0.35)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(90deg,#16a34a,#15803d)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem' }}>ℹ️ Informações Gerais — ACCBM</span>
            <button onClick={() => setShowInfo(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
          </div>

          <div style={{ padding: '14px 16px' }}>
            {mode === 'admin' || infoEditing ? (
              <>
                <textarea
                  value={infoDraft}
                  onChange={e => setInfoDraft(e.target.value)}
                  placeholder="Digite aqui as informações gerais que deseja compartilhar com os alunos (horários de treino, avisos, eventos, taxas, etc.)..."
                  rows={7}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.88rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => {
                    setInfoText(infoDraft);
                    try { localStorage.setItem(INFO_TEXT_KEY, infoDraft); } catch {}
                    setInfoEditing(false);
                  }}
                    style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                    ✓ Salvar Informação
                  </button>
                  <button onClick={() => sendInfoWhatsApp()}
                    disabled={!infoDraft.trim()}
                    style={{ flex: 1, padding: '10px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 8, cursor: infoDraft.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.88rem', opacity: infoDraft.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    {studentPhone ? `Enviar p/ ${studentName || 'aluno'}` : 'Enviar via WhatsApp'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {infoText ? (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                    {infoText}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
                    Nenhuma informação cadastrada ainda.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setInfoDraft(infoText); setInfoEditing(true); }}
                    style={{ flex: 1, padding: '9px', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.4)', color: '#16a34a', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                    ✏️ Editar
                  </button>
                  {infoText && (
                    <button onClick={() => sendInfoWhatsApp()}
                      style={{ flex: 2, padding: '9px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      {studentPhone ? `Enviar p/ ${studentName || 'aluno'}` : 'Enviar via WhatsApp'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
