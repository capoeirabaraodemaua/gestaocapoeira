'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Student {
  id: string;
  nome_completo: string;
  cpf: string;
  graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
}

interface Presenca {
  id: string;
  student_id: string;
  data_treino: string;
  hora_registro: string;
  nucleo: string;
  created_at: string;
}

export default function PresencaPage() {
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [filtered, setFiltered] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [comprovante, setComprovante] = useState<{ student: Student; presenca: Presenca } | null>(null);
  const [alreadyChecked, setAlreadyChecked] = useState<string | null>(null);
  const comprovanteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered([]); return; }
    const q = search.toLowerCase();
    setFiltered(
      students.filter(s =>
        s.nome_completo.toLowerCase().includes(q) ||
        s.cpf.includes(q)
      ).slice(0, 8)
    );
  }, [search, students]);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase.from('students').select('id, nome_completo, cpf, graduacao, nucleo, foto_url').order('nome_completo');
    if (data) setStudents(data);
    setLoading(false);
  };

  const hoje = () => new Date().toISOString().split('T')[0];
  const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const registrarPresenca = async (student: Student) => {
    setRegistering(true);
    setAlreadyChecked(null);

    // Verifica se já registrou hoje
    const { data: existing } = await supabase
      .from('presencas')
      .select('id')
      .eq('student_id', student.id)
      .eq('data_treino', hoje())
      .limit(1);

    if (existing && existing.length > 0) {
      setAlreadyChecked(student.id);
      setRegistering(false);
      return;
    }

    const hora = horaAgora();
    const { data, error } = await supabase
      .from('presencas')
      .insert({
        student_id: student.id,
        data_treino: hoje(),
        hora_registro: hora,
        nucleo: student.nucleo || 'Sem núcleo',
      })
      .select()
      .single();

    setRegistering(false);
    if (!error && data) {
      setSearch('');
      setFiltered([]);
      setComprovante({ student, presenca: data });
    } else {
      alert('Erro ao registrar presença. Tente novamente.');
    }
  };

  const imprimirComprovante = () => {
    window.print();
  };

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #comprovante-print, #comprovante-print * { visibility: visible !important; }
          #comprovante-print { position: fixed !important; top: 0; left: 0; width: 100%; z-index: 9999; background: white !important; color: black !important; padding: 40px !important; }
        }
      `}</style>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #dc2626 0%, #7c3aed 100%)', padding: '32px 20px', textAlign: 'center', position: 'relative' }}>
        <Link href="/" style={{ position: 'absolute', left: 20, top: 20, color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Início
        </Link>
        <img src="/logo.png" alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', marginBottom: 12 }} />
        <h1 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Registro de Presença</h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginTop: 6 }}>
          Associação Cultural de Capoeira Barão de Mauá
        </p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginTop: 4 }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="container" style={{ maxWidth: 600, marginTop: 32 }}>

        {/* Busca */}
        <div className="form-section">
          <h2 className="form-section-title">Buscar Aluno</h2>
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Digite seu nome ou CPF..."
              value={search}
              onChange={e => { setSearch(e.target.value); setAlreadyChecked(null); }}
              style={{ width: '100%', fontSize: '1rem', padding: '14px 16px', paddingLeft: 44 }}
              autoFocus
            />
            <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>

          {/* Resultados */}
          {loading && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Carregando...</p>}
          {filtered.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(student => (
                <div key={student.id} style={{
                  background: 'var(--bg-input)',
                  border: `1px solid ${alreadyChecked === student.id ? '#dc2626' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}>
                  {student.foto_url ? (
                    <img src={student.foto_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 2 }}>{student.nome_completo}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {student.graduacao} · {student.nucleo || 'Sem núcleo'}
                    </div>
                    {alreadyChecked === student.id && (
                      <div style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 600, marginTop: 4 }}>
                        ⚠ Presença já registrada hoje!
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => registrarPresenca(student)}
                    disabled={registering || alreadyChecked === student.id}
                    style={{
                      background: alreadyChecked === student.id ? 'rgba(220,38,38,0.1)' : 'linear-gradient(135deg, #16a34a, #15803d)',
                      border: 'none',
                      color: alreadyChecked === student.id ? '#f87171' : '#fff',
                      padding: '10px 18px',
                      borderRadius: 8,
                      cursor: alreadyChecked === student.id ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0,
                      opacity: registering ? 0.6 : 1,
                    }}
                  >
                    {registering ? '...' : alreadyChecked === student.id ? 'Já registrado' : '✓ Registrar'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {search.trim() && filtered.length === 0 && !loading && (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20, fontSize: '0.9rem' }}>
              Nenhum aluno encontrado. Verifique o nome ou CPF.
            </p>
          )}
        </div>

        {/* Instruções */}
        <div className="form-section" style={{ background: 'rgba(22,163,74,0.07)', borderColor: 'rgba(22,163,74,0.2)' }}>
          <h2 className="form-section-title" style={{ color: '#16a34a' }}>Como Registrar</h2>
          <ol style={{ color: 'var(--text-secondary)', paddingLeft: 20, lineHeight: 2, fontSize: '0.9rem', margin: 0 }}>
            <li>Digite seu <strong>nome</strong> ou <strong>CPF</strong> no campo de busca</li>
            <li>Selecione seu nome na lista</li>
            <li>Clique em <strong>Registrar</strong></li>
            <li>Salve ou imprima seu comprovante de presença</li>
          </ol>
        </div>
      </div>

      {/* Modal Comprovante */}
      {comprovante && (
        <div className="modal-overlay" onClick={() => setComprovante(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }} id="comprovante-print" ref={comprovanteRef}>
            {/* Comprovante */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: 4, display: 'block', WebkitTextFillColor: 'var(--text-primary)' }}>
                Presença Registrada!
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Comprovante de Treino</p>
            </div>

            {/* Dados do comprovante */}
            <div style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                {comprovante.student.foto_url ? (
                  <img src={comprovante.student.foto_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{comprovante.student.nome_completo}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {comprovante.student.graduacao} · {comprovante.student.nucleo || '—'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Data do Treino</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatDate(comprovante.presenca.data_treino)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Horário</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{comprovante.presenca.hora_registro}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Núcleo</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{comprovante.presenca.nucleo}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Protocolo</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'monospace' }}>{comprovante.presenca.id.slice(0, 8).toUpperCase()}</div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                Associação Cultural de Capoeira Barão de Mauá<br/>
                Presença registrada com sucesso. Axé!
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={imprimirComprovante}
                style={{ flex: 1, padding: '11px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
              >
                🖨 Imprimir / Salvar PDF
              </button>
              <button
                onClick={() => setComprovante(null)}
                style={{ flex: 1, padding: '11px', background: 'linear-gradient(135deg, #16a34a, #15803d)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
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
