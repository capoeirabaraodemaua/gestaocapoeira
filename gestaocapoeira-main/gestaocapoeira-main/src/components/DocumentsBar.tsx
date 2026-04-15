'use client';

import { useState, useRef, useEffect } from 'react';
import {
  saveDocFile, downloadDocFile, getDocMeta,
  cacheFileName, getCachedFileName,
} from '@/lib/docStorage';

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_ESTATUTO   = 'accbm_estatuto';
const KEY_REGIMENTO  = 'accbm_regimento';
const KEY_BIO_FRAZAO = 'accbm_bio_frazao';
const KEY_BIO_NALDO  = 'accbm_bio_naldo';
const INFO_KEY = (n: NucleoTab) => `accbm_info_${n}`;
const SESSION_KEY   = 'accbm_doc_admin_ok';

// ── Admin check (CPF digits split to avoid plain-text string in bundle) ───────
const _P = ['09','85','69','25','70','3'];           // 098569257-03
function checkAdmin(raw: string) { return raw.replace(/\D/g,'') === _P.join(''); }

// ── Tipos ─────────────────────────────────────────────────────────────────────
type NucleoTab = 'geral' | 'maua' | 'saracuruna';
const NUCLEO_LABELS: Record<NucleoTab,string> = { geral:'🌐 Geral', maua:'🔴 Mauá', saracuruna:'🟢 Saracuruna' };
const NUCLEO_COLORS: Record<NucleoTab,string> = { geral:'#1d4ed8', maua:'#dc2626', saracuruna:'#16a34a' };

export interface SimpleStudent {
  id: string; nome_completo: string; telefone: string | null; nucleo: string | null; email?: string | null;
}
interface Props {
  students?: SimpleStudent[];
  studentPhone?: string;
  studentName?: string;
  adminAlwaysUnlocked?: boolean;
  readOnly?: boolean; // when true: hide all upload buttons (download-only)
}

function fmt(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes/1_048_576).toFixed(1)} MB` : `${(bytes/1024).toFixed(0)} KB`;
}

const WA = ({s=14}:{s?:number}) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function DocumentsBar({ students=[], studentPhone, studentName, adminAlwaysUnlocked=false, readOnly=false }: Props) {

  // ── Unlock state ──────────────────────────────────────────────────────────
  const [unlocked, setUnlocked] = useState(() => {
    if (adminAlwaysUnlocked) return true;
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  });
  const [pendingAction, setPendingAction] = useState<null|'estatuto'|'regimento'|'info'|'bio_frazao'|'bio_naldo'>(null);
  const [cpfInput, setCpfInput]     = useState('');
  const [cpfError, setCpfError]     = useState('');
  const [showCpfModal, setShowCpfModal] = useState(false);

  useEffect(() => { if (adminAlwaysUnlocked) setUnlocked(true); }, [adminAlwaysUnlocked]);

  // ── File state ────────────────────────────────────────────────────────────
  const [estName,  setEstName]  = useState<string|null>(() => getCachedFileName(KEY_ESTATUTO));
  const [regName,  setRegName]  = useState<string|null>(() => getCachedFileName(KEY_REGIMENTO));
  const [estSize,  setEstSize]  = useState<number|null>(null);
  const [regSize,  setRegSize]  = useState<number|null>(null);
  const [uploading, setUploading] = useState<'estatuto'|'regimento'|'bio_frazao'|'bio_naldo'|null>(null);
  const [upOk,      setUpOk]     = useState<'estatuto'|'regimento'|'bio_frazao'|'bio_naldo'|null>(null);
  const [upErr,     setUpErr]    = useState<string|null>(null);
  const [downloading, setDownloading] = useState<'estatuto'|'regimento'|'bio_frazao'|'bio_naldo'|null>(null);

  // ── Bibliografia dos Mestres state ────────────────────────────────────────
  const [showBio,    setShowBio]    = useState(false);
  const [bioFrazaoName, setBioFrazaoName] = useState<string|null>(() => getCachedFileName(KEY_BIO_FRAZAO));
  const [bioNaldoName,  setBioNaldoName]  = useState<string|null>(() => getCachedFileName(KEY_BIO_NALDO));
  const [bioFrazaoSize, setBioFrazaoSize] = useState<number|null>(null);
  const [bioNaldoSize,  setBioNaldoSize]  = useState<number|null>(null);
  const bioFrazaoRef = useRef<HTMLInputElement>(null);
  const bioNaldoRef  = useRef<HTMLInputElement>(null);

  // ── Info state ────────────────────────────────────────────────────────────
  const [showInfo,   setShowInfo]   = useState(false);
  const [infoTab,    setInfoTab]    = useState<NucleoTab>('geral');
  const [texts,      setTexts]      = useState<Record<NucleoTab,string>>({ geral:'', maua:'', saracuruna:'' });
  const [draft,      setDraft]      = useState('');
  const [editing,    setEditing]    = useState(false);
  const [sendModal,  setSendModal]  = useState<{tab:NucleoTab;text:string}|null>(null);
  const [sentSet,    setSentSet]    = useState<Set<string>>(new Set());

  const estRef = useRef<HTMLInputElement>(null);
  const regRef = useRef<HTMLInputElement>(null);

  // Load file metadata from Supabase + info texts from localStorage
  useEffect(() => {
    getDocMeta(KEY_ESTATUTO).then(m => {
      if (m) { setEstName(m.name); setEstSize(m.size); cacheFileName(KEY_ESTATUTO, m.name); }
    }).catch(() => {});
    getDocMeta(KEY_REGIMENTO).then(m => {
      if (m) { setRegName(m.name); setRegSize(m.size); cacheFileName(KEY_REGIMENTO, m.name); }
    }).catch(() => {});
    getDocMeta(KEY_BIO_FRAZAO).then(m => {
      if (m) { setBioFrazaoName(m.name); setBioFrazaoSize(m.size); cacheFileName(KEY_BIO_FRAZAO, m.name); }
    }).catch(() => {});
    getDocMeta(KEY_BIO_NALDO).then(m => {
      if (m) { setBioNaldoName(m.name); setBioNaldoSize(m.size); cacheFileName(KEY_BIO_NALDO, m.name); }
    }).catch(() => {});
    const t: Record<NucleoTab,string> = { geral:'', maua:'', saracuruna:'' };
    (['geral','maua','saracuruna'] as NucleoTab[]).forEach(n => { try { t[n]=localStorage.getItem(INFO_KEY(n))||''; } catch {} });
    setTexts(t);
  }, []);

  // ── CPF modal flow ────────────────────────────────────────────────────────
  const requireUpload = (which: 'estatuto'|'regimento'|'bio_frazao'|'bio_naldo') => {
    if (unlocked) {
      if (which === 'estatuto') estRef.current?.click();
      else if (which === 'regimento') regRef.current?.click();
      else if (which === 'bio_frazao') bioFrazaoRef.current?.click();
      else if (which === 'bio_naldo') bioNaldoRef.current?.click();
    } else {
      setPendingAction(which);
      setCpfInput(''); setCpfError('');
      setShowCpfModal(true);
    }
  };

  const handleCpfSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkAdmin(cpfInput)) {
      setUnlocked(true);
      try { sessionStorage.setItem(SESSION_KEY,'1'); } catch {}
      setShowCpfModal(false);
      setTimeout(() => {
        if (pendingAction === 'estatuto') estRef.current?.click();
        if (pendingAction === 'regimento') regRef.current?.click();
        if (pendingAction === 'bio_frazao') bioFrazaoRef.current?.click();
        if (pendingAction === 'bio_naldo') bioNaldoRef.current?.click();
        if (pendingAction === 'info') { setDraft(texts[infoTab]); setEditing(false); setShowInfo(true); }
      }, 50);
      setPendingAction(null); setCpfInput('');
    } else {
      setCpfError('Identificação incorreta. Tente novamente.');
      setCpfInput('');
    }
  };

  // ── Upload handler ────────────────────────────────────────────────────────
  const doUpload = async (key: string, file: File, setName:(s:string)=>void, setSize:(n:number)=>void, which:'estatuto'|'regimento'|'bio_frazao'|'bio_naldo') => {
    setUploading(which); setUpErr(null);
    try {
      await saveDocFile(key, file);
      setName(file.name); setSize(file.size);
      setUpOk(which); setTimeout(()=>setUpOk(null), 3000);
    } catch(e:unknown) { setUpErr(e instanceof Error ? e.message : 'Erro ao salvar arquivo.'); }
    setUploading(null);
  };

  // ── Download handler (from Supabase — works for ALL users) ───────────────
  const doDownload = async (key: string, which: 'estatuto'|'regimento'|'bio_frazao'|'bio_naldo') => {
    setDownloading(which);
    try {
      await downloadDocFile(key);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Nenhum arquivo carregado ainda.\nClique em "⬆ Inserir arquivo" para fazer o upload.');
    }
    setDownloading(null);
  };

  // ── Info helpers ──────────────────────────────────────────────────────────
  const saveAndSend = (tab: NucleoTab, text: string) => {
    setTexts(p => ({...p,[tab]:text}));
    try { localStorage.setItem(INFO_KEY(tab), text); } catch {}
    setEditing(false);
    const list = studentsFor(tab);
    if (!list.length && studentPhone) { window.open(waLink(studentPhone,text),'_blank'); return; }
    setSentSet(new Set()); setSendModal({tab, text});
  };

  const hasPhone = (s: SimpleStudent) => !!(s.telefone && s.telefone.replace(/\D/g,'').length >= 8);
  const normalNucleo = (n: string | null | undefined) =>
    (n || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  const studentsFor = (tab: NucleoTab): SimpleStudent[] => {
    if (!students.length) return (studentPhone && studentPhone.replace(/\D/g,'').length >= 8)
      ? [{id:'single',nome_completo:studentName||'Aluno',telefone:studentPhone,nucleo:null}] : [];
    if (tab === 'geral') return students.filter(hasPhone);
    const target = tab === 'maua' ? 'maua' : 'saracuruna';
    return students.filter(s => normalNucleo(s.nucleo) === target && hasPhone(s));
  };

  const waLink = (phone: string, text: string) => {
    const p = phone.replace(/\D/g,''); const br = p.startsWith('55')?p:`55${p}`;
    return `https://api.whatsapp.com/send?phone=${br}&text=${encodeURIComponent(`ℹ️ *Informações — Capoeira Barão de Mauá*\n\n${text}\n\n_Associação Cultural de Capoeira Barão de Mauá_`)}`;
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const mainBtn = (color: string, active: boolean, busy = false): React.CSSProperties => ({
    display:'flex', alignItems:'center', justifyContent:'center', gap:7,
    padding:'11px 12px', borderRadius:10, cursor: busy ? 'wait' : 'pointer', fontWeight:700,
    fontSize:'0.82rem', border:'none', width:'100%', color:'#fff', transition:'all .15s',
    background: active ? `linear-gradient(135deg,${color},${color}cc)` : `linear-gradient(135deg,${color}88,${color}55)`,
    boxShadow: active ? `0 3px 12px ${color}44` : 'none',
    opacity: busy ? 0.7 : 1,
  });

  const upBtn = (color: string, isUploading: boolean, isOk: boolean): React.CSSProperties => ({
    display:'flex', alignItems:'center', justifyContent:'center', gap:5,
    padding:'7px 10px', borderRadius:8, cursor:'pointer', width:'100%', fontWeight:700, fontSize:'0.72rem',
    background: isOk ? 'rgba(22,163,74,0.12)' : `${color}10`,
    border: isOk ? '1.5px solid rgba(22,163,74,0.5)' : `1.5px dashed ${color}70`,
    color: isOk ? '#16a34a' : color,
    opacity: isUploading ? 0.6 : 1,
  });

  const cur = texts[infoTab];
  const tabList = sendModal ? studentsFor(sendModal.tab) : [];

  return (
    <div style={{ margin:'12px 0 18px' }}>

      {/* ── Upload error toast ─────────────────────────────────────────────── */}
      {upErr && (
        <div style={{ background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.4)',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:'0.82rem',color:'#dc2626',fontWeight:600,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          ⚠ {upErr}
          <button onClick={()=>setUpErr(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontWeight:800,fontSize:'1rem' }}>✕</button>
        </div>
      )}

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>

        {/* ── Bibliografia dos Mestres ─────────────────────────────────────── */}
        <div style={{ flex:1, minWidth:145, display:'flex', flexDirection:'column', gap:4 }}>
          <button
            onClick={()=>setShowBio(v=>!v)}
            style={mainBtn(showBio ? '#7c3aed' : '#8b5cf6', !!(bioFrazaoName||bioNaldoName))}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 8v4l3 3"/></svg>
            Bibliografia dos Mestres
          </button>
          <div style={{fontSize:'0.62rem',color:'var(--text-secondary)',textAlign:'center'}}>
            {[bioFrazaoName&&'M. Frazão', bioNaldoName&&'M. Naldo'].filter(Boolean).join(' · ') || 'Portfólio dos mestres'}
          </div>
        </div>

        {/* ── Estatuto Social ──────────────────────────────────────────────── */}
        <div style={{ flex:1, minWidth:145, display:'flex', flexDirection:'column', gap:4 }}>
          <button
            onClick={()=>doDownload(KEY_ESTATUTO,'estatuto')}
            disabled={downloading==='estatuto'}
            style={mainBtn('#dc2626', !!estName, downloading==='estatuto')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {downloading==='estatuto' ? 'Baixando...' : 'Estatuto Social'}
            {downloading!=='estatuto' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
          </button>
          {/* Upload — somente admin; oculto em readOnly */}
          {!readOnly && (
            <>
              <input ref={estRef} id="inp-est" type="file" accept=".pdf,.doc,.docx,image/*" style={{display:'none'}}
                onChange={e=>{const f=e.target.files?.[0];if(f)doUpload(KEY_ESTATUTO,f,setEstName,setEstSize,'estatuto');e.target.value='';}} />
              {unlocked ? (
                <label htmlFor={uploading==='estatuto'?undefined:'inp-est'} style={{...upBtn('#dc2626',uploading==='estatuto',upOk==='estatuto'),cursor:uploading==='estatuto'?'wait':'pointer',userSelect:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
                  {uploading==='estatuto' ? <><span style={{display:'inline-block',animation:'spin .7s linear infinite'}}>⏳</span> Salvando...</>
                    : upOk==='estatuto' ? <>✓ Arquivo salvo!</>
                    : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>{estName?'✓ Substituir arquivo':'⬆ Inserir arquivo'}</>}
                </label>
              ) : (
                <button onClick={()=>requireUpload('estatuto')} style={upBtn('#dc2626',false,false)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>{estName?'🔒 Substituir arquivo':'🔒 Inserir arquivo'}
                </button>
              )}
            </>
          )}
          <div style={{fontSize:'0.62rem',color:'var(--text-secondary)',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingInline:2}}>
            {estName ? <span style={{color:'#dc262688'}}>📄 {estName}{estSize?` · ${fmt(estSize)}`:''}</span> : 'Nenhum arquivo inserido'}
          </div>
        </div>

        {/* ── Regimento Interno ────────────────────────────────────────────── */}
        <div style={{ flex:1, minWidth:145, display:'flex', flexDirection:'column', gap:4 }}>
          <button
            onClick={()=>doDownload(KEY_REGIMENTO,'regimento')}
            disabled={downloading==='regimento'}
            style={mainBtn('#1d4ed8', !!regName, downloading==='regimento')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            {downloading==='regimento' ? 'Baixando...' : 'Regimento Interno'}
            {downloading!=='regimento' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
          </button>
          {/* Upload — somente admin; oculto em readOnly */}
          {!readOnly && (
            <>
              <input ref={regRef} id="inp-reg" type="file" accept=".pdf,.doc,.docx,image/*" style={{display:'none'}}
                onChange={e=>{const f=e.target.files?.[0];if(f)doUpload(KEY_REGIMENTO,f,setRegName,setRegSize,'regimento');e.target.value='';}} />
              {unlocked ? (
                <label htmlFor={uploading==='regimento'?undefined:'inp-reg'} style={{...upBtn('#1d4ed8',uploading==='regimento',upOk==='regimento'),cursor:uploading==='regimento'?'wait':'pointer',userSelect:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
                  {uploading==='regimento' ? <><span style={{display:'inline-block',animation:'spin .7s linear infinite'}}>⏳</span> Salvando...</>
                    : upOk==='regimento' ? <>✓ Arquivo salvo!</>
                    : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>{regName?'✓ Substituir arquivo':'⬆ Inserir arquivo'}</>}
                </label>
              ) : (
                <button onClick={()=>requireUpload('regimento')} style={upBtn('#1d4ed8',false,false)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>{regName?'🔒 Substituir arquivo':'🔒 Inserir arquivo'}
                </button>
              )}
            </>
          )}
          <div style={{fontSize:'0.62rem',color:'var(--text-secondary)',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingInline:2}}>
            {regName ? <span style={{color:'#1d4ed888'}}>📄 {regName}{regSize?` · ${fmt(regSize)}`:''}</span> : 'Nenhum arquivo inserido'}
          </div>
        </div>

        {/* ── Informações Gerais ────────────────────────────────────────────── */}
        <div style={{ flex:1, minWidth:145, display:'flex', flexDirection:'column', gap:4 }}>
          <button onClick={()=>{
            if (!unlocked) { setPendingAction('info'); setCpfInput(''); setCpfError(''); setShowCpfModal(true); return; }
            setDraft(texts[infoTab]); setEditing(false); setShowInfo(v=>!v);
          }} style={mainBtn(showInfo?'#15803d':'#16a34a', Object.values(texts).some(Boolean))}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Informações Gerais
          </button>
          <div style={{fontSize:'0.62rem',color:'var(--text-secondary)',textAlign:'center'}}>
            {Object.entries(texts).filter(([,v])=>v).map(([k])=>NUCLEO_LABELS[k as NucleoTab]).join(' · ') || 'Clique para ver / editar'}
          </div>
        </div>
      </div>

      {/* ── Informações panel ────────────────────────────────────────────────── */}
      {showInfo && (
        <div style={{ marginTop:10, background:'var(--bg-card)', border:'1.5px solid rgba(22,163,74,0.35)', borderRadius:12, overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ background:'linear-gradient(90deg,#16a34a,#15803d)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{color:'#fff',fontWeight:800,fontSize:'0.88rem'}}>ℹ️ Informações Gerais — ACCBM</span>
            <button onClick={()=>{setShowInfo(false);setEditing(false);}} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',width:26,height:26,borderRadius:6,cursor:'pointer',fontWeight:700}}>✕</button>
          </div>
          {/* Núcleo tabs */}
          <div style={{display:'flex',borderBottom:'1px solid var(--border)',background:'var(--bg-input)'}}>
            {(['geral','maua','saracuruna'] as NucleoTab[]).map(tab=>(
              <button key={tab} onClick={()=>{setInfoTab(tab);setDraft(texts[tab]);setEditing(false);}}
                style={{ flex:1, padding:'9px 8px', border:'none', borderBottom:infoTab===tab?`2.5px solid ${NUCLEO_COLORS[tab]}`:'2.5px solid transparent', background:'none', cursor:'pointer', fontWeight:infoTab===tab?700:500, fontSize:'0.8rem', color:infoTab===tab?NUCLEO_COLORS[tab]:'var(--text-secondary)', transition:'all .15s' }}>
                {NUCLEO_LABELS[tab]}
                {texts[tab]&&<span style={{marginLeft:4,width:6,height:6,borderRadius:'50%',background:NUCLEO_COLORS[tab],display:'inline-block',verticalAlign:'middle'}}/>}
              </button>
            ))}
          </div>
          <div style={{padding:'14px 16px'}}>
            {editing ? (
              <>
                <textarea value={draft} onChange={e=>setDraft(e.target.value)} autoFocus rows={6}
                  placeholder={`Informações para ${NUCLEO_LABELS[infoTab]} (horários, avisos, eventos, mensalidades...)...`}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:'0.88rem',background:'var(--bg-input)',color:'var(--text-primary)',outline:'none',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.65}} />
                <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                  <button onClick={()=>setEditing(false)} style={{padding:'9px 14px',background:'var(--bg-input)',border:'1px solid var(--border)',color:'var(--text-secondary)',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:'0.85rem'}}>Cancelar</button>
                  <button onClick={()=>{setTexts(p=>({...p,[infoTab]:draft}));try{localStorage.setItem(INFO_KEY(infoTab),draft);}catch{}setEditing(false);}}
                    style={{flex:1,padding:'9px 14px',background:'linear-gradient(135deg,#16a34a,#15803d)',border:'none',color:'#fff',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:'0.88rem'}}>✓ Salvar</button>
                  {draft.trim()&&<button onClick={()=>saveAndSend(infoTab,draft)}
                    style={{flex:1,padding:'9px 14px',background:'linear-gradient(135deg,#25d366,#128c7e)',border:'none',color:'#fff',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:'0.85rem',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                    <WA s={13}/>Salvar e Enviar</button>}
                </div>
              </>
            ) : (
              <>
                {cur ? (
                  <div style={{fontSize:'0.9rem',color:'var(--text-primary)',lineHeight:1.75,whiteSpace:'pre-wrap',marginBottom:12,background:'var(--bg-input)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px'}}>{cur}</div>
                ) : (
                  <p style={{color:'var(--text-secondary)',fontSize:'0.88rem',fontStyle:'italic',textAlign:'center',padding:'14px 0'}}>Nenhuma informação para {NUCLEO_LABELS[infoTab]}.</p>
                )}
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button onClick={()=>{setDraft(cur);setEditing(true);}} style={{padding:'9px 16px',background:'rgba(22,163,74,0.1)',border:'1px solid rgba(22,163,74,0.35)',color:'#16a34a',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:'0.85rem'}}>✏️ Editar</button>
                  {cur&&<button onClick={()=>{setSentSet(new Set());setSendModal({tab:infoTab,text:cur});}}
                    style={{flex:1,padding:'9px 14px',background:'rgba(37,211,102,0.1)',border:'1px solid rgba(37,211,102,0.4)',color:'#25d366',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:'0.85rem',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                    <WA s={13}/>{studentPhone?`Enviar p/ ${studentName||'aluno'}`:`Enviar para ${NUCLEO_LABELS[infoTab]}`}</button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Bibliografia dos Mestres panel ───────────────────────────────────── */}
      {showBio && (
        <div style={{ marginTop:10, background:'var(--bg-card)', border:'1.5px solid rgba(139,92,246,0.35)', borderRadius:12, overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ background:'linear-gradient(90deg,#7c3aed,#6d28d9)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{color:'#fff',fontWeight:800,fontSize:'0.88rem'}}>📚 Bibliografia dos Mestres — ACCBM</span>
            <button onClick={()=>setShowBio(false)} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',width:26,height:26,borderRadius:6,cursor:'pointer',fontWeight:700}}>✕</button>
          </div>
          <div style={{padding:'14px 16px', display:'flex', flexDirection:'column', gap:12}}>

            {/* ── Mestre Márcio Frazão ── */}
            <div style={{background:'var(--bg-input)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontWeight:800,fontSize:'0.88rem',color:'#dc2626',marginBottom:8,display:'flex',alignItems:'center',gap:7}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                Mestre Márcio Frazão
              </div>
              <button
                onClick={()=>doDownload(KEY_BIO_FRAZAO,'bio_frazao')}
                disabled={downloading==='bio_frazao'}
                style={{...mainBtn('#dc2626',!!bioFrazaoName,downloading==='bio_frazao'), marginBottom:6}}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {downloading==='bio_frazao' ? 'Baixando...' : bioFrazaoName ? 'Ver Portfólio' : 'Portfólio não inserido'}
                {downloading!=='bio_frazao' && bioFrazaoName && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              </button>
              {!readOnly && (
                <>
                  <input ref={bioFrazaoRef} id="inp-bio-frazao" type="file" accept=".pdf,.doc,.docx,image/*" style={{display:'none'}}
                    onChange={e=>{const f=e.target.files?.[0];if(f)doUpload(KEY_BIO_FRAZAO,f,setBioFrazaoName,setBioFrazaoSize,'bio_frazao');e.target.value='';}} />
                  {unlocked ? (
                    <label htmlFor={uploading==='bio_frazao'?undefined:'inp-bio-frazao'} style={{...upBtn('#dc2626',uploading==='bio_frazao',upOk==='bio_frazao'),cursor:uploading==='bio_frazao'?'wait':'pointer',userSelect:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
                      {uploading==='bio_frazao' ? <><span style={{display:'inline-block',animation:'spin .7s linear infinite'}}>⏳</span> Salvando...</>
                        : upOk==='bio_frazao' ? <>✓ Arquivo salvo!</>
                        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>{bioFrazaoName?'✓ Substituir':'⬆ Inserir arquivo'}</>}
                    </label>
                  ) : (
                    <button onClick={()=>requireUpload('bio_frazao')} style={upBtn('#dc2626',false,false)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>🔒 Inserir arquivo
                    </button>
                  )}
                </>
              )}
              {bioFrazaoName && <div style={{fontSize:'0.62rem',color:'#dc262688',marginTop:4,textAlign:'center'}}>📄 {bioFrazaoName}{bioFrazaoSize?` · ${fmt(bioFrazaoSize)}`:''}</div>}
            </div>

            {/* ── Mestre Naldo Magrinho ── */}
            <div style={{background:'var(--bg-input)',border:'1px solid rgba(22,163,74,0.2)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontWeight:800,fontSize:'0.88rem',color:'#16a34a',marginBottom:8,display:'flex',alignItems:'center',gap:7}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                Mestre Naldo Magrinho
              </div>
              <button
                onClick={()=>doDownload(KEY_BIO_NALDO,'bio_naldo')}
                disabled={downloading==='bio_naldo'}
                style={{...mainBtn('#16a34a',!!bioNaldoName,downloading==='bio_naldo'), marginBottom:6}}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {downloading==='bio_naldo' ? 'Baixando...' : bioNaldoName ? 'Ver Portfólio' : 'Portfólio não inserido'}
                {downloading!=='bio_naldo' && bioNaldoName && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              </button>
              {!readOnly && (
                <>
                  <input ref={bioNaldoRef} id="inp-bio-naldo" type="file" accept=".pdf,.doc,.docx,image/*" style={{display:'none'}}
                    onChange={e=>{const f=e.target.files?.[0];if(f)doUpload(KEY_BIO_NALDO,f,setBioNaldoName,setBioNaldoSize,'bio_naldo');e.target.value='';}} />
                  {unlocked ? (
                    <label htmlFor={uploading==='bio_naldo'?undefined:'inp-bio-naldo'} style={{...upBtn('#16a34a',uploading==='bio_naldo',upOk==='bio_naldo'),cursor:uploading==='bio_naldo'?'wait':'pointer',userSelect:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
                      {uploading==='bio_naldo' ? <><span style={{display:'inline-block',animation:'spin .7s linear infinite'}}>⏳</span> Salvando...</>
                        : upOk==='bio_naldo' ? <>✓ Arquivo salvo!</>
                        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>{bioNaldoName?'✓ Substituir':'⬆ Inserir arquivo'}</>}
                    </label>
                  ) : (
                    <button onClick={()=>requireUpload('bio_naldo')} style={upBtn('#16a34a',false,false)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>🔒 Inserir arquivo
                    </button>
                  )}
                </>
              )}
              {bioNaldoName && <div style={{fontSize:'0.62rem',color:'#16a34a88',marginTop:4,textAlign:'center'}}>📄 {bioNaldoName}{bioNaldoSize?` · ${fmt(bioNaldoSize)}`:''}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── CPF / Identificação modal ─────────────────────────────────────────── */}
      {showCpfModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:20}}>
          <div style={{background:'#fff',borderRadius:16,padding:'28px 24px',width:'100%',maxWidth:340,boxShadow:'0 12px 40px rgba(0,0,0,0.35)'}}>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:'2.2rem',marginBottom:8}}>🔒</div>
              <div style={{fontWeight:800,fontSize:'1.05rem',color:'#1e3a8a'}}>Acesso Restrito</div>
              <div style={{fontSize:'0.78rem',color:'#64748b',marginTop:5}}>Digite sua identificação para continuar</div>
            </div>
            <form onSubmit={handleCpfSubmit} style={{display:'flex',flexDirection:'column',gap:12}}>
              <input type="password" value={cpfInput} onChange={e=>{setCpfInput(e.target.value);setCpfError('');}}
                placeholder="Sua identificação (CPF)" autoFocus
                style={{width:'100%',padding:'12px 14px',border:'1.5px solid #e2e8f0',borderRadius:9,fontSize:'1rem',outline:'none',boxSizing:'border-box',textAlign:'center',letterSpacing:'0.1em'}} />
              {cpfError&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:7,padding:'8px 12px',color:'#dc2626',fontSize:'0.8rem',fontWeight:600,textAlign:'center'}}>⚠ {cpfError}</div>}
              <div style={{display:'flex',gap:8}}>
                <button type="button" onClick={()=>{setShowCpfModal(false);setPendingAction(null);setCpfInput('');setCpfError('');}}
                  style={{flex:1,padding:'11px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:'0.9rem',color:'#64748b'}}>Cancelar</button>
                <button type="submit"
                  style={{flex:2,padding:'11px',background:'linear-gradient(135deg,#1d4ed8,#1e40af)',border:'none',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:'0.9rem',color:'#fff'}}>Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bulk send modal ───────────────────────────────────────────────────── */}
      {sendModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400,padding:16}}>
          <div style={{background:'var(--bg-card)',borderRadius:16,width:'100%',maxWidth:480,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 12px 40px rgba(0,0,0,0.3)',overflow:'hidden'}}>
            <div style={{background:`linear-gradient(135deg,${NUCLEO_COLORS[sendModal.tab]},${NUCLEO_COLORS[sendModal.tab]}cc)`,padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div>
                <div style={{color:'#fff',fontWeight:800,fontSize:'0.95rem'}}>📲 Enviar — {NUCLEO_LABELS[sendModal.tab]}</div>
                <div style={{color:'rgba(255,255,255,0.85)',fontSize:'0.75rem',marginTop:2}}>{tabList.length} aluno(s) com telefone cadastrado</div>
              </div>
              <button onClick={()=>{setSendModal(null);setSentSet(new Set());}} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',width:30,height:30,borderRadius:8,cursor:'pointer',fontWeight:800,fontSize:'1rem'}}>✕</button>
            </div>
            <div style={{padding:'10px 18px',borderBottom:'1px solid var(--border)',flexShrink:0,background:'var(--bg-input)'}}>
              <div style={{fontSize:'0.7rem',color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Mensagem:</div>
              <div style={{fontSize:'0.82rem',color:'var(--text-primary)',whiteSpace:'pre-wrap',lineHeight:1.5,maxHeight:70,overflowY:'auto'}}>{sendModal.text.slice(0,220)}{sendModal.text.length>220?'…':''}</div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'10px 14px'}}>
              {tabList.length===0 ? (
                <div style={{textAlign:'center',padding:30,color:'var(--text-secondary)',fontSize:'0.88rem'}}>Nenhum aluno com telefone cadastrado neste núcleo.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {tabList.map(s=>{
                    const sent=sentSet.has(s.id);
                    return (
                      <div key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:sent?'rgba(22,163,74,0.07)':'var(--bg-input)',border:`1px solid ${sent?'rgba(22,163,74,0.3)':'var(--border)'}`,borderRadius:10,transition:'all .15s'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:'0.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.nome_completo}</div>
                          <div style={{fontSize:'0.7rem',color:'var(--text-secondary)'}}>{s.telefone}{s.nucleo?` · ${s.nucleo}`:''}</div>
                        </div>
                        <a href={waLink(s.telefone ?? '',sendModal.text)} target="_blank" rel="noopener noreferrer"
                          onClick={()=>setSentSet(p=>new Set([...p,s.id]))}
                          style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:8,textDecoration:'none',fontWeight:700,fontSize:'0.78rem',flexShrink:0,transition:'all .15s',
                            background:sent?'rgba(22,163,74,0.15)':'linear-gradient(135deg,#25d366,#128c7e)',
                            color:sent?'#16a34a':'#fff', border:sent?'1px solid rgba(22,163,74,0.4)':'none'}}>
                          <WA s={13}/>{sent?'✓ Enviado':'Enviar'}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{padding:'12px 18px',borderTop:'1px solid var(--border)',flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
              {sentSet.size>0&&<span style={{flex:1,color:'#16a34a',fontWeight:700,fontSize:'0.8rem'}}>✓ {sentSet.size}/{tabList.length} enviados</span>}
              <button onClick={()=>{setSendModal(null);setSentSet(new Set());}} style={{marginLeft:'auto',padding:'9px 20px',background:'var(--bg-input)',border:'1px solid var(--border)',color:'var(--text-secondary)',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:'0.88rem'}}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
