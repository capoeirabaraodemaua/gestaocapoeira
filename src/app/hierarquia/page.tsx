'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const SUPER_ADMIN_CPF = '09856925703';
const BUCKET = 'photos';

interface Membro { id: string; nome: string; nucleo?: string; foto_url?: string | null; }
interface Hierarquia {
  mestres: Membro[];
  mestrandos: Membro[];
  professores: Membro[];
  instrutores: Membro[];
  monitores: Membro[];
  alunos_graduados: Membro[];
  updated_at: string;
}

const EMPTY: Hierarquia = { mestres: [], mestrandos: [], professores: [], instrutores: [], monitores: [], alunos_graduados: [], updated_at: '' };

const NIVEIS: { key: keyof Omit<Hierarquia,'updated_at'>; label: string; icon: string; cor: string; border: string; badge: string; desc: string }[] = [
  { key: 'mestres',         label: 'Mestres',           icon: '👑', cor: 'linear-gradient(135deg,#ca8a04,#a16207)', border: '#ca8a04', badge: '#fbbf24', desc: 'Mestres de Capoeira' },
  { key: 'mestrandos',      label: 'Mestrandos',        icon: '🥇', cor: 'linear-gradient(135deg,#dc2626,#b91c1c)', border: '#dc2626', badge: '#f87171', desc: 'Em formação para Mestre' },
  { key: 'professores',     label: 'Professores',       icon: '🎓', cor: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: '#7c3aed', badge: '#a78bfa', desc: 'Professores de Capoeira' },
  { key: 'instrutores',     label: 'Instrutores',       icon: '🥋', cor: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: '#1d4ed8', badge: '#93c5fd', desc: 'Instrutores' },
  { key: 'monitores',       label: 'Monitores',         icon: '⭐', cor: 'linear-gradient(135deg,#0891b2,#0e7490)', border: '#0891b2', badge: '#67e8f9', desc: 'Monitores' },
  { key: 'alunos_graduados',label: 'Alunos Graduados',  icon: '🎽', cor: 'linear-gradient(135deg,#16a34a,#15803d)', border: '#16a34a', badge: '#4ade80', desc: 'Alunos graduados' },
];

export default function HierarquiaPage() {
  const [data, setData] = useState<Hierarquia>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Hierarquia>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [adminCpf, setAdminCpf] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [expandedNivel, setExpandedNivel] = useState<string | null>('mestres');
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUploadKey = useRef<{ nivel: string; idx: number } | null>(null);

  useEffect(() => {
    fetch('/api/hierarquia').then(r => r.json()).then(d => {
      setData(d); setDraft(d); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleAdminLogin = () => {
    if (adminCpf.replace(/\D/g, '') === SUPER_ADMIN_CPF) {
      setIsAdmin(true); setShowAdminModal(false); setEditMode(true); setAdminErr('');
    } else { setAdminErr('CPF não autorizado.'); }
  };

  const uploadFoto = async (file: File, nivel: string, idx: number): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `hierarquia/${nivel}_${idx}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const pending = pendingUploadKey.current;
    if (!file || !pending) return;
    setUploadingKey(`${pending.nivel}_${pending.idx}`);
    const url = await uploadFoto(file, pending.nivel, pending.idx);
    if (url) {
      setDraft(prev => {
        const nivel = pending.nivel as keyof Omit<Hierarquia,'updated_at'>;
        const arr = [...prev[nivel]];
        arr[pending.idx] = { ...arr[pending.idx], foto_url: url };
        return { ...prev, [nivel]: arr };
      });
    }
    setUploadingKey(null);
    e.target.value = '';
  };

  const addMembro = (nivel: keyof Omit<Hierarquia,'updated_at'>) => {
    setDraft(prev => ({
      ...prev,
      [nivel]: [...prev[nivel], { id: `m_${Date.now()}`, nome: '', nucleo: '', foto_url: null }],
    }));
  };

  const removeMembro = (nivel: keyof Omit<Hierarquia,'updated_at'>, idx: number) => {
    setDraft(prev => ({ ...prev, [nivel]: prev[nivel].filter((_, i) => i !== idx) }));
  };

  const updateMembro = (nivel: keyof Omit<Hierarquia,'updated_at'>, idx: number, field: string, value: string) => {
    setDraft(prev => {
      const arr = [...prev[nivel]];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, [nivel]: arr };
    });
  };

  const saveDraft = async () => {
    setSaving(true);
    const res = await fetch('/api/hierarquia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    if (res.ok) {
      const { data: saved } = await res.json();
      setData(saved); setSaveMsg('✓ Salvo!'); setEditMode(false);
    } else { setSaveMsg('Erro ao salvar.'); }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const currentData = editMode ? draft : data;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1a0a2e 60%,#0f172a 100%)', fontFamily: 'Inter, sans-serif', padding: '24px 16px' }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

      {/* Header */}
      <div style={{ maxWidth: 800, margin: '0 auto 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>← Voltar</Link>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin && editMode ? (
              <>
                <button onClick={saveDraft} disabled={saving}
                  style={{ background: 'linear-gradient(135deg,#ca8a04,#a16207)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: saving ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                  {saving ? 'Salvando...' : '💾 Salvar'}
                </button>
                <button onClick={() => { setEditMode(false); setDraft(data); }}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Cancelar
                </button>
              </>
            ) : isAdmin ? (
              <button onClick={() => setEditMode(true)}
                style={{ background: 'rgba(202,138,4,0.15)', border: '1px solid rgba(202,138,4,0.35)', color: '#fbbf24', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                ✏ Editar
              </button>
            ) : (
              <button onClick={() => setShowAdminModal(true)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.72rem' }}>
                🔒 Admin
              </button>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>ACCBM</div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, background: 'linear-gradient(90deg,#fbbf24,#f87171,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Hierarquia da Capoeira
          </h1>
          <div style={{ marginTop: 6, fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Associação Cultural de Capoeira Barão de Mauá</div>
          {saveMsg && <div style={{ marginTop: 10, color: saveMsg.includes('Erro') ? '#f87171' : '#4ade80', fontSize: '0.82rem', fontWeight: 700 }}>{saveMsg}</div>}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>Carregando...</div>
      ) : (
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gap: 12 }}>
          {NIVEIS.map(nivel => {
            const membros = (currentData as any)[nivel.key] as Membro[];
            const isExpanded = expandedNivel === nivel.key || editMode;
            return (
              <div key={nivel.key} style={{ background: 'rgba(255,255,255,0.03)', border: `2px solid ${nivel.border}30`, borderRadius: 16, overflow: 'hidden' }}>
                {/* Level header */}
                <div
                  style={{ background: `${nivel.cor.replace('linear-gradient(135deg,','').split(',')[0]}12`, borderBottom: isExpanded ? `1px solid ${nivel.border}20` : 'none', padding: '14px 20px', cursor: editMode ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                  onClick={() => !editMode && setExpandedNivel(isExpanded ? null : nivel.key)}>
                  {/* Level icons strip */}
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: nivel.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0, boxShadow: `0 4px 12px ${nivel.border}40` }}>
                    {nivel.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{nivel.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{nivel.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: `${nivel.border}20`, border: `1px solid ${nivel.border}40`, borderRadius: 20, padding: '3px 12px', color: nivel.badge, fontSize: '0.78rem', fontWeight: 700 }}>
                      {membros.length}
                    </span>
                    {!editMode && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }}><path d="M9 18l6-6-6-6"/></svg>}
                  </div>
                </div>

                {/* Members grid */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px' }}>
                    {membros.length === 0 && !editMode ? (
                      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.82rem', padding: '16px 0' }}>Nenhum membro neste nível</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {membros.map((m, idx) => (
                          <div key={m.id || idx} style={{ background: `${nivel.border}08`, border: `1px solid ${nivel.border}25`, borderRadius: 12, padding: '12px', width: 130, textAlign: 'center', position: 'relative' }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              {m.foto_url
                                ? <img src={m.foto_url} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${nivel.border}` }} />
                                : <div style={{ width: 60, height: 60, borderRadius: '50%', background: `${nivel.border}18`, border: `2px solid ${nivel.border}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', margin: '0 auto' }}>👤</div>
                              }
                              {editMode && (
                                <button onClick={() => { pendingUploadKey.current = { nivel: nivel.key, idx }; fileRef.current?.click(); }}
                                  disabled={uploadingKey === `${nivel.key}_${idx}`}
                                  style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: nivel.cor, border: '2px solid #fff', cursor: 'pointer', fontSize: '0.6rem' }}>
                                  {uploadingKey === `${nivel.key}_${idx}` ? '⏳' : '📷'}
                                </button>
                              )}
                            </div>
                            {editMode ? (
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <input value={m.nome} onChange={e => updateMembro(nivel.key, idx, 'nome', e.target.value)} placeholder="Nome" style={{ width: '100%', padding: '4px 6px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#fff', fontSize: '0.74rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                                <input value={m.nucleo || ''} onChange={e => updateMembro(nivel.key, idx, 'nucleo', e.target.value)} placeholder="Núcleo" style={{ width: '100%', padding: '4px 6px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                                <button onClick={() => removeMembro(nivel.key, idx)}
                                  style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: '0.65rem', marginTop: 2 }}>✕ Remover</button>
                              </div>
                            ) : (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fff', lineHeight: 1.3 }}>{m.nome || '—'}</div>
                                {m.nucleo && <div style={{ fontSize: '0.65rem', color: nivel.badge, marginTop: 3, opacity: 0.8 }}>{m.nucleo}</div>}
                              </div>
                            )}
                          </div>
                        ))}
                        {editMode && (
                          <button onClick={() => addMembro(nivel.key)}
                            style={{ width: 130, minHeight: 120, borderRadius: 12, border: `2px dashed ${nivel.border}40`, background: 'transparent', color: `${nivel.badge}80`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.74rem', fontWeight: 700 }}>
                            <span style={{ fontSize: '1.4rem' }}>+</span>
                            Adicionar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Admin modal */}
      {showAdminModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
          onClick={() => setShowAdminModal(false)}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', fontWeight: 800, margin: '0 0 6px', fontSize: '1rem' }}>🔒 Acesso Administrativo</h3>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', margin: '0 0 14px' }}>Somente o Administrador Geral pode editar a hierarquia.</p>
            <input type="password" value={adminCpf} onChange={e => setAdminCpf(e.target.value.replace(/\D/g,''))}
              onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
              placeholder="CPF do administrador" autoFocus
              style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
            {adminErr && <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: 8 }}>{adminErr}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdminModal(false); setAdminCpf(''); setAdminErr(''); }} style={{ flex: 1, padding: '9px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
              <button onClick={handleAdminLogin} style={{ flex: 2, padding: '9px', background: 'linear-gradient(135deg,#ca8a04,#a16207)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>Entrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
