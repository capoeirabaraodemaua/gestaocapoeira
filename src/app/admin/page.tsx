'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCordaColors } from '@/lib/graduacoes';
import Link from 'next/link';

interface Student {
  id: string;
  nome_completo: string;
  cpf: string;
  identidade: string;
  data_nascimento: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  graduacao: string;
  tipo_graduacao: string;
  foto_url: string | null;
  nome_pai: string;
  nome_mae: string;
  autoriza_imagem: boolean;
  menor_de_idade: boolean;
  nome_responsavel: string | null;
  cpf_responsavel: string | null;
  assinatura_responsavel: boolean;
  created_at: string;
}

export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setStudents(data);
    setLoading(false);
  };

  const filtered = students.filter(s =>
    s.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
    s.cpf.includes(search) ||
    s.graduacao.toLowerCase().includes(search.toLowerCase())
  );

  const menores = students.filter(s => s.menor_de_idade).length;

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
              Painel de Alunos
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
              Associação Cultural de Capoeira Barão de Mauá
            </p>
          </div>
          <input
            className="search-input"
            placeholder="Buscar aluno por nome, CPF ou graduação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-value">{students.length}</div>
            <div className="stat-label">Total de Alunos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{students.length - menores}</div>
            <div className="stat-label">Adultos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{menores}</div>
            <div className="stat-label">Menores de Idade</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{students.filter(s => s.autoriza_imagem).length}</div>
            <div className="stat-label">Autorizam Imagem</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            Carregando alunos...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            {search ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado ainda.'}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="student-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Nome</th>
                  <th>Graduação</th>
                  <th>Tipo</th>
                  <th>Cidade</th>
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
                          <div className="student-avatar" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{student.nome_completo}</td>
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
                      <td>{student.cidade}/{student.estado}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(student.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td>
                        <button
                          onClick={() => setSelected(student)}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border)',
                            color: 'var(--accent)',
                            padding: '6px 14px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            transition: 'background 0.2s',
                          }}
                          onMouseOver={e => (e.currentTarget.style.background = 'rgba(232,168,56,0.1)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                        >
                          Ver detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', width: 50, height: 10, borderRadius: 5, overflow: 'hidden' }}>
                    {getCordaColors(selected.graduacao).map((c, i) => (
                      <div key={i} style={{ flex: 1, background: c }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selected.graduacao} ({selected.tipo_graduacao})</span>
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
                <span className="detail-label">Status</span>
                <span className={`badge ${selected.menor_de_idade ? 'badge-minor' : 'badge-adult'}`}>
                  {selected.menor_de_idade ? 'Menor de Idade' : 'Adulto'}
                </span>
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
              <div className="detail-item">
                <span className="detail-label">Autoriza Imagem</span>
                <span className="detail-value">{selected.autoriza_imagem ? 'Sim' : 'Não'}</span>
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
                  <div className="detail-item">
                    <span className="detail-label">Assinatura</span>
                    <span className="detail-value">{selected.assinatura_responsavel ? 'Assinado' : 'Pendente'}</span>
                  </div>
                </>
              )}
              <div className="detail-item detail-full" style={{ marginTop: 8 }}>
                <span className="detail-label">Data de Inscrição</span>
                <span className="detail-value">{new Date(selected.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
