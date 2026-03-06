'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { registerCheckin, getCheckins } from '@/lib/checkins';
import { capturarGPS, detectarLocal, LocalDetectado, LOCAIS } from '@/lib/locais';
import Link from 'next/link';

interface Student {
  id: string;
  nome_completo: string;
  cpf: string;
  graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
  telefone: string;
  email?: string;
}

export default function PresencaPage() {
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [filtered, setFiltered] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState<{ student: Student; hora: string; data: string; localDetectado: LocalDetectado | null } | null>(null);
  const [registeredToday, setRegisteredToday] = useState<Set<string>>(new Set());

  // Localização
  const [localDetectado, setLocalDetectado] = useState<LocalDetectado | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'buscando' | 'ok' | 'erro' | 'negado'>('idle');
  const [coordsRaw, setCoordsRaw] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    fetchStudents();
    loadTodayCheckins();
    iniciarGPS();
  }, []);

  const iniciarGPS = async () => {
    setGpsStatus('buscando');
    try {
      const pos = await capturarGPS();
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoordsRaw({ lat, lng });
      const det = detectarLocal(lat, lng);
      setLocalDetectado(det);
      setGpsStatus('ok');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('denied') || msg.toLowerCase().includes('negar') || (e as GeolocationPositionError)?.code === 1) {
        setGpsStatus('negado');
      } else {
        setGpsStatus('erro');
      }
    }
  };

  const loadTodayCheckins = async () => {
    const brDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const today = `${brDate.getFullYear()}-${String(brDate.getMonth()+1).padStart(2,'0')}-${String(brDate.getDate()).padStart(2,'0')}`;
    const records = await getCheckins(today);
    if (records.length > 0) {
      setRegisteredToday(new Set(records.map(r => r.student_id)));
    }
  };

  useEffect(() => {
    if (!search.trim()) { setFiltered([]); return; }
    const q = search.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    setFiltered(students.filter(s => {
      const nomeMatch = s.nome_completo.toLowerCase().includes(q);
      const cpfDigits = s.cpf.replace(/\D/g, '');
      const cpfMatch = qDigits.length >= 3 && cpfDigits.includes(qDigits);
      return nomeMatch || cpfMatch;
    }).slice(0, 8));
  }, [search, students]);

  const fetchStudents = async () => {
    setLoading(true);
    let { data, error } = await supabase
      .from('students')
      .select('id, nome_completo, cpf, graduacao, nucleo, foto_url, telefone, email')
      .order('nome_completo');
    if (error) {
      const res = await supabase
        .from('students')
        .select('id, nome_completo, cpf, graduacao, nucleo, foto_url, telefone')
        .order('nome_completo');
      data = res.data as typeof data;
    }
    if (data) setStudents(data as Student[]);
    setLoading(false);
  };

  const handleRegistrar = async (student: Student) => {
    if (registering) return;
    setRegistering(true);
    const result = await registerCheckin({
      ...student,
      local_nome: localDetectado?.local.nome ?? null,
      local_endereco: localDetectado?.local.endereco ?? null,
      local_map_url: localDetectado?.local.mapUrl ?? null,
      lat: coordsRaw?.lat ?? null,
      lng: coordsRaw?.lng ?? null,
    });
    setRegistering(false);
    if (result.alreadyRegistered) {
      setRegisteredToday(prev => new Set([...prev, student.id]));
      return;
    }
    if (result.success) {
      const brDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const hora = brDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const data = brDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      setRegisteredToday(prev => new Set([...prev, student.id]));
      setSearch('');
      setFiltered([]);
      setSuccess({ student, hora, data, localDetectado });
    } else {
      alert('Erro ao registrar presença. Tente novamente.');
    }
  };

  const buildWhatsAppLink = (s: typeof success) => {
    if (!s) return '';
    const phone = s.student.telefone.replace(/\D/g, '');
    const br = phone.startsWith('55') ? phone : `55${phone}`;
    const localInfo = s.localDetectado
      ? `\n📍 *Local:* ${s.localDetectado.local.nome}\n🗺 ${s.localDetectado.local.endereco}`
      : '';
    const msg = encodeURIComponent(
`✅ *Presença Registrada!*
Associação Cultural de Capoeira Barão de Mauá

👤 *Aluno:* ${s.student.nome_completo}
🥋 *Graduação:* ${s.student.graduacao}
📍 *Núcleo:* ${s.student.nucleo || '—'}${localInfo}
📅 *Data:* ${s.data}
🕐 *Horário:* ${s.hora}

_Axé! 🤸_`
    );
    return `https://wa.me/${br}?text=${msg}`;
  };

  const buildEmailLink = (s: typeof success) => {
    if (!s) return '';
    const subject = encodeURIComponent('Comprovante de Presença — Capoeira Barão de Mauá');
    const localInfo = s.localDetectado
      ? `\nLocal: ${s.localDetectado.local.nome} — ${s.localDetectado.local.endereco}` : '';
    const body = encodeURIComponent(
`Presença Registrada!
Associação Cultural de Capoeira Barão de Mauá

Aluno: ${s.student.nome_completo}
Graduação: ${s.student.graduacao}
Núcleo: ${s.student.nucleo || '—'}${localInfo}
Data: ${s.data}
Horário: ${s.hora}

Axé!`
    );
    return `mailto:${s.student.email}?subject=${subject}&body=${body}`;
  };

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  // Badge de status do GPS
  const gpsBadge = () => {
    if (gpsStatus === 'buscando') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#f59e0b' }}>
        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
        Detectando localização...
      </div>
    );
    if (gpsStatus === 'ok' && localDetectado) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#16a34a' }}>
        <span>📍</span>
        <span><strong>{localDetectado.local.nome}</strong> — {localDetectado.local.endereco}</span>
        <span style={{ color: 'var(--text-secondary)' }}>({(localDetectado.distKm * 1000).toFixed(0)}m)</span>
      </div>
    );
    if (gpsStatus === 'ok' && !localDetectado) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span>📍</span> GPS detectado — local não identificado
        <button onClick={iniciarGPS} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>Tentar novamente</button>
      </div>
    );
    if (gpsStatus === 'negado') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#f87171' }}>
        <span>⚠</span> GPS bloqueado — localização não será registrada
        <button onClick={iniciarGPS} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>Permitir</button>
      </div>
    );
    if (gpsStatus === 'erro') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#f87171' }}>
        <span>⚠</span> Não foi possível obter localização
        <button onClick={iniciarGPS} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>Tentar novamente</button>
      </div>
    );
    return null;
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #7c3aed 100%)', padding: '28px 20px', textAlign: 'center', position: 'relative' }}>
        <Link href="/" style={{ position: 'absolute', left: 16, top: 18, color: 'rgba(255,255,255,0.85)', textDecoration: 'none', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Voltar
        </Link>
        <img src="/logo.png" alt="Logo" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 10 }} />
        <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Registrar Presença</h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: 6 }}>{hoje}</p>
      </div>

      <div className="container" style={{ maxWidth: 580, marginTop: 28 }}>

        {/* Banner de localização */}
        {gpsStatus !== 'idle' && (
          <div style={{
            background: gpsStatus === 'ok' && localDetectado ? 'rgba(22,163,74,0.08)' : 'rgba(30,30,40,0.5)',
            border: `1px solid ${gpsStatus === 'ok' && localDetectado ? 'rgba(22,163,74,0.25)' : 'var(--border)'}`,
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          }}>
            {gpsBadge()}
          </div>
        )}

        {/* Locais disponíveis */}
        <div className="form-section" style={{ marginBottom: 16 }}>
          <h2 className="form-section-title" style={{ marginBottom: 10 }}>Locais de Treino</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LOCAIS.map(local => (
              <a
                key={local.id}
                href={local.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: localDetectado?.local.id === local.id ? 'rgba(22,163,74,0.1)' : 'var(--bg-input)',
                  border: `1px solid ${localDetectado?.local.id === local.id ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '10px 14px', textDecoration: 'none', color: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>
                  {localDetectado?.local.id === local.id ? '✅' : '📍'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{local.nome}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 1 }}>{local.endereco}</div>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#3b82f6', flexShrink: 0 }}>Ver mapa →</span>
              </a>
            ))}
          </div>
        </div>

        {/* Busca */}
        <div className="form-section">
          <h2 className="form-section-title">Buscar Aluno</h2>
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Digite seu nome ou CPF..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', fontSize: '1rem', padding: '14px 16px 14px 44px' }}
              autoFocus
            />
            <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }}
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>

          {loading && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 16, fontSize: '0.9rem' }}>Carregando...</p>}

          {filtered.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(student => {
                const jaRegistrado = registeredToday.has(student.id);
                return (
                  <div key={student.id} style={{
                    background: 'var(--bg-input)',
                    border: `1px solid ${jaRegistrado ? 'rgba(220,38,38,0.4)' : 'var(--border)'}`,
                    borderRadius: 12, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    {student.foto_url
                      ? <img src={student.foto_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                        </div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{student.nome_completo}</div>
                      <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {student.graduacao} · {student.nucleo || '—'}
                      </div>
                      {jaRegistrado && <div style={{ color: '#f87171', fontSize: '0.79rem', fontWeight: 600, marginTop: 3 }}>⚠ Presença já registrada hoje</div>}
                    </div>
                    <button
                      onClick={() => handleRegistrar(student)}
                      disabled={registering || jaRegistrado}
                      style={{
                        background: jaRegistrado ? 'rgba(220,38,38,0.1)' : 'linear-gradient(135deg,#16a34a,#15803d)',
                        border: jaRegistrado ? '1px solid rgba(220,38,38,0.3)' : 'none',
                        color: jaRegistrado ? '#f87171' : '#fff',
                        padding: '10px 16px', borderRadius: 8,
                        cursor: jaRegistrado ? 'not-allowed' : 'pointer',
                        fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                        opacity: registering ? 0.6 : 1, transition: 'all 0.15s',
                      }}
                    >
                      {registering ? '...' : jaRegistrado ? 'Registrado' : '✓ Registrar'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {search.trim() && filtered.length === 0 && !loading && (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20, fontSize: '0.9rem' }}>Nenhum aluno encontrado.</p>
          )}
        </div>

        <div className="form-section" style={{ background: 'rgba(22,163,74,0.07)', borderColor: 'rgba(22,163,74,0.2)' }}>
          <h2 className="form-section-title" style={{ color: '#16a34a' }}>Como Registrar</h2>
          <ol style={{ color: 'var(--text-secondary)', paddingLeft: 20, lineHeight: 2.2, fontSize: '0.9rem', margin: 0 }}>
            <li>Permita o acesso à <strong>localização</strong> quando solicitado</li>
            <li>Digite seu <strong>nome</strong> ou <strong>CPF</strong> no campo acima</li>
            <li>Clique em <strong>✓ Registrar</strong> ao lado do seu nome</li>
            <li>Envie o comprovante pelo <strong>WhatsApp</strong></li>
          </ol>
        </div>
      </div>

      {/* Modal comprovante */}
      {success && (
        <div className="modal-overlay" onClick={() => setSuccess(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: 4, display: 'block', WebkitTextFillColor: 'var(--text-primary)' }}>Presença Registrada!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 20 }}>Comprovante de Treino</p>

            <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, textAlign: 'left', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                {success.student.foto_url
                  ? <img src={success.student.foto_url} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                    </div>
                }
                <div>
                  <div style={{ fontWeight: 700 }}>{success.student.nome_completo}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{success.student.graduacao} · {success.student.nucleo || '—'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Data</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{success.data}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Horário</div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{success.hora}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Núcleo</div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{success.student.nucleo || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Horário</div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{success.hora}</div>
                </div>
              </div>

              {/* Local */}
              {success.localDetectado && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Local do Treino</div>
                  <a
                    href={success.localDetectado.local.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#3b82f6', textDecoration: 'none' }}
                  >
                    <span>📍</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{success.localDetectado.local.nome}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{success.localDetectado.local.endereco}</div>
                    </div>
                  </a>
                </div>
              )}

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Associação Cultural de Capoeira Barão de Mauá · Axé!
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {success.student.telefone ? (
                <a
                  href={buildWhatsAppLink(success)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#25d366,#128c7e)', border: 'none', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: '0 4px 14px rgba(37,211,102,0.3)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Enviar pelo WhatsApp
                </a>
              ) : (
                <div style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 12, fontSize: '0.82rem', textAlign: 'center' }}>
                  Sem telefone cadastrado
                </div>
              )}

              {success.student.email && success.student.email.trim() ? (
                <a
                  href={buildEmailLink(success)}
                  style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', border: 'none', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                  Enviar por E-mail
                </a>
              ) : null}

              <button
                onClick={() => setSuccess(null)}
                style={{ width: '100%', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
