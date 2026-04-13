'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const SUPER_ADMIN_CPF = '09856925703';
const BUCKET = 'photos';

interface Membro { nome: string; foto_url?: string | null; }
interface Organograma {
  presidente: Membro;
  vice_presidente: Membro;
  secretario: Membro;
  tesoureiro: Membro;
  coordenador_tecnico_cultural: Membro;
  conselho_fiscal: (Membro & { id: string })[];
  updated_at: string;
}

const EMPTY: Organograma = {
  presidente: { nome: '', foto_url: null },
  vice_presidente: { nome: '', foto_url: null },
  secretario: { nome: '', foto_url: null },
  tesoureiro: { nome: '', foto_url: null },
  coordenador_tecnico_cultural: { nome: '', foto_url: null },
  conselho_fiscal: [],
  updated_at: '',
};

const CARGO_LABELS: Record<string, string> = {
  presidente: 'Presidente',
  vice_presidente: 'Vice-Presidente',
  secretario: 'Secretário(a)',
  tesoureiro: 'Tesoureiro(a)',
  coordenador_tecnico_cultural: 'Coordenador(a) Técnico-Cultural',
};

const CARGO_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  presidente: { bg: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: '#7c3aed', text: '#fff', badge: '#a78bfa' },
  vice_presidente: { bg: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: '#1d4ed8', text: '#fff', badge: '#93c5fd' },
  secretario: { bg: 'linear-gradient(135deg,#0891b2,#0e7490)', border: '#0891b2', text: '#fff', badge: '#67e8f9' },
  tesoureiro: { bg: 'linear-gradient(135deg,#16a34a,#15803d)', border: '#16a34a', text: '#fff', badge: '#4ade80' },
  coordenador_tecnico_cultural: { bg: 'linear-gradient(135deg,#ea580c,#c2410c)', border: '#ea580c', text: '#fff', badge: '#fdba74' },
};

// ── CargoCard definido FORA do componente pai para evitar remount a cada keystroke ──
function CargoCard({
  cargoKey, membro, isEdit, uploadingKey,
  onNomeChange, onTriggerUpload,
}: {
  cargoKey: string;
  membro: Membro;
  isEdit: boolean;
  uploadingKey: string | null;
  onNomeChange: (value: string) => void;
  onTriggerUpload: () => void;
}) {
  const c = CARGO_COLORS[cargoKey];
  return (
    <div style={{
      background: '#1e293b',
      border: `2px solid ${c.border}40`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: `0 4px 20px ${c.border}20`,
    }}>
      <div style={{ background: c.bg, padding: '8px 16px', textAlign: 'center' }}>
        <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.9 }}>
          {CARGO_LABELS[cargoKey]}
        </span>
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          {membro.foto_url
            ? <img src={membro.foto_url} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${c.border}` }} />
            : <div style={{ width: 80, height: 80, borderRadius: '50%', background: `${c.border}20`, border: `3px solid ${c.border}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>👤</div>
          }
          {isEdit && (
            <button onClick={onTriggerUpload} disabled={uploadingKey === cargoKey}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: c.bg, border: '2px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem' }}>
              📷
            </button>
          )}
        </div>
        {isEdit ? (
          <input
            value={membro.nome}
            onChange={e => onNomeChange(e.target.value)}
            placeholder={`Nome do ${CARGO_LABELS[cargoKey]}`}
            style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', minHeight: 20 }}>{membro.nome || <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>—</span>}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrganogramaPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<Organograma>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Organograma>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [adminCpf, setAdminCpf] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUploadKey = useRef<string | null>(null);

  useEffect(() => {
    fetch('/api/organograma').then(r => r.json()).then(d => {
      setData(d);
      setDraft(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleAdminLogin = () => {
    if (adminCpf.replace(/\D/g, '') === SUPER_ADMIN_CPF) {
      setIsAdmin(true);
      setShowAdminModal(false);
      setEditMode(true);
      setAdminErr('');
    } else {
      setAdminErr('CPF não autorizado.');
    }
  };

  const uploadFoto = async (file: File, key: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `organograma/${key}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = pendingUploadKey.current;
    if (!file || !key) return;
    setUploadingKey(key);
    const url = await uploadFoto(file, key);
    if (url) {
      if (key.startsWith('conselho_')) {
        const idx = parseInt(key.split('_')[2]);
        setDraft(prev => {
          const cf = [...prev.conselho_fiscal];
          cf[idx] = { ...cf[idx], foto_url: url };
          return { ...prev, conselho_fiscal: cf };
        });
      } else {
        setDraft(prev => ({ ...prev, [key]: { ...(prev as any)[key], foto_url: url } }));
      }
    }
    setUploadingKey(null);
    e.target.value = '';
  };

  const triggerUpload = (key: string) => {
    pendingUploadKey.current = key;
    fileRef.current?.click();
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/organograma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json.data);
        setSaveMsg('✓ Salvo com sucesso!');
        setEditMode(false);
      } else {
        setSaveMsg('Erro: ' + (json.error || 'falha ao salvar'));
      }
    } catch (e: any) {
      setSaveMsg('Erro: ' + e.message);
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 5000);
  };

  const updateCargo = (cargoKey: string, value: string) => {
    setDraft(prev => ({ ...prev, [cargoKey]: { ...(prev as any)[cargoKey], nome: value } }));
  };

  const mainCargos = ['presidente', 'vice_presidente', 'secretario', 'tesoureiro', 'coordenador_tecnico_cultural'] as const;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)', fontFamily: 'Inter, sans-serif', padding: '24px 16px' }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

      {/* Header */}
      <div style={{ maxWidth: 900, margin: '0 auto 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <button onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/aluno'} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
            ← {t('common_back')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin && editMode ? (
              <>
                <button onClick={saveDraft} disabled={saving}
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: saving ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                  {saving ? t('admin_saving') : `💾 ${t('admin_save').split(' ')[0]}`}
                </button>
                <button onClick={() => { setEditMode(false); setDraft(data); }}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Cancelar
                </button>
              </>
            ) : isAdmin ? (
              <button onClick={() => setEditMode(true)}
                style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#a78bfa', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <img src="/logo-barao-maua.png" alt="ACCBM" onError={(e) => { (e.target as HTMLImageElement).src = '/logo-accbm.jpeg'; }} style={{ width: 100, height: 100, objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(167,139,250,0.4))' }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Associação Cultural de Capoeira
          </div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, background: 'linear-gradient(90deg,#a78bfa,#67e8f9,#4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Barão de Mauá
          </h1>
          <div style={{ marginTop: 6, fontSize: '1rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Organograma Institucional</div>
          {saveMsg && <div style={{ marginTop: 10, color: saveMsg.includes('Erro') ? '#f87171' : '#4ade80', fontSize: '0.82rem', fontWeight: 700 }}>{saveMsg}</div>}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>Carregando...</div>
      ) : (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Presidente — top */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0, position: 'relative' }}>
            <div style={{ width: 220 }}>
              <CargoCard
                cargoKey="presidente"
                membro={editMode ? draft.presidente : data.presidente}
                isEdit={editMode}
                uploadingKey={uploadingKey}
                onNomeChange={v => updateCargo('presidente', v)}
                onTriggerUpload={() => triggerUpload('presidente')}
              />
            </div>
          </div>

          {/* Connector line down */}
          <div style={{ display: 'flex', justifyContent: 'center', height: 32, alignItems: 'stretch' }}>
            <div style={{ width: 2, background: 'rgba(167,139,250,0.3)' }} />
          </div>

          {/* Vice */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
            <div style={{ width: 220 }}>
              <CargoCard
                cargoKey="vice_presidente"
                membro={editMode ? draft.vice_presidente : data.vice_presidente}
                isEdit={editMode}
                uploadingKey={uploadingKey}
                onNomeChange={v => updateCargo('vice_presidente', v)}
                onTriggerUpload={() => triggerUpload('vice_presidente')}
              />
            </div>
          </div>

          {/* Connector lines to row below */}
          <div style={{ display: 'flex', justifyContent: 'center', height: 32, alignItems: 'flex-end', position: 'relative', maxWidth: 700, margin: '0 auto' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: 'rgba(167,139,250,0.2)', margin: '0 80px' }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, width: 2, height: '100%', background: 'rgba(167,139,250,0.2)', transform: 'translateX(-50%)' }} />
            {['secretario', 'tesoureiro', 'coordenador_tecnico_cultural'].map((_, i, arr) => (
              <div key={i} style={{ position: 'absolute', left: `${(i / (arr.length - 1)) * 100}%`, bottom: 0, width: 2, height: 16, background: 'rgba(167,139,250,0.2)', transform: 'translateX(-50%)' }} />
            ))}
          </div>

          {/* Secretário, Tesoureiro, Coordenador */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, maxWidth: 700, margin: '0 auto 28px' }}>
            {(['secretario', 'tesoureiro', 'coordenador_tecnico_cultural'] as const).map(cargo => (
              <CargoCard
                key={cargo}
                cargoKey={cargo}
                membro={editMode ? (draft as any)[cargo] : (data as any)[cargo]}
                isEdit={editMode}
                uploadingKey={uploadingKey}
                onNomeChange={v => updateCargo(cargo, v)}
                onTriggerUpload={() => triggerUpload(cargo)}
              />
            ))}
          </div>

          {/* Conselho Fiscal */}
          <div style={{ marginTop: 10 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 20, padding: '5px 18px', color: '#fbbf24', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Conselho Fiscal
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              {(editMode ? draft : data).conselho_fiscal.map((m, idx) => (
                <div key={m.id || idx} style={{ background: 'rgba(234,179,8,0.07)', border: '2px solid rgba(234,179,8,0.25)', borderRadius: 14, padding: '14px', width: 150, textAlign: 'center', position: 'relative' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    {m.foto_url
                      ? <img src={m.foto_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(234,179,8,0.6)' }} />
                      : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(234,179,8,0.1)', border: '2px solid rgba(234,179,8,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', margin: '0 auto' }}>👤</div>
                    }
                    {editMode && (
                      <button onClick={() => triggerUpload(`conselho_fiscal_${idx}`)}
                        style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: '#ca8a04', border: '2px solid #fff', cursor: 'pointer', fontSize: '0.6rem' }}>📷</button>
                    )}
                  </div>
                  {editMode ? (
                    <>
                      <input
                        value={m.nome}
                        onChange={e => {
                          const val = e.target.value;
                          setDraft(prev => {
                            const cf = [...prev.conselho_fiscal];
                            cf[idx] = { ...cf[idx], nome: val };
                            return { ...prev, conselho_fiscal: cf };
                          });
                        }}
                        placeholder="Nome"
                        style={{ marginTop: 8, width: '100%', padding: '5px 8px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#60a5fa', fontWeight: 700, fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <button onClick={() => setDraft(prev => ({ ...prev, conselho_fiscal: prev.conselho_fiscal.filter((_, i) => i !== idx) }))}
                        style={{ marginTop: 6, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.68rem' }}>Remover</button>
                    </>
                  ) : (
                    <div style={{ marginTop: 8, fontWeight: 700, fontSize: '0.82rem', color: '#fbbf24' }}>{m.nome || '—'}</div>
                  )}
                </div>
              ))}
              {editMode && (
                <button onClick={() => setDraft(prev => ({ ...prev, conselho_fiscal: [...prev.conselho_fiscal, { id: `cf_${Date.now()}`, nome: '', foto_url: null }] }))}
                  style={{ width: 150, height: 150, borderRadius: 14, border: '2px dashed rgba(234,179,8,0.3)', background: 'transparent', color: 'rgba(234,179,8,0.5)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700 }}>
                  <span style={{ fontSize: '1.5rem' }}>+</span>
                  Adicionar membro
                </button>
              )}
              {!editMode && (data.conselho_fiscal || []).length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', padding: '20px 0' }}>Nenhum membro cadastrado</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin modal */}
      {showAdminModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
          onClick={() => setShowAdminModal(false)}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', fontWeight: 800, margin: '0 0 6px', fontSize: '1rem' }}>🔒 Acesso Administrativo</h3>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', margin: '0 0 14px' }}>Somente o Administrador Geral pode editar o organograma.</p>
            <input type="password" value={adminCpf} onChange={e => setAdminCpf(e.target.value.replace(/\D/g,''))}
              onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
              placeholder="CPF do administrador" autoFocus
              style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
            {adminErr && <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: 8 }}>{adminErr}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdminModal(false); setAdminCpf(''); setAdminErr(''); }} style={{ flex: 1, padding: '9px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
              <button onClick={handleAdminLogin} style={{ flex: 2, padding: '9px', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>Entrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
