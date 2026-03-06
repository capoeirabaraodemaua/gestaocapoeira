'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { registerCheckin } from '@/lib/checkins';
import Link from 'next/link';

interface Student {
  id: string;
  nome_completo: string;
  cpf: string;
  graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
}

export default function PresencaPage() {
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [filtered, setFiltered] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState<{ student: Student; hora: string } | null>(null);
  const [registeredToday, setRegisteredToday] = useState<Set<string>>(new Set());

  useEffect(() => { fetchStudents(); }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered([]); return; }
    const q = search.toLowerCase();
    setFiltered(
      students.filter(s =>
        s.nome_completo.toLowerCase().includes(q) || s.cpf.includes(q)
      ).slice(0, 8)
    );
  }, [search, students]);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('id, nome_completo, cpf, graduacao, nucleo, foto_url')
      .order('nome_completo');
    if (data) setStudents(data);
    setLoading(false);
  };

  const handleRegistrar = async (student: Student) => {
    if (registering) return;
    setRegistering(true);
    const result = await registerCheckin(student);
    setRegistering(false);

    if (result.alreadyRegistered) {
      setRegisteredToday(prev => new Set([...prev, student.id]));
      return;
    }
    if (result.success) {
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setRegisteredToday(prev => new Set([...prev, student.id]));
      setSearch('');
      setFiltered([]);
      setSuccess({ student, hora });
    } else {
      alert('Erro ao registrar presença. Tente novamente.');
    }
  };

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div style={{ minHeight: '100vh' }}>
      <style>{`@media print { body * { visibility: hidden !important; } #print-area, #print-area * { visibility: visible !important; } #print-area { position: fixed !important; top: 0; left: 0; width: 100%; padding: 40px; background: white; color: black; } }`}</style>

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

          {loading && (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 16, fontSize: '0.9rem' }}>
              Carregando alunos...
            </p>
          )}

          {filtered.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(student => {
                const jaRegistrado = registeredToday.has(student.id);
                return (
                  <div key={student.id} style={{
                    background: 'var(--bg-input)',
                    border: `1px solid ${jaRegistrado ? 'rgba(220,38,38,0.4)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
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
                      {jaRegistrado && (
                        <div style={{ color: '#f87171', fontSize: '0.79rem', fontWeight: 600, marginTop: 3 }}>
                          ⚠ Presença já registrada hoje
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRegistrar(student)}
                      disabled={registering || jaRegistrado}
                      style={{
                        background: jaRegistrado ? 'rgba(220,38,38,0.1)' : 'linear-gradient(135deg,#16a34a,#15803d)',
                        border: jaRegistrado ? '1px solid rgba(220,38,38,0.3)' : 'none',
                        color: jaRegistrado ? '#f87171' : '#fff',
                        padding: '10px 16px',
                        borderRadius: 8,
                        cursor: jaRegistrado ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        flexShrink: 0,
                        opacity: registering ? 0.6 : 1,
                        transition: 'all 0.15s',
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
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20, fontSize: '0.9rem' }}>
              Nenhum aluno encontrado.
            </p>
          )}
        </div>

        {/* Instruções */}
        <div className="form-section" style={{ background: 'rgba(22,163,74,0.07)', borderColor: 'rgba(22,163,74,0.2)' }}>
          <h2 className="form-section-title" style={{ color: '#16a34a' }}>Como Registrar</h2>
          <ol style={{ color: 'var(--text-secondary)', paddingLeft: 20, lineHeight: 2.2, fontSize: '0.9rem', margin: 0 }}>
            <li>Digite seu <strong>nome</strong> ou <strong>CPF</strong> no campo acima</li>
            <li>Clique em <strong>✓ Registrar</strong> ao lado do seu nome</li>
            <li>Guarde o comprovante que aparece na tela</li>
          </ol>
        </div>
      </div>

      {/* Modal comprovante */}
      {success && (
        <div className="modal-overlay" onClick={() => setSuccess(null)}>
          <div id="print-area" className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: 4, display: 'block', WebkitTextFillColor: 'var(--text-primary)' }}>
              Presença Registrada!
            </h2>
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
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {success.student.graduacao} · {success.student.nucleo || '—'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Data</div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{hoje}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Horário</div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{success.hora}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Núcleo</div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{success.student.nucleo || '—'}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Associação Cultural de Capoeira Barão de Mauá · Axé!
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => window.print()}
                style={{ flex: 1, padding: '10px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
              >
                🖨 Imprimir
              </button>
              <button
                onClick={() => setSuccess(null)}
                style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
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
