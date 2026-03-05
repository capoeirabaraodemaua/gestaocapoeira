'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { graduacoes, getCordaColors } from '@/lib/graduacoes';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [menorDeIdade, setMenorDeIdade] = useState(false);
  const [tipoGraduacao, setTipoGraduacao] = useState('adulta');
  const [graduacao, setGraduacao] = useState('');
  const [nucleo, setNucleo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    identidade: '',
    data_nascimento: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
      telefone: '',
      nome_pai: '',
      nome_mae: '',
    autoriza_imagem: false,
    nome_responsavel: '',
    cpf_responsavel: '',
    assinatura_responsavel: false,
  });

  useEffect(() => {
    if (form.data_nascimento) {
      const birth = new Date(form.data_nascimento);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      setMenorDeIdade(age < 18);
    }
  }, [form.data_nascimento]);

  const fetchStudents = async () => {
    setListLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setStudents(data);
    setListLoading(false);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const filteredStudents = students.filter(s => {
    const matchSearch =
      s.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
      s.cpf.includes(search);
    const matchNucleo = !filterNucleo || s.nucleo === filterNucleo;
    return matchSearch && matchNucleo;
  });

  const openEditStudent = (student: Student) => {
    setEditingStudent(student);
    setEditForm({ ...student });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const saveEdit = async () => {
    if (!editingStudent) return;
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
      .eq('id', editingStudent.id);
    setSaving(false);
    if (error) {
      alert('Erro ao salvar. Tente novamente.');
    } else {
      setEditingStudent(null);
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
      fetchStudents();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const formatCPF = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const formatCEP = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0,5)}-${d.slice(5)}`;
  };

    const formatTelefone = (v: string) => {
      const d = v.replace(/\D/g, '').slice(0, 11);
      if (d.length <= 2) return d;
      if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
      return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    };

    const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(prev => ({ ...prev, telefone: formatTelefone(e.target.value) }));
    };

    const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, cpf: formatCPF(e.target.value) }));
  };

  const handleCPFResponsavelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, cpf_responsavel: formatCPF(e.target.value) }));
  };

  const handleCEPChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cep = formatCEP(e.target.value);
    setForm(prev => ({ ...prev, cep }));
    const digits = cep.replace(/\D/g, '');
    if (digits.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm(prev => ({
            ...prev,
            endereco: data.logradouro || prev.endereco,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            estado: data.uf || prev.estado,
          }));
        }
      } catch {}
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let foto_url = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, photoFile);
        if (!uploadError) {
          const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
          foto_url = data.publicUrl;
        }
      }

      const { error } = await supabase.from('students').insert({
        nome_completo: form.nome_completo,
        cpf: form.cpf,
          identidade: form.identidade,
          data_nascimento: form.data_nascimento,
          telefone: form.telefone,
        cep: form.cep,
        endereco: form.endereco,
        numero: form.numero,
        complemento: form.complemento,
        bairro: form.bairro,
        cidade: form.cidade,
        estado: form.estado,
        graduacao,
          tipo_graduacao: tipoGraduacao,
          nucleo,
          foto_url,
        nome_pai: form.nome_pai,
        nome_mae: form.nome_mae,
        autoriza_imagem: form.autoriza_imagem,
        menor_de_idade: menorDeIdade,
        nome_responsavel: menorDeIdade ? form.nome_responsavel : null,
        cpf_responsavel: menorDeIdade ? form.cpf_responsavel : null,
        assinatura_responsavel: menorDeIdade ? form.assinatura_responsavel : false,
      });

      if (error) throw error;
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Erro ao realizar inscrição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const selectedColors = graduacao ? getCordaColors(graduacao) : [];

  return (
    <>
      {/* Hero Banner */}
        <div className="hero-banner" style={{ position: 'relative', overflow: 'hidden' }}>
          <img
            src="/mestres.png"
            alt="Mestres"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 1,
              zIndex: 0,
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%)', zIndex: 1 }} />
          <img
            src="/logo.jpg"
            alt="Logo Associação Cultural de Capoeira Barão de Mauá"
            className="hero-logo"
            style={{ position: 'absolute', top: 16, left: 16, width: 80, height: 80, objectFit: 'contain', borderRadius: '50%', zIndex: 2 }}
          />
          <div className="hero-content" style={{ position: 'relative', zIndex: 2 }}>
            <h1 className="hero-title">Associação Cultural de Capoeira<br/>Barão de Mauá</h1>
            <p className="hero-subtitle">Ficha de Inscrição</p>
          </div>
        </div>

        <div className="container" style={{ marginTop: '-30px', position: 'relative', zIndex: 3 }}>
          <form onSubmit={handleSubmit}>
            {/* Núcleo */}
            <div className="form-section">
              <h2 className="form-section-title">Núcleo de Treinamento</h2>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Selecione o Núcleo <span className="required">*</span></label>
                  <select value={nucleo} onChange={(e) => setNucleo(e.target.value)} required>
                    <option value="">Selecione o núcleo</option>
                    <option value="Saracuruna">Saracuruna</option>
                    <option value="Mauá">Mauá</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Dados Pessoais */}
          <div className="form-section">
            <h2 className="form-section-title">Dados Pessoais</h2>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Nome Completo <span className="required">*</span></label>
                <input name="nome_completo" value={form.nome_completo} onChange={handleChange} required placeholder="Digite seu nome completo" />
              </div>
              <div className="form-group">
                <label>CPF <span className="required">*</span></label>
                <input name="cpf" value={form.cpf} onChange={handleCPFChange} required placeholder="000.000.000-00" />
              </div>
              <div className="form-group">
                <label>Identidade (RG) <span className="required">*</span></label>
                <input name="identidade" value={form.identidade} onChange={handleChange} required placeholder="Número do RG" />
              </div>
              <div className="form-group">
                <label>Data de Nascimento <span className="required">*</span></label>
                <input type="date" name="data_nascimento" value={form.data_nascimento} onChange={handleChange} required />
              </div>
                <div className="form-group">
                  <label>Telefone <span className="required">*</span></label>
                  <input name="telefone" value={form.telefone} onChange={handleTelefoneChange} required placeholder="(00) 00000-0000" />
                </div>
                <div className="form-group">
                  <label>Nome do Pai</label>
                <input name="nome_pai" value={form.nome_pai} onChange={handleChange} placeholder="Nome completo do pai" />
              </div>
              <div className="form-group full-width">
                <label>Nome da Mãe</label>
                <input name="nome_mae" value={form.nome_mae} onChange={handleChange} placeholder="Nome completo da mãe" />
              </div>
            </div>
          </div>

          {/* Foto */}
          <div className="form-section">
            <h2 className="form-section-title">Foto do Aluno</h2>
            <div className="photo-upload">
              <div className="photo-preview" onClick={() => fileRef.current?.click()}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" />
                ) : (
                  <div className="photo-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="4" />
                      <circle cx="12" cy="10" r="3" />
                      <path d="M6 21v-1a6 6 0 0112 0v1" />
                    </svg>
                    Clique para adicionar foto
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
            </div>
          </div>

          {/* Endereço */}
          <div className="form-section">
            <h2 className="form-section-title">Endereço</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>CEP <span className="required">*</span></label>
                <input name="cep" value={form.cep} onChange={handleCEPChange} required placeholder="00000-000" />
              </div>
              <div className="form-group">
                <label>Estado <span className="required">*</span></label>
                <input name="estado" value={form.estado} onChange={handleChange} required placeholder="UF" />
              </div>
              <div className="form-group full-width">
                <label>Endereço <span className="required">*</span></label>
                <input name="endereco" value={form.endereco} onChange={handleChange} required placeholder="Rua, Avenida..." />
              </div>
              <div className="form-group">
                <label>Número <span className="required">*</span></label>
                <input name="numero" value={form.numero} onChange={handleChange} required placeholder="Nº" />
              </div>
              <div className="form-group">
                <label>Complemento</label>
                <input name="complemento" value={form.complemento} onChange={handleChange} placeholder="Apto, Bloco..." />
              </div>
              <div className="form-group">
                <label>Bairro <span className="required">*</span></label>
                <input name="bairro" value={form.bairro} onChange={handleChange} required placeholder="Bairro" />
              </div>
              <div className="form-group">
                <label>Cidade <span className="required">*</span></label>
                <input name="cidade" value={form.cidade} onChange={handleChange} required placeholder="Cidade" />
              </div>
            </div>
          </div>

          {/* Graduação */}
          <div className="form-section">
            <h2 className="form-section-title">Graduação</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>Tipo <span className="required">*</span></label>
                <select value={tipoGraduacao} onChange={(e) => { setTipoGraduacao(e.target.value); setGraduacao(''); }}>
                  <option value="infantil">Infantil</option>
                  <option value="adulta">Adulta</option>
                </select>
              </div>
              <div className="form-group">
                <label>Graduação (Corda) <span className="required">*</span></label>
                <select value={graduacao} onChange={(e) => setGraduacao(e.target.value)} required>
                  <option value="">Selecione a graduação</option>
                  {graduacoes.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              {graduacao && (
                <div className="form-group full-width">
                  <label>Visualização da Corda</label>
                  <div className="corda-visual" style={{ height: 20, borderRadius: 10, overflow: 'hidden', display: 'flex' }}>
                    {selectedColors.map((color, i) => (
                      <div key={i} className="corda-stripe" style={{ backgroundColor: color, flex: 1, height: '100%', borderRadius: 0 }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>{graduacao} — {tipoGraduacao}</span>
                </div>
              )}
            </div>
          </div>

          {/* Autorizações */}
          <div className="form-section">
            <h2 className="form-section-title">Autorizações</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="checkbox-group">
                <input type="checkbox" name="autoriza_imagem" checked={form.autoriza_imagem} onChange={handleChange} />
                <span>
                  Autorizo o uso da minha imagem (ou do menor sob minha responsabilidade) para fins de divulgação
                  em mídias sociais, site e materiais promocionais da Associação Cultural de Capoeira Barão de Mauá.
                </span>
              </label>
            </div>
          </div>

          {/* Responsável (menor de idade) */}
          {menorDeIdade && (
            <div className="form-section responsavel-section">
              <h2 className="form-section-title" style={{ color: 'var(--danger)' }}>
                Dados do Responsável (Aluno Menor de Idade)
              </h2>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Nome do Responsável <span className="required">*</span></label>
                  <input name="nome_responsavel" value={form.nome_responsavel} onChange={handleChange} required placeholder="Nome completo do responsável" />
                </div>
                <div className="form-group">
                  <label>CPF do Responsável <span className="required">*</span></label>
                  <input name="cpf_responsavel" value={form.cpf_responsavel} onChange={handleCPFResponsavelChange} required placeholder="000.000.000-00" />
                </div>
                <div className="form-group">
                  <label>&nbsp;</label>
                  <label className="checkbox-group" style={{ margin: 0 }}>
                    <input type="checkbox" name="assinatura_responsavel" checked={form.assinatura_responsavel} onChange={handleChange} />
                    <span>
                      Eu, como responsável legal, autorizo a inscrição deste menor na Associação Cultural de Capoeira
                      Barão de Mauá e me responsabilizo por todas as atividades realizadas.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading || (menorDeIdade && !form.assinatura_responsavel)}>
            {loading ? 'Enviando...' : 'Realizar Inscrição'}
          </button>
        </form>
      </div>

      {/* Success modal */}
      {success && (
        <div className="success-overlay" onClick={() => setSuccess(false)}>
          <div className="success-card" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l3 3 5-5" />
            </svg>
            <h2>Inscrição Realizada!</h2>
            <p>Sua inscrição na Associação Cultural de Capoeira Barão de Mauá foi enviada com sucesso. Bem-vindo(a)!</p>
            <button className="btn-submit" style={{ marginTop: 20 }} onClick={() => window.location.reload()}>
              Nova Inscrição
            </button>
          </div>
        </div>
        )}

        {/* Student List Section */}
        <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
          <button
            onClick={() => setShowList(v => !v)}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #1a0a2e, #2d1854)',
              border: '1px solid rgba(139,92,246,0.4)',
              borderRadius: 12,
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Gerenciar Cadastros de Alunos ({students.length})</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showList ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {showList && (
            <div style={{ marginTop: 16 }}>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  <input
                    className="search-input"
                    style={{ flex: 1, minWidth: 200, border: '1.5px solid #1e40af' }}
                    placeholder="Buscar por nome ou CPF..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    className="search-input"
                    style={{ width: 160, border: '1.5px solid #1e40af' }}
                    value={filterNucleo}
                    onChange={(e) => setFilterNucleo(e.target.value)}
                  >
                  <option value="">Todos os núcleos</option>
                  <option value="Saracuruna">Saracuruna</option>
                  <option value="Mauá">Mauá</option>
                </select>
              </div>

              {listLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
              ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Nenhum aluno encontrado.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredStudents.map(student => {
                    const colors = getCordaColors(student.graduacao);
                    return (
                      <div key={student.id} style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        flexWrap: 'wrap',
                      }}>
                        {/* Avatar */}
                        {student.foto_url ? (
                          <img src={student.foto_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                          </div>
                        )}

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {student.nome_completo}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className={`badge ${student.nucleo === 'Saracuruna' ? 'badge-saracuruna' : student.nucleo === 'Mauá' ? 'badge-maua' : ''}`}>
                              {student.nucleo || '—'}
                            </span>
                            <div style={{ display: 'flex', width: 32, height: 8, borderRadius: 4, overflow: 'hidden' }}>
                              {colors.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
                            </div>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{student.graduacao}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => openEditStudent(student)}
                            style={{ padding: '7px 14px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(student)}
                            style={{ padding: '7px 14px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editingStudent && (
          <div className="modal-overlay" onClick={() => setEditingStudent(null)}>
            <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
              <h2>
                Editar Cadastro
                <button className="modal-close" onClick={() => setEditingStudent(null)}>&times;</button>
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
                  <span className="detail-label">Endereço</span>
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
                  <span className="detail-label">Logradouro</span>
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
                {editingStudent.menor_de_idade && (
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
                  onClick={() => setEditingStudent(null)}
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
      </>
    );
}
