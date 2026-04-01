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
  students: { id: string; nome_completo: string; telefone?: string; nucleo?: string }[];
  alunoContasIds: Set<string>;
}

const STATUS_LABEL: Record<string, string> = {
  pendente: '🔴 Pendente',
  enviado: '🟡 Enviado',
  erro: '⚫ Erro',
  cadastrado: '🟢 Cadastrado',
};

const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  pendente:   { bg: 'rgba(239,68,68,0.08)',   color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  enviado:    { bg: 'rgba(234,179,8,0.08)',   color: '#92400e', border: 'rgba(234,179,8,0.35)' },
  erro:       { bg: 'rgba(100,116,139,0.1)',  color: '#475569', border: 'rgba(100,116,139,0.3)' },
  cadastrado: { bg: 'rgba(22,163,74,0.08)',   color: '#166534', border: 'rgba(22,163,74,0.3)' },
};

export default function WhatsappFilaPanel({ students, alunoContasIds }: Props) {
  const [fila, setFila] = useState<EnvioRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [interval, setIntervalSec] = useState(8);
  const [log, setLog] = useState<{ time: string; msg: string; type: 'info' | 'ok' | 'err' }[]>([]);
  const [filterStatus, setFilterStatus] = useState<'todos' | 'pendente' | 'enviado' | 'erro' | 'cadastrado'>('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLog(prev => [{ time, msg, type }, ...prev].slice(0, 100));
  };

  const loadFila = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp-fila');
      const data: FilaData = await res.json();
      setFila(data.envios || []);
      setLastUpdate(data.ultima_atualizacao || '');
    } catch (e) {
      addLog('Erro ao carregar fila', 'err');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    loadFila();
    const id = setInterval(loadFila, 15000);
    return () => clearInterval(id);
  }, [loadFila]);

  // Sync fila with current student list
  const syncFila = async () => {
    setSyncing(true);
    addLog('Sincronizando fila com lista de alunos...', 'info');
    try {
      const semConta = students.filter(s => !alunoContasIds.has(s.id));
      const res = await fetch('/api/whatsapp-fila', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          students: semConta.map(s => ({
            id: s.id,
            nome_completo: s.nome_completo,
            telefone: s.telefone || '',
            nucleo: s.nucleo || '',
          })),
          registered_ids: Array.from(alunoContasIds),
        }),
      });
      const d = await res.json();
      addLog(`✅ Fila sincronizada — ${d.total} registros`, 'ok');
      await loadFila();
    } catch {
      addLog('Erro ao sincronizar fila', 'err');
    } finally {
      setSyncing(false);
    }
  };

  // Mark a student as sent via API
  const markSent = async (student_id: string) => {
    await fetch('/api/whatsapp-fila', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_sent', student_id }),
    });
  };

  const markError = async (student_id: string, msg: string) => {
    await fetch('/api/whatsapp-fila', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_error', student_id, msg }),
    });
  };

  // Queue runner
  const pendingQueue = fila.filter(r => r.status === 'pendente' && r.telefone.replace(/\D/g, '').length >= 10);

  const sendOne = useCallback(async (rec: EnvioRecord) => {
    const tel = rec.telefone.replace(/\D/g, '');
    const br = tel.startsWith('55') ? tel : `55${tel}`;
    const url = `https://api.whatsapp.com/send?phone=${br}&text=${encodeURIComponent(MSG)}`;
    try {
      window.open(url, '_blank');
      await markSent(rec.student_id);
      addLog(`✅ Enviado: ${rec.student_name}`, 'ok');
      return true;
    } catch (e) {
      await markError(rec.student_id, String(e));
      addLog(`❌ Erro: ${rec.student_name}`, 'err');
      return false;
    }
  }, []);

  const runQueue = useCallback(async (queue: EnvioRecord[], idx: number) => {
    if (pausedRef.current || idx >= queue.length) {
      if (idx >= queue.length) {
        addLog(`🏁 Fila concluída! ${queue.length} mensagens processadas.`, 'ok');
        setQueueRunning(false);
      }
      return;
    }
    setCurrentIdx(idx);
    const rec = queue[idx];
    addLog(`📤 Enviando (${idx + 1}/${queue.length}): ${rec.student_name}`, 'info');
    await sendOne(rec);
    await loadFila();

    timerRef.current = setTimeout(() => {
      runQueue(queue, idx + 1);
    }, interval * 1000);
  }, [sendOne, interval, loadFila]);

  const startQueue = () => {
    if (pendingQueue.length === 0) {
      addLog('Nenhum aluno pendente na fila', 'info');
      return;
    }
    pausedRef.current = false;
    setQueuePaused(false);
    setQueueRunning(true);
    setCurrentIdx(0);
    addLog(`▶️ Iniciando envio em massa — ${pendingQueue.length} pendentes`, 'info');
    runQueue(pendingQueue, 0);
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
    addLog('▶️ Retomando fila...', 'info');
    runQueue(pendingQueue, currentIdx);
  };

  const stopQueue = () => {
    pausedRef.current = true;
    setQueueRunning(false);
    setQueuePaused(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    addLog('⏹️ Fila interrompida manualmente', 'info');
  };

  const resetErrors = async () => {
    await fetch('/api/whatsapp-fila', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_errors' }),
    });
    addLog('🔄 Erros resetados para Pendente', 'ok');
    await loadFila();
  };

  const checkFollowups = async () => {
    const res = await fetch('/api/whatsapp-fila', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_followups' }),
    });
    const d = await res.json();
    addLog(`🔔 ${d.due} alunos marcados para follow-up`, d.due > 0 ? 'ok' : 'info');
    await loadFila();
  };

  // Stats
  const stats = {
    total: fila.length,
    pendente: fila.filter(r => r.status === 'pendente').length,
    enviado: fila.filter(r => r.status === 'enviado').length,
    erro: fila.filter(r => r.status === 'erro').length,
    cadastrado: fila.filter(r => r.status === 'cadastrado').length,
    semTelefone: fila.filter(r => r.status === 'pendente' && r.telefone.replace(/\D/g, '').length < 10).length,
  };

  const totalEnviados = stats.enviado + stats.cadastrado;
  const progress = stats.total > 0 ? Math.round((totalEnviados / stats.total) * 100) : 0;

  const filtered = fila.filter(r => filterStatus === 'todos' || r.status === filterStatus);

  const queueProgress = pendingQueue.length > 0
    ? Math.round((currentIdx / pendingQueue.length) * 100)
    : 0;

  return (
    <div style={{ marginTop: 32 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>📲</span>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>Fila de Envio WhatsApp</span>
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 2, marginLeft: 30 }}>
            Gestão de mensagens para alunos sem cadastro
            {lastUpdate && ` · Atualizado: ${new Date(lastUpdate).toLocaleTimeString('pt-BR')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={checkFollowups} style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(139,92,246,0.12)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.3)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
            🔔 Checar Follow-ups
          </button>
          <button onClick={syncFila} disabled={syncing} style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(29,78,216,0.12)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.3)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, opacity: syncing ? 0.6 : 1 }}>
            {syncing ? '⟳ Sincronizando...' : '🔄 Sincronizar Fila'}
          </button>
          <button onClick={loadFila} disabled={loading} style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
            ↻ Recarregar
          </button>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Total', value: stats.total, icon: '📋', color: '#1d4ed8', bg: 'rgba(29,78,216,0.07)' },
          { label: 'Pendente', value: stats.pendente, icon: '🔴', color: '#dc2626', bg: 'rgba(239,68,68,0.07)' },
          { label: 'Enviado', value: stats.enviado, icon: '🟡', color: '#92400e', bg: 'rgba(234,179,8,0.07)' },
          { label: 'Erro', value: stats.erro, icon: '⚫', color: '#475569', bg: 'rgba(100,116,139,0.07)' },
          { label: 'Cadastrado', value: stats.cadastrado, icon: '🟢', color: '#166534', bg: 'rgba(22,163,74,0.07)' },
          { label: 'Sem tel.', value: stats.semTelefone, icon: '📵', color: '#d97706', bg: 'rgba(217,119,6,0.07)' },
        ].map(s => (
          <div key={s.label} onClick={() => setFilterStatus(s.label.toLowerCase() as any)} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
            <div style={{ fontSize: '1rem', marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: '1.35rem', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 3, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Progress Bar ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Progresso Geral</span>
          <span style={{ color: 'var(--text-secondary)' }}>{totalEnviados} / {stats.total} ({progress}%)</span>
        </div>
        <div style={{ height: 10, background: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#25d366,#128c7e)', borderRadius: 6, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* ── Queue Controls ── */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid rgba(37,211,102,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 12 }}>⚙️ Controle da Fila Automática</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {!queueRunning ? (
            <button onClick={startQueue} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#25d366,#128c7e)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.88rem', boxShadow: '0 2px 12px rgba(37,211,102,0.3)' }}>
              ▶️ Iniciar Envio em Massa
            </button>
          ) : (
            <>
              {!queuePaused ? (
                <button onClick={pauseQueue} style={{ padding: '9px 18px', borderRadius: 8, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>⏸️ Pausar</button>
              ) : (
                <button onClick={resumeQueue} style={{ padding: '9px 18px', borderRadius: 8, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>▶️ Retomar</button>
              )}
              <button onClick={stopQueue} style={{ padding: '9px 18px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>⏹️ Parar</button>
            </>
          )}
          <button onClick={resetErrors} style={{ padding: '9px 16px', borderRadius: 8, background: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
            🔄 Reenviar Falhas
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Intervalo:</span>
            <select value={interval} onChange={e => setIntervalSec(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.78rem' }}>
              {[3, 5, 8, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v}s</option>)}
            </select>
          </div>
        </div>

        {/* Queue live progress */}
        {queueRunning && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 5, color: 'var(--text-secondary)' }}>
              <span>Enviando {currentIdx + 1} de {pendingQueue.length}...</span>
              <span>{queueProgress}%</span>
            </div>
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 4 }}>
              <div style={{ height: '100%', width: `${queueProgress}%`, background: '#25d366', borderRadius: 4, transition: 'width 0.3s ease' }} />
            </div>
            {pendingQueue[currentIdx] && (
              <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#25d366', fontWeight: 600 }}>
                📤 {pendingQueue[currentIdx]?.student_name}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Filter + List ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            📋 Lista de Alunos — {filtered.length} {filterStatus !== 'todos' ? `(${filterStatus})` : 'total'}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['todos', 'pendente', 'enviado', 'erro', 'cadastrado'] as const).map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                style={{ padding: '4px 12px', borderRadius: 20, border: '1.5px solid', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s',
                  borderColor: filterStatus === f ? '#1d4ed8' : 'var(--border)',
                  background: filterStatus === f ? '#1d4ed8' : 'transparent',
                  color: filterStatus === f ? '#fff' : 'var(--text-secondary)',
                }}>
                {f === 'todos' ? 'Todos' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Nenhum registro encontrado.</div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {filtered.map(rec => {
              const sc = STATUS_COLOR[rec.status] || STATUS_COLOR.pendente;
              const isExpanded = expandedId === rec.id;
              return (
                <div key={rec.id} style={{ borderRadius: 10, border: `1px solid ${sc.border}`, background: sc.bg, marginBottom: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : rec.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.student_name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 1 }}>
                        {rec.nucleo || '—'} · {rec.telefone || 'sem telefone'} · {rec.tentativas} tentativa{rec.tentativas !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 800, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {STATUS_LABEL[rec.status]}
                    </span>
                    {rec.status === 'pendente' && rec.telefone.replace(/\D/g, '').length >= 10 && (
                      <a
                        href={`https://api.whatsapp.com/send?phone=${rec.telefone.replace(/\D/g, '').startsWith('55') ? rec.telefone.replace(/\D/g, '') : '55' + rec.telefone.replace(/\D/g, '')}&text=${encodeURIComponent(MSG)}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={async (e) => { e.stopPropagation(); await markSent(rec.student_id); await loadFila(); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'linear-gradient(135deg,#25d366,#128c7e)', color: '#fff', borderRadius: 7, padding: '4px 10px', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                        📱 Enviar
                      </a>
                    )}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded: history */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${sc.border}`, padding: '10px 12px', background: 'var(--bg-card)' }}>
                      {rec.erro_msg && (
                        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 10px', fontSize: '0.75rem', color: '#dc2626', marginBottom: 8 }}>
                          ❌ Erro: {rec.erro_msg}
                        </div>
                      )}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Histórico</div>
                      {rec.historico.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum envio registrado.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {[...rec.historico].reverse().map((h, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.75rem' }}>
                              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {new Date(h.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span style={{ color: h.status === 'enviado' ? '#16a34a' : h.status === 'erro' ? '#dc2626' : h.status === 'cadastrado' ? '#1d4ed8' : 'var(--text-secondary)', fontWeight: 600 }}>
                                {STATUS_LABEL[h.status] || h.status}
                              </span>
                              {h.msg && <span style={{ color: 'var(--text-secondary)' }}>{h.msg}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {rec.data_proximo_envio && rec.status === 'enviado' && (
                        <div style={{ marginTop: 8, fontSize: '0.73rem', color: '#7c3aed', fontWeight: 600 }}>
                          🔔 Próximo follow-up: {new Date(rec.data_proximo_envio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Execution Log ── */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📟 Log de Execução</span>
          <button onClick={() => setLog([])} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: 5, padding: '2px 8px', fontSize: '0.68rem', cursor: 'pointer' }}>Limpar</button>
        </div>
        <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {log.length === 0 ? (
            <span style={{ fontSize: '0.73rem', color: '#475569', fontStyle: 'italic' }}>Nenhuma entrada ainda...</span>
          ) : log.map((l, i) => (
            <div key={i} style={{ fontSize: '0.73rem', fontFamily: 'monospace', color: l.type === 'ok' ? '#4ade80' : l.type === 'err' ? '#f87171' : '#94a3b8' }}>
              <span style={{ color: '#475569', marginRight: 8 }}>[{l.time}]</span>{l.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
