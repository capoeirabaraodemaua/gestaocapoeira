'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { EnvioRecord, FilaData } from '@/app/api/whatsapp-fila/route';

const MSG = `Olá! 👋

Somos da Associação Cultural de Capoeira Barão de Mauá.

Precisamos que você acesse a área do aluno, crie sua conta e, em seguida, entre novamente com essa conta para finalizar o seu cadastro.

A não realização desse processo impedirá o registro da sua presença nos treinos, o acesso aos seus relatórios individuais e poderá bloquear etapas importantes, inclusive a liberação para o batizado e a troca de graduação, pois é através desse acesso que teremos todo o controle.

Solicitamos que realize esse procedimento o mais breve possível.

Atenciosamente,
Suporte Ginga Gestão.`;

interface Props {
  students: { id: string; nome_completo: string; telefone?: string | null; nucleo?: string | null }[];
  alunoContasIds: Set<string>;
}

const STATUS_LABEL: Record<string, string> = {
  pendente:   '🔴 Pendente',
  enviado:    '🟡 Enviado',
  erro:       '⚫ Erro',
  cadastrado: '🟢 Cadastrado',
};
const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  pendente:   { bg: 'rgba(239,68,68,0.08)',  color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  enviado:    { bg: 'rgba(234,179,8,0.09)',  color: '#92400e', border: 'rgba(234,179,8,0.4)' },
  erro:       { bg: 'rgba(100,116,139,0.1)', color: '#475569', border: 'rgba(100,116,139,0.3)' },
  cadastrado: { bg: 'rgba(22,163,74,0.08)',  color: '#166534', border: 'rgba(22,163,74,0.3)' },
};

function buildWhatsappUrl(telefone: string) {
  const tel = telefone.replace(/\D/g, '');
  const br = tel.startsWith('55') ? tel : `55${tel}`;
  return `https://api.whatsapp.com/send?phone=${br}&text=${encodeURIComponent(MSG)}`;
}

function hasTel(telefone: string) {
  return telefone.replace(/\D/g, '').length >= 10;
}

export default function WhatsappFilaPanel({ students, alunoContasIds }: Props) {
  const [fila, setFila]         = useState<EnvioRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [tab, setTab]           = useState<'fila' | 'historico'>('fila');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const [intervalSec, setIntervalSec] = useState(8);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queuePaused,  setQueuePaused]  = useState(false);
  const [queueIdx,     setQueueIdx]     = useState(0);
  const [queueTotal,   setQueueTotal]   = useState(0);
  const [log, setLog] = useState<{ time: string; msg: string; type: 'info' | 'ok' | 'err' }[]>([]);

  const pausedRef   = useRef(false);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef    = useRef<EnvioRecord[]>([]);   // stable snapshot during run
  const filaRef     = useRef<EnvioRecord[]>([]);   // mirror of fila for callbacks

  filaRef.current = fila;

  const addLog = useCallback((msg: string, type: 'info' | 'ok' | 'err' = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLog(prev => [{ time, msg, type }, ...prev].slice(0, 150));
  }, []);

  // ── Optimistic local update ─────────────────────────────────────────────────
  const updateLocal = useCallback((student_id: string, patch: Partial<EnvioRecord>) => {
    setFila(prev => prev.map(r => r.student_id === student_id ? { ...r, ...patch } : r));
  }, []);

  // ── API helpers ─────────────────────────────────────────────────────────────
  const apiFila = useCallback(async (body: object) => {
    const res = await fetch('/api/whatsapp-fila', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }, []);

  // ── Load fila from server ────────────────────────────────────────────────────
  const loadFila = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/whatsapp-fila', { cache: 'no-store' });
      const data: FilaData = await res.json();
      setFila(data.envios || []);
      setLastUpdate(data.ultima_atualizacao || '');
    } catch {
      addLog('Erro ao carregar fila', 'err');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addLog]);

  // ── Sync fila with students (also marks cadastrados automatically) ──────────
  const syncFila = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    if (!silent) addLog('🔄 Sincronizando fila...', 'info');
    try {
      const semConta = students.filter(s => !alunoContasIds.has(s.id));
      const d = await apiFila({
        action: 'sync',
        students: semConta.map(s => ({
          id: s.id,
          nome_completo: s.nome_completo,
          telefone: s.telefone || '',
          nucleo:   s.nucleo   || '',
        })),
        registered_ids: Array.from(alunoContasIds),
      });
      if (!silent) addLog(`✅ Fila sincronizada — ${d.total} registros`, 'ok');
      await loadFila(true);
    } catch {
      if (!silent) addLog('Erro ao sincronizar', 'err');
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [students, alunoContasIds, apiFila, loadFila, addLog]);

  // ── Check due follow-ups ──────────────────────────────────────────────────
  const checkFollowups = useCallback(async (silent = false) => {
    const d = await apiFila({ action: 'check_followups' });
    if (d.due > 0) {
      addLog(`🔔 ${d.due} aluno(s) marcados para follow-up (24h/48h)`, 'ok');
      await loadFila(true);
    } else if (!silent) {
      addLog('Nenhum follow-up pendente no momento', 'info');
    }
  }, [apiFila, loadFila, addLog]);

  // ── On mount: load → sync → check followups ──────────────────────────────
  useEffect(() => {
    (async () => {
      await loadFila();
      await syncFila(true);
      await checkFollowups(true);
    })();
    // Auto-refresh every 20s (silent)
    const id = setInterval(async () => {
      await loadFila(true);
      await checkFollowups(true);
    }, 20000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mark sent (optimistic + API) ─────────────────────────────────────────
  const markSent = useCallback(async (student_id: string, student_name: string) => {
    const now = new Date().toISOString();
    const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // Optimistic
    updateLocal(student_id, {
      status: 'enviado',
      tentativas: (filaRef.current.find(r => r.student_id === student_id)?.tentativas ?? 0) + 1,
      data_ultimo_envio: now,
      data_primeiro_envio: filaRef.current.find(r => r.student_id === student_id)?.data_primeiro_envio ?? now,
      data_proximo_envio: next24h,
      erro_msg: null,
    });
    // Persist
    await apiFila({ action: 'mark_sent', student_id });
    addLog(`✅ Enviado: ${student_name}`, 'ok');
  }, [apiFila, updateLocal, addLog]);

  const markError = useCallback(async (student_id: string, student_name: string, msg: string) => {
    updateLocal(student_id, { status: 'erro', erro_msg: msg });
    await apiFila({ action: 'mark_error', student_id, msg });
    addLog(`❌ Erro: ${student_name} — ${msg}`, 'err');
  }, [apiFila, updateLocal, addLog]);

  // ── Queue runner (uses ref snapshot — no stale closure) ───────────────────
  const runNext = useCallback(async (idx: number) => {
    const queue = queueRef.current;
    if (pausedRef.current || idx >= queue.length) {
      if (!pausedRef.current && idx >= queue.length) {
        addLog(`🏁 Fila concluída! ${queue.length} mensagens processadas.`, 'ok');
        setQueueRunning(false);
      }
      return;
    }
    setQueueIdx(idx);
    const rec = queue[idx];

    // Skip if already sent (could have been sent manually while queue was running)
    const live = filaRef.current.find(r => r.student_id === rec.student_id);
    if (live && live.status !== 'pendente') {
      addLog(`⏭️ Pulado (já ${live.status}): ${rec.student_name}`, 'info');
      timerRef.current = setTimeout(() => runNext(idx + 1), 800);
      return;
    }

    addLog(`📤 Enviando (${idx + 1}/${queue.length}): ${rec.student_name}`, 'info');
    try {
      window.open(buildWhatsappUrl(rec.telefone), '_blank');
      await markSent(rec.student_id, rec.student_name);
    } catch (e) {
      await markError(rec.student_id, rec.student_name, String(e));
    }

    timerRef.current = setTimeout(() => runNext(idx + 1), intervalSec * 1000);
  }, [addLog, markSent, markError, intervalSec]);

  const startQueue = () => {
    const pending = fila.filter(r => r.status === 'pendente' && hasTel(r.telefone));
    if (pending.length === 0) { addLog('Nenhum aluno pendente com telefone', 'info'); return; }
    queueRef.current = pending;
    pausedRef.current = false;
    setQueuePaused(false);
    setQueueRunning(true);
    setQueueTotal(pending.length);
    setQueueIdx(0);
    addLog(`▶️ Iniciando — ${pending.length} pendentes com intervalo de ${intervalSec}s`, 'info');
    runNext(0);
  };

  const pauseQueue = () => {
    pausedRef.current = true;
    setQueuePaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    addLog('⏸️ Fila pausada', 'info');
  };

  const resumeQueue = () => {
    pausedRef.current = false;
    setQueuePaused(false);
    addLog('▶️ Retomando...', 'info');
    runNext(queueIdx);
  };

  const stopQueue = () => {
    pausedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setQueueRunning(false);
    setQueuePaused(false);
    addLog('⏹️ Fila interrompida', 'info');
  };

  const resetErrors = async () => {
    await apiFila({ action: 'reset_errors' });
    addLog('🔄 Erros resetados para Pendente', 'ok');
    await loadFila(true);
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const stats = {
    total:      fila.length,
    pendente:   fila.filter(r => r.status === 'pendente').length,
    enviado:    fila.filter(r => r.status === 'enviado').length,
    erro:       fila.filter(r => r.status === 'erro').length,
    cadastrado: fila.filter(r => r.status === 'cadastrado').length,
    semTel:     fila.filter(r => r.status === 'pendente' && !hasTel(r.telefone)).length,
  };

  const filaList     = fila.filter(r => r.status === 'pendente');
  const historicoList = fila.filter(r => r.status !== 'pendente').sort((a, b) => {
    const ta = a.data_ultimo_envio || a.data_primeiro_envio || '';
    const tb = b.data_ultimo_envio || b.data_primeiro_envio || '';
    return tb.localeCompare(ta);
  });

  const progress = stats.total > 0
    ? Math.round(((stats.enviado + stats.cadastrado) / stats.total) * 100)
    : 0;
  const queueProgress = queueTotal > 0 ? Math.round((queueIdx / queueTotal) * 100) : 0;

  // ── Render helpers ────────────────────────────────────────────────────────
  const RecordRow = ({ rec }: { rec: EnvioRecord }) => {
    const sc = STATUS_COLOR[rec.status] || STATUS_COLOR.pendente;
    const expanded = expandedId === rec.id;
    const followupDue = rec.status === 'enviado' && rec.data_proximo_envio
      && new Date(rec.data_proximo_envio).getTime() <= Date.now();

    return (
      <div style={{ borderRadius: 10, border: `1px solid ${followupDue ? '#f59e0b' : sc.border}`, background: followupDue ? 'rgba(245,158,11,0.05)' : sc.bg, marginBottom: 6, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }}
          onClick={() => setExpandedId(expanded ? null : rec.id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rec.student_name}
              {followupDue && <span style={{ marginLeft: 6, fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>FOLLOW-UP</span>}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{rec.telefone || '📵 sem telefone'}</span>
              <span>·</span>
              <span>{rec.nucleo || '—'}</span>
              <span>·</span>
              <span>{rec.tentativas} envio{rec.tentativas !== 1 ? 's' : ''}</span>
              {rec.data_ultimo_envio && (
                <><span>·</span><span>Último: {new Date(rec.data_ultimo_envio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></>
              )}
            </div>
          </div>
          <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 800, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {STATUS_LABEL[rec.status]}
          </span>
          {rec.status === 'pendente' && hasTel(rec.telefone) && (
            <a href={buildWhatsappUrl(rec.telefone)} target="_blank" rel="noopener noreferrer"
              onClick={async e => { e.stopPropagation(); await markSent(rec.student_id, rec.student_name); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'linear-gradient(135deg,#25d366,#128c7e)', color: '#fff', borderRadius: 7, padding: '4px 10px', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
              📱 Enviar
            </a>
          )}
          {(rec.status === 'enviado' && rec.tentativas < 3) && hasTel(rec.telefone) && (
            <a href={buildWhatsappUrl(rec.telefone)} target="_blank" rel="noopener noreferrer"
              onClick={async e => { e.stopPropagation(); await markSent(rec.student_id, rec.student_name); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(245,158,11,0.15)', color: '#92400e', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 7, padding: '4px 10px', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
              🔄 Reenviar
            </a>
          )}
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>

        {expanded && (
          <div style={{ borderTop: `1px solid ${sc.border}`, padding: '10px 12px', background: 'var(--bg-card)' }}>
            {rec.erro_msg && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 10px', fontSize: '0.75rem', color: '#dc2626', marginBottom: 8 }}>
                ❌ {rec.erro_msg}
              </div>
            )}
            {rec.data_proximo_envio && rec.status === 'enviado' && (
              <div style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: '0.75rem', color: '#7c3aed', marginBottom: 8, fontWeight: 600 }}>
                🔔 Próximo follow-up: {new Date(rec.data_proximo_envio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {rec.tentativas >= 3 && ' — máx. tentativas atingido'}
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Histórico de envios
            </div>
            {rec.historico.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum envio registrado.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...rec.historico].reverse().map((h, i) => {
                  const hsc = STATUS_COLOR[h.status] || STATUS_COLOR.pendente;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', padding: '4px 8px', background: hsc.bg, borderRadius: 6, border: `1px solid ${hsc.border}` }}>
                      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(h.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontWeight: 700, color: hsc.color }}>{STATUS_LABEL[h.status] || h.status}</span>
                      {h.msg && <span style={{ color: 'var(--text-secondary)' }}>{h.msg}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 32, borderTop: '2px solid var(--border)', paddingTop: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.3rem' }}>📲</span>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Fila de Envio WhatsApp</span>
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 2, marginLeft: 34 }}>
            Gestão de mensagens para alunos sem cadastro
            {lastUpdate && ` · Última atualização: ${new Date(lastUpdate).toLocaleTimeString('pt-BR')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => checkFollowups(false)}
            style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(139,92,246,0.12)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.3)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
            🔔 Verificar Follow-ups
          </button>
          <button onClick={() => syncFila(false)} disabled={syncing}
            style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(29,78,216,0.12)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.3)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, opacity: syncing ? 0.6 : 1 }}>
            {syncing ? '⟳ Sincronizando...' : '🔄 Sincronizar'}
          </button>
          <button onClick={() => loadFila(false)} disabled={loading}
            style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
            ↻ Recarregar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Total',      v: stats.total,      icon: '📋', color: '#1d4ed8', bg: 'rgba(29,78,216,0.07)',    tab: undefined },
          { label: 'Pendente',   v: stats.pendente,   icon: '🔴', color: '#dc2626', bg: 'rgba(239,68,68,0.07)',    tab: 'fila' },
          { label: 'Enviado',    v: stats.enviado,    icon: '🟡', color: '#92400e', bg: 'rgba(234,179,8,0.07)',    tab: 'historico' },
          { label: 'Erro',       v: stats.erro,       icon: '⚫', color: '#475569', bg: 'rgba(100,116,139,0.07)', tab: 'historico' },
          { label: 'Cadastrado', v: stats.cadastrado, icon: '🟢', color: '#166534', bg: 'rgba(22,163,74,0.07)',    tab: 'historico' },
          { label: 'Sem tel.',   v: stats.semTel,     icon: '📵', color: '#d97706', bg: 'rgba(217,119,6,0.07)',    tab: 'fila' },
        ].map(s => (
          <div key={s.label}
            onClick={() => s.tab && setTab(s.tab as any)}
            style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 10, padding: '10px 12px', cursor: s.tab ? 'pointer' : 'default' }}>
            <div style={{ fontSize: '1rem', marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: '1.35rem', color: s.color, lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 3, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Progresso Geral</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {stats.enviado + stats.cadastrado} / {stats.total} mensagens enviadas ({progress}%)
          </span>
        </div>
        <div style={{ height: 10, background: 'var(--bg-input)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#25d366,#128c7e)', borderRadius: 6, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Queue controls */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid rgba(37,211,102,0.3)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 12 }}>⚙️ Controle da Fila Automática</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {!queueRunning ? (
            <button onClick={startQueue}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderRadius: 9, background: 'linear-gradient(135deg,#25d366,#128c7e)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem', boxShadow: '0 2px 14px rgba(37,211,102,0.3)' }}>
              ▶️ Iniciar Envio em Massa <span style={{ opacity: 0.85, fontSize: '0.78rem' }}>({stats.pendente} pendentes)</span>
            </button>
          ) : (
            <>
              {!queuePaused
                ? <button onClick={pauseQueue}  style={{ padding: '9px 18px', borderRadius: 8, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>⏸️ Pausar</button>
                : <button onClick={resumeQueue} style={{ padding: '9px 18px', borderRadius: 8, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>▶️ Retomar</button>
              }
              <button onClick={stopQueue} style={{ padding: '9px 18px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>⏹️ Parar</button>
            </>
          )}
          <button onClick={resetErrors}
            style={{ padding: '9px 16px', borderRadius: 8, background: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
            🔄 Reenviar Falhas
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Intervalo:</span>
            <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.78rem' }}>
              {[3, 5, 8, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v}s</option>)}
            </select>
          </div>
        </div>

        {queueRunning && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 5, color: 'var(--text-secondary)' }}>
              <span>Processando {queueIdx + 1} de {queueTotal}...</span>
              <span>{queueProgress}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 4 }}>
              <div style={{ height: '100%', width: `${queueProgress}%`, background: '#25d366', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            {queueRef.current[queueIdx] && (
              <div style={{ marginTop: 5, fontSize: '0.75rem', color: '#25d366', fontWeight: 600 }}>
                📤 {queueRef.current[queueIdx]?.student_name}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs: Fila Pendente | Histórico */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid var(--border)' }}>
        {([
          { key: 'fila',      label: `🔴 Fila Pendente (${filaList.length})` },
          { key: 'historico', label: `📋 Histórico de Envios (${historicoList.length})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', borderBottom: tab === t.key ? '2.5px solid #1d4ed8' : '2.5px solid transparent', color: tab === t.key ? '#1d4ed8' : 'var(--text-secondary)', marginBottom: -2, transition: 'all 0.12s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px', marginBottom: 18 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Carregando...</div>
        ) : tab === 'fila' ? (
          filaList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#16a34a', fontSize: '0.9rem', fontWeight: 600 }}>
              ✅ Nenhum aluno pendente! Todos já receberam a mensagem.
            </div>
          ) : (
            <>
              {stats.semTel > 0 && (
                <div style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '0.78rem', color: '#d97706', fontWeight: 600 }}>
                  📵 {stats.semTel} aluno(s) sem telefone cadastrado — não serão incluídos na fila automática
                </div>
              )}
              <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filaList.map(rec => <RecordRow key={rec.id} rec={rec} />)}
              </div>
            </>
          )
        ) : (
          historicoList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Nenhum envio registrado ainda. Inicie a fila para começar.
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {historicoList.map(rec => <RecordRow key={rec.id} rec={rec} />)}
            </div>
          )
        )}
      </div>

      {/* Execution log */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.76rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>📟 Log de Execução</span>
          <button onClick={() => setLog([])} style={{ background: 'transparent', border: '1px solid #334155', color: '#64748b', borderRadius: 5, padding: '2px 8px', fontSize: '0.68rem', cursor: 'pointer' }}>Limpar</button>
        </div>
        <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {log.length === 0
            ? <span style={{ fontSize: '0.72rem', color: '#334155', fontStyle: 'italic' }}>Aguardando eventos...</span>
            : log.map((l, i) => (
                <div key={i} style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: l.type === 'ok' ? '#4ade80' : l.type === 'err' ? '#f87171' : '#94a3b8' }}>
                  <span style={{ color: '#334155', marginRight: 8 }}>[{l.time}]</span>{l.msg}
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}
