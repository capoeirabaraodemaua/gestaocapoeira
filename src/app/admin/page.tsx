'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCordaColors, graduacoes } from '@/lib/graduacoes';
import { getCheckins, getHistorico, CheckinRecord } from '@/lib/checkins';
import Link from 'next/link';

interface PresencaCount {
  student_id: string;
  count: number;
}

const hoje = () => new Date().toISOString().split('T')[0];

interface Student {
  id: string;
  nome_completo: string;
  cpf: string;
  identidade: string;
  data_nascimento: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  graduacao: string;
  tipo_graduacao: string;
  nucleo: string | null;
  foto_url: string | null;
  nome_pai: string;
  nome_mae: string;
  autoriza_imagem: boolean;
  menor_de_idade: boolean;
  nome_responsavel: string | null;
  cpf_responsavel: string | null;
  assinatura_responsavel: boolean;
  created_at: string;
  ultimo_checkin?: string | null;
  checkin_nucleo?: string | null;
}

type EditForm = Partial<Student>;

export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterNucleo, setFilterNucleo] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'alunos' | 'presencas'>('alunos');
  const [presencas, setPresencas] = useState<PresencaCount[]>([]);
  const [totalTreinos, setTotalTreinos] = useState(0);
  const [filterPresencaNucleo, setFilterPresencaNucleo] = useState('');
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [historico, setHistorico] = useState<Record<string, string[]>>({});
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [chartStudent, setChartStudent] = useState<Student | null>(null);

  useEffect(() => {
    fetchStudents();
    fetchPresencas();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setStudents(data as Student[]);
    setLoading(false);
  };

  const fetchPresencas = async () => {
    const today = new Date().toISOString().split('T')[0];
    const records = await getCheckins(today);
    setCheckins(records);
  };

  const fetchHistorico = async () => {
    setLoadingHistorico(true);
    const hist = await getHistorico(30);
    setHistorico(hist);
    setLoadingHistorico(false);
  };

  const filtered = students.filter(s => {
    const matchSearch =
      s.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
      s.cpf.includes(search) ||
      (s.graduacao || '').toLowerCase().includes(search.toLowerCase());
    const matchNucleo = !filterNucleo || s.nucleo === filterNucleo;
    return matchSearch && matchNucleo;
  });

  const menores = students.filter(s => s.menor_de_idade).length;

  const openEdit = (student: Student) => {
    setEditing(student);
    setEditForm({ ...student });
    setSelected(null);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from('students')
      .update({
        nome_completo: editForm.nome_completo,
        cpf: editForm.cpf,
        identidade: editForm.identidade,
        data_nascimento: editForm.data_nascimento,
        telefone: editForm.telefone,
        cep: editForm.cep,
        endereco: editForm.endereco,
        numero: editForm.numero,
        complemento: editForm.complemento,
        bairro: editForm.bairro,
        cidade: editForm.cidade,
        estado: editForm.estado,
        graduacao: editForm.graduacao,
        tipo_graduacao: editForm.tipo_graduacao,
        nucleo: editForm.nucleo,
        nome_pai: editForm.nome_pai,
        nome_mae: editForm.nome_mae,
        nome_responsavel: editForm.nome_responsavel,
        cpf_responsavel: editForm.cpf_responsavel,
      })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      alert('Erro ao salvar. Tente novamente.');
    } else {
      setEditing(null);
      fetchStudents();
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase.from('students').delete().eq('id', deleteConfirm.id);
    if (error) {
      alert('Erro ao excluir. Tente novamente.');
    } else {
      setDeleteConfirm(null);
      setSelected(null);
      fetchStudents();
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="container-wide">
        <div style={{ padding: '20px 0' }}>
          <Link href="/" className="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Voltar ao formulário
          </Link>
        </div>

        <div className="admin-header">
          <div>
            <h1 style={{ background: 'linear-gradient(135deg, #fff, var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Painel Administrativo
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
              Associação Cultural de Capoeira Barão de Mauá
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/presenca" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem' }}>
              ✓ Registrar Presença
            </Link>
            {activeTab === 'alunos' && <>
              <input
                className="search-input"
                placeholder="Buscar por nome, CPF ou graduação..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="search-input"
                style={{ width: 160 }}
                value={filterNucleo}
                onChange={(e) => setFilterNucleo(e.target.value)}
              >
                <option value="">Todos os núcleos</option>
                <option value="Saracuruna">Saracuruna</option>
                <option value="Mauá">Mauá</option>
              </select>
            </>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)' }}>
          {(['alunos', 'presencas'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 24px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #dc2626' : '2px solid transparent',
                marginBottom: -2,
                color: activeTab === tab ? '#dc2626' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'all 0.2s',
              }}
            >
              {tab === 'alunos' ? '👥 Alunos' : '📊 Presenças'}
            </button>
          ))}
        </div>

        {activeTab === 'alunos' && (
          <div>
          <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-value">{students.length}</div>
            <div className="stat-label">Total de Alunos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{students.filter(s => s.nucleo === 'Saracuruna').length}</div>
            <div className="stat-label">Núcleo Saracuruna</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{students.filter(s => s.nucleo === 'Mauá').length}</div>
            <div className="stat-label">Núcleo Mauá</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{menores}</div>
            <div className="stat-label">Menores de Idade</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            Carregando alunos...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            {search || filterNucleo ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado ainda.'}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="student-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Nome</th>
                  <th>Núcleo</th>
                  <th>Graduação</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(student => {
                  const colors = getCordaColors(student.graduacao);
                  return (
                    <tr key={student.id}>
                      <td>
                        {student.foto_url ? (
                          <img src={student.foto_url} alt="" className="student-avatar" />
                        ) : (
                          <div className="student-avatar" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{student.nome_completo}</td>
                      <td>
                        <span className={`badge ${student.nucleo === 'Saracuruna' ? 'badge-saracuruna' : student.nucleo === 'Mauá' ? 'badge-maua' : ''}`}>
                          {student.nucleo || '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', width: 40, height: 10, borderRadius: 5, overflow: 'hidden' }}>
                            {colors.map((c, i) => (
                              <div key={i} style={{ flex: 1, background: c }} />
                            ))}
                          </div>
                          <span style={{ fontSize: '0.85rem' }}>{student.graduacao}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${student.menor_de_idade ? 'badge-minor' : 'badge-adult'}`}>
                          {student.menor_de_idade ? 'Menor' : 'Adulto'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(student.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setSelected(student)}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--accent)', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Ver
                          </button>
                          <button
                            onClick={() => openEdit(student)}
                            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => { setChartStudent(student); fetchHistorico(); }}
                            style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            📊
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(student)}
                            style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </div>
        )}

        {/* ===== ABA PRESENÇAS ===== */}
        {activeTab === 'presencas' && (
          <div>
            {/* Stats */}
            <div className="admin-stats">
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#16a34a' }}>{checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length}</div>
                <div className="stat-label">Presentes Hoje</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length}</div>
                <div className="stat-label">Total de Alunos</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#dc2626' }}>
                  {students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length -
                    checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length}
                </div>
                <div className="stat-label">Ausentes Hoje</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length > 0
                    ? Math.round((checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length /
                        students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length) * 100)
                    : 0}%
                </div>
                <div className="stat-label">Frequência Hoje</div>
              </div>
            </div>

            {/* Filtro + botão */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <select className="search-input" style={{ width: 200 }} value={filterPresencaNucleo} onChange={e => setFilterPresencaNucleo(e.target.value)}>
                <option value="">Todos os núcleos</option>
                <option value="Saracuruna">Saracuruna</option>
                <option value="Mauá">Mauá</option>
              </select>
              <button onClick={fetchPresencas} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                ↻ Atualizar
              </button>
              <Link href="/presenca" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
                + Registrar Presença
              </Link>
            </div>

            {/* Lista de presentes */}
            {checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length > 0 ? (
              <div>
                <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  ✓ Presentes Hoje ({checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {checkins
                    .filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo)
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map((c, i) => (
                      <div key={c.student_id + i} style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        {c.foto_url
                          ? <img src={c.foto_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(22,163,74,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                            </div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{c.nome_completo}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {c.graduacao} · {c.nucleo}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 700 }}>{c.hora}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>check-in</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                Nenhuma presença registrada hoje ainda.
                <br />
                <Link href="/presenca" style={{ color: '#16a34a', fontWeight: 600 }}>Registrar presença →</Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2>
              Detalhes do Aluno
              <button className="modal-close" onClick={() => setSelected(null)}>&times;</button>
            </h2>

            <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'center' }}>
              {selected.foto_url ? (
                <img src={selected.foto_url} alt="" className="detail-photo" />
              ) : (
                <div className="detail-photo" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                </div>
              )}
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: 4 }}>{selected.nome_completo}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', width: 50, height: 10, borderRadius: 5, overflow: 'hidden' }}>
                    {getCordaColors(selected.graduacao).map((c, i) => (
                      <div key={i} style={{ flex: 1, background: c }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selected.graduacao} ({selected.tipo_graduacao})</span>
                  {selected.nucleo && (
                    <span className={`badge ${selected.nucleo === 'Saracuruna' ? 'badge-saracuruna' : 'badge-maua'}`}>{selected.nucleo}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">CPF</span>
                <span className="detail-value">{selected.cpf}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Identidade</span>
                <span className="detail-value">{selected.identidade}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Data de Nascimento</span>
                <span className="detail-value">{new Date(selected.data_nascimento).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Telefone</span>
                <span className="detail-value">{selected.telefone || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className={`badge ${selected.menor_de_idade ? 'badge-minor' : 'badge-adult'}`}>
                  {selected.menor_de_idade ? 'Menor de Idade' : 'Adulto'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Autoriza Imagem</span>
                <span className="detail-value">{selected.autoriza_imagem ? 'Sim' : 'Não'}</span>
              </div>
              <div className="detail-item detail-full">
                <span className="detail-label">Endereço</span>
                <span className="detail-value">
                  {selected.endereco}, {selected.numero}
                  {selected.complemento ? ` - ${selected.complemento}` : ''} — {selected.bairro}, {selected.cidade}/{selected.estado} — CEP: {selected.cep}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome do Pai</span>
                <span className="detail-value">{selected.nome_pai || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome da Mãe</span>
                <span className="detail-value">{selected.nome_mae || '—'}</span>
              </div>
              {selected.menor_de_idade && (
                <>
                  <div className="detail-item detail-full" style={{ marginTop: 12, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <span className="detail-label" style={{ color: 'var(--danger)', fontWeight: 600 }}>Dados do Responsável</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Nome do Responsável</span>
                    <span className="detail-value">{selected.nome_responsavel || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">CPF do Responsável</span>
                    <span className="detail-value">{selected.cpf_responsavel || '—'}</span>
                  </div>
                </>
              )}
              <div className="detail-item detail-full" style={{ marginTop: 8 }}>
                <span className="detail-label">Data de Inscrição</span>
                <span className="detail-value">{new Date(selected.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => openEdit(selected)}
                style={{ flex: 1, padding: '10px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Editar Cadastro
              </button>
              <button
                onClick={() => { setDeleteConfirm(selected); setSelected(null); }}
                style={{ flex: 1, padding: '10px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Excluir Cadastro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <h2>
              Editar Cadastro
              <button className="modal-close" onClick={() => setEditing(null)}>&times;</button>
            </h2>

            <div className="detail-grid" style={{ gap: 14 }}>
              <div className="detail-item detail-full">
                <span className="detail-label">Nome Completo</span>
                <input className="edit-input" name="nome_completo" value={editForm.nome_completo || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">CPF</span>
                <input className="edit-input" name="cpf" value={editForm.cpf || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Identidade (RG)</span>
                <input className="edit-input" name="identidade" value={editForm.identidade || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Data de Nascimento</span>
                <input className="edit-input" type="date" name="data_nascimento" value={editForm.data_nascimento || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Telefone</span>
                <input className="edit-input" name="telefone" value={editForm.telefone || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Núcleo</span>
                <select className="edit-input" name="nucleo" value={editForm.nucleo || ''} onChange={handleEditChange}>
                  <option value="">Selecione</option>
                  <option value="Saracuruna">Saracuruna</option>
                  <option value="Mauá">Mauá</option>
                </select>
              </div>
              <div className="detail-item">
                <span className="detail-label">Tipo Graduação</span>
                <select className="edit-input" name="tipo_graduacao" value={editForm.tipo_graduacao || ''} onChange={handleEditChange}>
                  <option value="adulta">Adulta</option>
                  <option value="infantil">Infantil</option>
                </select>
              </div>
              <div className="detail-item">
                <span className="detail-label">Graduação (Corda)</span>
                <select className="edit-input" name="graduacao" value={editForm.graduacao || ''} onChange={handleEditChange}>
                  <option value="">Selecione</option>
                  {graduacoes.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="detail-item detail-full" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <span className="detail-label" style={{ marginBottom: 8 }}>Endereço</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">CEP</span>
                <input className="edit-input" name="cep" value={editForm.cep || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Estado</span>
                <input className="edit-input" name="estado" value={editForm.estado || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item detail-full">
                <span className="detail-label">Endereço</span>
                <input className="edit-input" name="endereco" value={editForm.endereco || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Número</span>
                <input className="edit-input" name="numero" value={editForm.numero || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Complemento</span>
                <input className="edit-input" name="complemento" value={editForm.complemento || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Bairro</span>
                <input className="edit-input" name="bairro" value={editForm.bairro || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Cidade</span>
                <input className="edit-input" name="cidade" value={editForm.cidade || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome do Pai</span>
                <input className="edit-input" name="nome_pai" value={editForm.nome_pai || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome da Mãe</span>
                <input className="edit-input" name="nome_mae" value={editForm.nome_mae || ''} onChange={handleEditChange} />
              </div>
              {editing.menor_de_idade && (
                <>
                  <div className="detail-item detail-full" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                    <span className="detail-label" style={{ color: 'var(--danger)', fontWeight: 600 }}>Responsável</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Nome do Responsável</span>
                    <input className="edit-input" name="nome_responsavel" value={editForm.nome_responsavel || ''} onChange={handleEditChange} />
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">CPF do Responsável</span>
                    <input className="edit-input" name="cpf_responsavel" value={editForm.cpf_responsavel || ''} onChange={handleEditChange} />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setEditing(null)}
                style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg, var(--accent), #b0452a)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
              <h2 style={{ fontSize: '1.2rem', marginBottom: 0, display: 'block', WebkitTextFillColor: 'var(--text-primary)' }}>
                Confirmar Exclusão
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
              Tem certeza que deseja excluir o cadastro de
            </p>
            <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 24, color: '#f87171' }}>
              {deleteConfirm.nome_completo}?
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: '10px', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#f87171', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gráfico Individual de Presença */}
      {chartStudent && (
        <div className="modal-overlay" onClick={() => setChartStudent(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ WebkitTextFillColor: 'var(--text-primary)', fontSize: '1.1rem' }}>
                📊 Frequência Individual
              </span>
              <button className="modal-close" onClick={() => setChartStudent(null)}>&times;</button>
            </h2>

            {/* Cabeçalho aluno */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '14px 16px', background: 'var(--bg-input)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {chartStudent.foto_url
                ? <img src={chartStudent.foto_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                  </div>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{chartStudent.nome_completo}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                  {chartStudent.graduacao} · {chartStudent.nucleo || '—'}
                </div>
              </div>
              {(() => {
                const dias = historico[chartStudent.id] || [];
                const pct = 30 > 0 ? Math.round((dias.length / 30) * 100) : 0;
                const cor = pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
                return (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: cor, lineHeight: 1 }}>{pct}%</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{dias.length}/30 dias</div>
                  </div>
                );
              })()}
            </div>

            {loadingHistorico ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Carregando histórico...</div>
            ) : (() => {
              const diasPresente = new Set(historico[chartStudent.id] || []);
              // Gera os últimos 30 dias
              const dias: { date: string; label: string; presente: boolean }[] = [];
              for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().split('T')[0];
                const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                dias.push({ date: iso, label, presente: diasPresente.has(iso) });
              }
              const presentes = dias.filter(d => d.presente).length;
              const cor = presentes / 30 >= 0.75 ? '#16a34a' : presentes / 30 >= 0.5 ? '#d97706' : '#dc2626';

              return (
                <div>
                  {/* Calendário de pontos — últimos 30 dias */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Últimos 30 dias
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                      {dias.map(d => (
                        <div
                          key={d.date}
                          title={`${d.label} — ${d.presente ? 'Presente' : 'Ausente'}`}
                          style={{
                            aspectRatio: '1',
                            borderRadius: 6,
                            background: d.presente ? cor : 'var(--bg-input)',
                            border: `1px solid ${d.presente ? cor : 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'default',
                            transition: 'transform 0.1s',
                          }}
                        >
                          {d.presente && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      <span>{dias[0].label}</span>
                      <span>Hoje</span>
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Frequência</span>
                      <span style={{ fontWeight: 700, color: cor }}>{presentes} presença{presentes !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ background: 'var(--bg-input)', borderRadius: 8, height: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ width: `${(presentes / 30) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${cor}, ${cor}cc)`, borderRadius: 8, transition: 'width 0.8s ease' }} />
                    </div>
                  </div>

                  {/* Estatísticas */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      { label: 'Presenças', value: presentes, color: cor },
                      { label: 'Faltas', value: 30 - presentes, color: '#dc2626' },
                      { label: 'Frequência', value: `${Math.round((presentes / 30) * 100)}%`, color: cor },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Legenda */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 14, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: cor }} />
                      Presente
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--bg-input)', border: '1px solid var(--border)' }} />
                      Ausente
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
