'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { registerCheckin, getCheckins } from '@/lib/checkins';
import { capturarGPS, iniciarWatchGPS, detectarLocal, LocalDetectado, LOCAIS } from '@/lib/locais';
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
  const [success, setSuccess] = useState<{ student: Student; hora: string; data: string; localDetectado: LocalDetectado | null; coords: { lat: number; lng: number; accuracy: number } | null } | null>(null);
  const [registeredToday, setRegisteredToday] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<Array<{ student: Student; date: string; hora: string; localNome: string | null; lat: number | null; lng: number | null; localEndereco: string | null; localMapUrl: string | null }>>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: number; fail: number } | null>(null);

  // Localização
  const [localDetectado, setLocalDetectado] = useState<LocalDetectado | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'buscando' | 'ok' | 'erro' | 'negado'>('idle');
  const [coordsRaw, setCoordsRaw] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [manualLocal, setManualLocal] = useState<typeof LOCAIS[0] | null>(null);
  const watchIdRef = useRef<number>(-1);

  const OFFLINE_QUEUE_KEY   = 'accbm_offline_checkins';
  const STUDENTS_CACHE_KEY  = 'accbm_students_cache';
  const CHECKINS_CACHE_KEY  = 'accbm_checkins_today_cache';

  useEffect(() => {
    // Load offline queue from localStorage immediately (before network)
    try {
      const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (saved) setOfflineQueue(JSON.parse(saved));
    } catch {}
    // Load cached students immediately so offline users can search right away
    try {
      const cached = localStorage.getItem(STUDENTS_CACHE_KEY);
      if (cached) setStudents(JSON.parse(cached));
    } catch {}
    // Load cached today checkins
    try {
      const cachedCheckins = localStorage.getItem(CHECKINS_CACHE_KEY);
      if (cachedCheckins) {
        const ids: string[] = JSON.parse(cachedCheckins);
        setRegisteredToday(new Set(ids));
      }
    } catch {}

    fetchStudents();
    loadTodayCheckins();
    iniciarGPS();

    // Listen for online/offline events
    const handleOnline = () => { setIsOnline(true); };
    const handleOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      // Para o watch GPS ao desmontar
      if (watchIdRef.current >= 0) navigator.geolocation?.clearWatch(watchIdRef.current);
    };
  }, []);

  const atualizarGPS = (pos: GeolocationPosition) => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    setCoordsRaw({ lat, lng, accuracy });
    const det = detectarLocal(lat, lng);
    setLocalDetectado(det);
    setGpsStatus('ok');
  };

  const iniciarGPS = async () => {
    setGpsStatus('buscando');
    // Para qualquer watch anterior
    if (watchIdRef.current >= 0) navigator.geolocation?.clearWatch(watchIdRef.current);

    try {
      // Primeira leitura imediata para exibir o local rápido
      const pos = await capturarGPS(30000);
      atualizarGPS(pos);
    } catch (e: unknown) {
      const err = e as GeolocationPositionError;
      if (err?.code === 1) {
        setGpsStatus('negado');
      } else {
        setGpsStatus('erro');
      }
      return;
    }

    // Inicia atualização contínua — GPS será sempre o mais preciso disponível
    const wid = iniciarWatchGPS(
      atualizarGPS,
      (err) => {
        if (err.code === 1) setGpsStatus('negado');
        // Em caso de outros erros no watch, mantém a última leitura válida
      },
    );
    watchIdRef.current = wid;
  };

  const getTodayKey = () => {
    const brDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${brDate.getFullYear()}-${String(brDate.getMonth()+1).padStart(2,'0')}-${String(brDate.getDate()).padStart(2,'0')}`;
  };

  const loadTodayCheckins = async () => {
    const today = getTodayKey();
    try {
      const records = await getCheckins(today);
      // Merge server records with offline queue for today
      const serverIds = records.map((r: { student_id: string }) => r.student_id);
      let offlineIds: string[] = [];
      try {
        const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
        if (saved) {
          const queue: Array<{ student: Student; date: string }> = JSON.parse(saved);
          offlineIds = queue.filter(q => q.date === today).map(q => q.student.id);
        }
      } catch {}
      const allIds = [...new Set([...serverIds, ...offlineIds])];
      setRegisteredToday(new Set(allIds));
      try { localStorage.setItem(CHECKINS_CACHE_KEY, JSON.stringify(allIds)); } catch {}
    } catch {
      // Offline: keep whatever is in state from cache + queue
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
    try {
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
      if (data) {
        setStudents(data as Student[]);
        // Persist to localStorage so offline searches work next time
        try { localStorage.setItem(STUDENTS_CACHE_KEY, JSON.stringify(data)); } catch {}
      }
    } catch {
      // Offline — already loaded from cache in useEffect
    }
    setLoading(false);
  };

  const syncOfflineQueue = async (queue: typeof offlineQueue) => {
    if (!queue.length) return;
    setSyncing(true);
    let ok = 0; let fail = 0;
    const remaining: typeof offlineQueue = [];
    for (const item of queue) {
      try {
        const res = await fetch('/api/checkins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student: { id: item.student.id, nome_completo: item.student.nome_completo, graduacao: item.student.graduacao, nucleo: item.student.nucleo, foto_url: item.student.foto_url, local_nome: item.localNome, local_endereco: item.localEndereco, local_map_url: item.localMapUrl, lat: item.lat, lng: item.lng },
            date: item.date,
          }),
        });
        if (res.ok) { ok++; } else { fail++; remaining.push(item); }
      } catch { fail++; remaining.push(item); }
    }
    setOfflineQueue(remaining);
    try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining)); } catch {}
    setSyncing(false);
    setSyncResult({ ok, fail });
    setTimeout(() => setSyncResult(null), 5000);
    if (ok > 0) loadTodayCheckins();
  };

  // Auto-sync when going back online
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      syncOfflineQueue(offlineQueue);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const handleRegistrar = async (student: Student) => {
    if (registering) return;
    setRegistering(true);

    const brDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hora = brDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dataStr = brDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const dateKey = `${brDate.getFullYear()}-${String(brDate.getMonth()+1).padStart(2,'0')}-${String(brDate.getDate()).padStart(2,'0')}`;

    // ── Captura GPS fresco no ato do registro ──────────────────────────────
    let coords: { lat: number; lng: number; accuracy: number } | null = null;
    let local = localDetectado;

    // Se GPS está habilitado, tenta captura fresca no momento exato do registro
    if (gpsStatus !== 'negado') {
      try {
        const pos = await capturarGPS(20000);
        coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        const det = detectarLocal(coords.lat, coords.lng);
        local = det;
        setCoordsRaw(coords);
        setLocalDetectado(local);
        setGpsStatus('ok');
      } catch {
        // GPS indisponível — usa última leitura do watchPosition se disponível
        coords = coordsRaw;
      }
    }

    // Se GPS foi bloqueado mas o aluno selecionou manualmente o local, usa as coords fixas do local
    if (!coords && manualLocal) {
      coords = { lat: manualLocal.lat, lng: manualLocal.lng, accuracy: 0 };
      const det = detectarLocal(coords.lat, coords.lng, 5000);
      local = det ?? null;
    }

    // Se tem coords mas nenhum local dentro de 200m, tenta ampliar para 1km para exibição
    if (coords && !local) {
      local = detectarLocal(coords.lat, coords.lng, 1000) ?? null;
    }

    if (!navigator.onLine) {
      // Salva na fila offline com as coordenadas capturadas
      const gpsMapUrlOffline = coords
        ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
        : null;
      const entry = {
        student, date: dateKey, hora,
        localNome: local?.local.nome ?? null,
        localEndereco: local?.local.endereco ?? null,
        localMapUrl: local?.local.mapUrl ?? gpsMapUrlOffline,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      };
      const newQueue = [...offlineQueue.filter(q => !(q.student.id === student.id && q.date === dateKey)), entry];
      setOfflineQueue(newQueue);
      try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(newQueue)); } catch {}
      setRegistering(false);
      setRegisteredToday(prev => new Set([...prev, student.id]));
      setSearch('');
      setFiltered([]);
      setSuccess({ student, hora, data: dataStr, localDetectado: local, coords });
      return;
    }

    // Build Google Maps URL from real GPS coords when available
    const gpsMapUrl = coords
      ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
      : null;

    const result = await registerCheckin({
      ...student,
      local_nome: local?.local.nome ?? null,
      local_endereco: local?.local.endereco ?? null,
      // Prefer venue map URL; fall back to real GPS coords map URL
      local_map_url: local?.local.mapUrl ?? gpsMapUrl,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
    setRegistering(false);
    if (result.alreadyRegistered) {
      setRegisteredToday(prev => new Set([...prev, student.id]));
      return;
    }
    if (result.success) {
      setRegisteredToday(prev => new Set([...prev, student.id]));
      setSearch('');
      setFiltered([]);
      setSuccess({ student, hora, data: dataStr, localDetectado: local, coords });
    } else {
      alert('Erro ao registrar presença. Tente novamente.');
    }
  };

  const buildWhatsAppLink = (s: typeof success) => {
    if (!s) return '';
    const phone = s.student.telefone.replace(/\D/g, '');
    const br = phone.startsWith('55') ? phone : `55${phone}`;

    // Prioriza as coordenadas FIXAS do local de treino confirmado (preciso e correto)
    // Usa GPS bruto só como fallback quando não há local de treino identificado
    const loc = s.localDetectado?.local ?? null;
    const mapsLat = loc ? loc.lat : s.coords?.lat;
    const mapsLng = loc ? loc.lng : s.coords?.lng;

    let localInfo = '';
    if (loc && mapsLat !== undefined && mapsLng !== undefined) {
      const mapsLink = `https://maps.google.com/?q=${mapsLat},${mapsLng}`;
      localInfo =
        `\n🏟 *Local:* ${loc.nome}` +
        `\n🗺 *Endereço:* ${loc.endereco}` +
        `\n🔗 ${mapsLink}`;
    } else if (s.coords) {
      const mapsLink = `https://maps.google.com/?q=${s.coords.lat},${s.coords.lng}`;
      localInfo =
        `\n📡 *GPS:* ${s.coords.lat.toFixed(6)}, ${s.coords.lng.toFixed(6)}` +
        `\n🔗 ${mapsLink}`;
    }

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
    const loc = s.localDetectado?.local ?? null;
    let localInfo = '';
    if (loc) {
      const mapsLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
      localInfo = `\nLocal: ${loc.nome} — ${loc.endereco}` +
        `\nMapa: ${mapsLink}`;
    } else if (s.coords) {
      localInfo = `\nGPS: ${s.coords.lat.toFixed(6)}, ${s.coords.lng.toFixed(6)}` +
        `\nMapa: https://maps.google.com/?q=${s.coords.lat},${s.coords.lng}`;
    }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#16a34a', flexWrap: 'wrap' }}>
        <span>📍</span>
        <div>
          <span><strong>{localDetectado.local.nome}</strong> — {localDetectado.local.endereco}</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{Math.round(localDetectado.distMetros)}m do local</span>
            {coordsRaw && (
              <span style={{ color: '#3b82f6' }}>
                precisão ±{Math.round(coordsRaw.accuracy)}m
                {coordsRaw.accuracy <= 20 ? ' ✓ excelente' : coordsRaw.accuracy <= 50 ? ' ✓ boa' : coordsRaw.accuracy <= 100 ? ' razoável' : ' baixa'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
    if (gpsStatus === 'ok' && !localDetectado) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span>📍</span>
        <div>
          <span>GPS detectado — fora do raio dos locais cadastrados</span>
          {coordsRaw && (
            <div style={{ fontSize: '0.72rem', color: '#3b82f6', marginTop: 2 }}>
              {coordsRaw.lat.toFixed(6)}, {coordsRaw.lng.toFixed(6)} · precisão ±{Math.round(coordsRaw.accuracy)}m
            </div>
          )}
        </div>
        <button onClick={iniciarGPS} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline', flexShrink: 0 }}>Atualizar</button>
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

        {/* Offline banner */}
        {!isOnline && (
          <div style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.5)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📶</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#b45309' }}>Sem conexão com internet</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Presenças serão salvas localmente e sincronizadas automaticamente quando a conexão for restaurada.</div>
            </div>
          </div>
        )}

        {/* Pending offline queue banner */}
        {offlineQueue.length > 0 && isOnline && (
          <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>☁️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1d4ed8' }}>{syncing ? 'Sincronizando...' : `${offlineQueue.length} presença(s) pendente(s) de sync`}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Registradas offline e aguardando envio ao servidor.</div>
            </div>
            {!syncing && (
              <button onClick={() => syncOfflineQueue(offlineQueue)} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#1d4ed8', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                Sincronizar
              </button>
            )}
          </div>
        )}

        {/* Sync result toast */}
        {syncResult && (
          <div style={{ background: syncResult.fail === 0 ? 'rgba(22,163,74,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${syncResult.fail === 0 ? 'rgba(22,163,74,0.4)' : 'rgba(251,191,36,0.4)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem', fontWeight: 700, color: syncResult.fail === 0 ? '#16a34a' : '#b45309' }}>
            {syncResult.fail === 0 ? `✅ ${syncResult.ok} presença(s) sincronizada(s) com sucesso!` : `⚠ ${syncResult.ok} sincronizada(s), ${syncResult.fail} falhou. Tente novamente.`}
          </div>
        )}

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 className="form-section-title" style={{ margin: 0 }}>Locais de Treino</h2>
            {(gpsStatus === 'negado' || gpsStatus === 'erro') && !manualLocal && (
              <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>
                👇 Selecione seu local abaixo
              </span>
            )}
            {manualLocal && (
              <button
                onClick={() => setManualLocal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Limpar seleção
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LOCAIS.map(loc => {
              const isAutoDetected = localDetectado?.local.id === loc.id;
              const isManualSelected = manualLocal?.id === loc.id;
              const isActive = isAutoDetected || isManualSelected;
              const showSelectBtn = (gpsStatus === 'negado' || gpsStatus === 'erro') && !isAutoDetected;
              return (
                <div
                  key={loc.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isActive ? 'rgba(22,163,74,0.1)' : 'var(--bg-input)',
                    border: `1px solid ${isActive ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '10px 14px',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>
                    {isActive ? '✅' : '📍'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{loc.nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 1 }}>{loc.endereco}</div>
                    {isManualSelected && !isAutoDetected && (
                      <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600, marginTop: 2 }}>✓ Local selecionado manualmente</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 }}>
                    <a
                      href={loc.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.7rem', color: '#3b82f6', textDecoration: 'none' }}
                    >
                      Ver mapa →
                    </a>
                    {showSelectBtn && (
                      <button
                        onClick={() => setManualLocal(isManualSelected ? null : loc)}
                        style={{
                          background: isManualSelected ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.15)',
                          border: `1px solid ${isManualSelected ? 'rgba(220,38,38,0.4)' : 'rgba(22,163,74,0.4)'}`,
                          color: isManualSelected ? '#f87171' : '#16a34a',
                          padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                          fontWeight: 700, fontSize: '0.72rem',
                        }}
                      >
                        {isManualSelected ? 'Desmarcar' : 'Estou aqui'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: !isOnline ? 8 : 20 }}>Comprovante de Treino</p>
            {!isOnline && (
              <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 8, padding: '7px 12px', marginBottom: 16, fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>
                📶 Salva offline — será sincronizada automaticamente quando a internet retornar
              </div>
            )}

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
              {(success.localDetectado || success.coords) && (() => {
                const loc = success.localDetectado?.local ?? null;
                // Sempre usa as coords fixas do local de treino para o mapa — são precisas e corretas
                const mapLat = loc ? loc.lat : success.coords?.lat;
                const mapLng = loc ? loc.lng : success.coords?.lng;
                const mapsHref = mapLat !== undefined && mapLng !== undefined
                  ? `https://maps.google.com/?q=${mapLat},${mapLng}`
                  : null;
                return (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Local do Treino</div>
                    {loc ? (
                      <a
                        href={mapsHref ?? loc.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#3b82f6', textDecoration: 'none' }}
                      >
                        <span>📍</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{loc.nome}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{loc.endereco}</div>
                          <div style={{ fontSize: '0.72rem', color: '#3b82f6', marginTop: 2 }}>Ver no Google Maps →</div>
                        </div>
                      </a>
                    ) : success.coords ? (
                      <a
                        href={mapsHref!}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#3b82f6', textDecoration: 'none' }}
                      >
                        <span>📡</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Localização capturada</div>
                          <div style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                            {success.coords.lat.toFixed(6)}, {success.coords.lng.toFixed(6)} · Ver no Google Maps →
                          </div>
                        </div>
                      </a>
                    ) : null}
                  </div>
                );
              })()}

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
