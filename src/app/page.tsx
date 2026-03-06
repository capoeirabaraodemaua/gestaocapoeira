'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { graduacoes, getCordaColors } from '@/lib/graduacoes';
import Link from 'next/link';

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
  const [duplicateErrors, setDuplicateErrors] = useState<{ cpf?: string; identidade?: string; nome_completo?: string; email?: string }>({});
  const [checkingDuplicate, setCheckingDuplicate] = useState<{ cpf?: boolean; identidade?: boolean; nome_completo?: boolean; email?: boolean }>({});

  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    identidade: '',
    data_nascimento: '',
    email: '',
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
    // Assinaturas separadas pai/mãe
    assinatura_pai: false,
    assinatura_mae: false,
  });

  useEffect(() => {
    if (form.data_nascimento) {
      // Adicionar T12:00:00 evita problema de fuso (UTC meia-noite vs local)
      const birth = new Date(form.data_nascimento + 'T12:00:00');
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      setMenorDeIdade(age < 18);
    } else {
      setMenorDeIdade(false);
    }
  }, [form.data_nascimento]);

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

  const checkDuplicate = async (field: 'cpf' | 'identidade' | 'nome_completo' | 'email', value: string) => {
    const cleanValue = value.trim();
    if (!cleanValue) return;
    setCheckingDuplicate(prev => ({ ...prev, [field]: true }));
    setDuplicateErrors(prev => ({ ...prev, [field]: undefined }));
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, nome_completo')
        .eq(field, cleanValue)
        .limit(1);
      // Se a coluna não existe no banco, ignora silenciosamente
      if (error && (error.message.includes('column') || error.message.includes('schema'))) {
        setCheckingDuplicate(prev => ({ ...prev, [field]: false }));
        return;
      }
      if (data && data.length > 0) {
        const labels: Record<string, string> = { cpf: 'CPF', identidade: 'Identidade (RG)', nome_completo: 'Nome', email: 'E-mail' };
        setDuplicateErrors(prev => ({
          ...prev,
          [field]: `${labels[field]} já cadastrado(a): ${data[0].nome_completo}`,
        }));
      }
    } catch {}
    setCheckingDuplicate(prev => ({ ...prev, [field]: false }));
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
    if (duplicateErrors.cpf || duplicateErrors.identidade || duplicateErrors.nome_completo || duplicateErrors.email) {
      alert('Corrija os campos duplicados antes de enviar.');
      return;
    }
    setLoading(true);

    try {
      // Verificação server-side de duplicatas antes de inserir
      const { data: existing } = await supabase
        .from('students')
        .select('id, nome_completo, cpf')
        .or(`nome_completo.eq.${form.nome_completo},cpf.eq.${form.cpf}`)
        .limit(1);
      if (existing && existing.length > 0) {
        const dup = existing[0];
        const motivo =
          dup.cpf === form.cpf ? `CPF ${form.cpf}` : `nome "${form.nome_completo}"`;
        alert(`Cadastro duplicado detectado! Já existe um aluno com ${motivo}: ${dup.nome_completo}`);
        setLoading(false);
        return;
      }

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

      const payload: Record<string, unknown> = {
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
        assinatura_pai: menorDeIdade ? form.assinatura_pai : false,
        assinatura_mae: menorDeIdade ? form.assinatura_mae : false,
      };
      if (form.email) payload.email = form.email;

      let { error } = await supabase.from('students').insert(payload);

      // Retry removendo colunas que ainda não existem no banco (até 3 tentativas)
      for (let attempt = 0; attempt < 3 && error; attempt++) {
        const msg = error.message || '';
        const colMatch = msg.match(/column[s]? ['"]?(\w+)['"]? of|Could not find the '(\w+)' column/i);
        const missingCol = colMatch ? (colMatch[1] || colMatch[2]) : null;
        if (missingCol && payload[missingCol] !== undefined) {
          delete payload[missingCol];
          const r = await supabase.from('students').insert(payload);
          error = r.error;
        } else {
          break;
        }
      }

      if (error) throw error;

      // Busca o ID do aluno recém inserido
      const { data: newStudent } = await supabase
        .from('students')
        .select('id')
        .eq('cpf', form.cpf)
        .limit(1)
        .single();

      // Salva dados extras (email, assinaturas pai/mãe) no Storage como JSON backup
      if (newStudent?.id && (form.email || form.assinatura_pai || form.assinatura_mae)) {
        const extras = {
          email: form.email || null,
          assinatura_pai: form.assinatura_pai,
          assinatura_mae: form.assinatura_mae,
          updated_at: new Date().toISOString(),
        };
        supabase.storage.from('photos').upload(
          `extras/${newStudent.id}.json`,
          new Blob([JSON.stringify(extras)], { type: 'application/json' }),
          { upsert: true }
        ).catch(() => {});
      }

      // Envia email de confirmação (não bloqueia, falha silenciosa)
      if (form.email) {
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: form.email, nome: form.nome_completo, nucleo, graduacao }),
        }).catch(() => {});
      }

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
            src="/banner-maua.png"
            alt="Barão de Mauá"
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
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%)', zIndex: 1 }} />
        </div>

        <div className="container" style={{ marginTop: '-30px', position: 'relative', zIndex: 3 }}>
          {/* Aba */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 0 }}>
            <div style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #7c3aed 100%)',
              borderRadius: '12px 12px 0 0',
              padding: '12px 32px',
            }}>
              <span style={{
                color: '#fff',
                fontWeight: 800,
                fontSize: '1.1rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontFamily: 'Inter, sans-serif',
              }}>Ficha de Inscrição</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Núcleo */}
            <div className="form-section" style={{ borderTopLeftRadius: 0 }}>
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
                <input
                  name="nome_completo"
                  value={form.nome_completo}
                  onChange={(e) => { handleChange(e); setDuplicateErrors(prev => ({ ...prev, nome_completo: undefined })); }}
                  onBlur={() => checkDuplicate('nome_completo', form.nome_completo)}
                  required
                  placeholder="Digite seu nome completo"
                  style={duplicateErrors.nome_completo ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {checkingDuplicate.nome_completo && <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>Verificando...</span>}
                {duplicateErrors.nome_completo && (
                  <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                    ⚠ {duplicateErrors.nome_completo}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>CPF <span className="required">*</span></label>
                <input
                  name="cpf"
                  value={form.cpf}
                  onChange={(e) => { handleCPFChange(e); setDuplicateErrors(prev => ({ ...prev, cpf: undefined })); }}
                  onBlur={() => checkDuplicate('cpf', form.cpf)}
                  required
                  placeholder="000.000.000-00"
                  style={duplicateErrors.cpf ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {checkingDuplicate.cpf && <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>Verificando...</span>}
                {duplicateErrors.cpf && (
                  <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                    ⚠ {duplicateErrors.cpf}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Identidade (RG) <span className="required">*</span></label>
                <input
                  name="identidade"
                  value={form.identidade}
                  onChange={(e) => { handleChange(e); setDuplicateErrors(prev => ({ ...prev, identidade: undefined })); }}
                  onBlur={() => checkDuplicate('identidade', form.identidade)}
                  required
                  placeholder="Número do RG"
                  style={duplicateErrors.identidade ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {checkingDuplicate.identidade && <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>Verificando...</span>}
                {duplicateErrors.identidade && (
                  <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                    ⚠ {duplicateErrors.identidade}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Data de Nascimento <span className="required">*</span></label>
                <input
                  type="date"
                  name="data_nascimento"
                  value={form.data_nascimento}
                  onChange={e => {
                    handleChange(e);
                    const val = e.target.value;
                    if (val) {
                      const birth = new Date(val + 'T12:00:00');
                      const today = new Date();
                      let age = today.getFullYear() - birth.getFullYear();
                      const m = today.getMonth() - birth.getMonth();
                      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                      setMenorDeIdade(age < 18);
                    } else {
                      setMenorDeIdade(false);
                    }
                  }}
                  required
                />
                {form.data_nascimento && (
                  <span style={{ fontSize: '0.78rem', marginTop: 4, display: 'block', color: menorDeIdade ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {menorDeIdade ? '⚠ Menor de idade — preencha o Termo de Autorização abaixo' : '✓ Maior de idade'}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Telefone <span className="required">*</span></label>
                <input name="telefone" value={form.telefone} onChange={handleTelefoneChange} required placeholder="(00) 00000-0000" />
              </div>
              <div className="form-group">
                <label>E-mail</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={e => { handleChange(e); setDuplicateErrors(prev => ({ ...prev, email: undefined })); }}
                  onBlur={() => form.email && checkDuplicate('email', form.email)}
                  placeholder="seu@email.com"
                  style={duplicateErrors.email ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {duplicateErrors.email && (
                  <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 4, fontWeight: 600 }}>
                    ⚠ {duplicateErrors.email}
                  </p>
                )}
              </div>
              <div className="form-group">
                <label>Nome do Pai</label>
                <input name="nome_pai" value={form.nome_pai} onChange={handleChange} placeholder="Nome completo do pai" />
              </div>
              <div className="form-group">
                <label>Nome da Mãe</label>
                <input name="nome_mae" value={form.nome_mae} onChange={handleChange} placeholder="Nome completo da mãe" />
              </div>
            </div>
          </div>

          {/* Termo de Autorização — aparece automaticamente para menores de idade */}
          {menorDeIdade && (
            <div className="form-section" style={{ border: '2px solid #dc2626', padding: 0, overflow: 'hidden' }}>
              {/* Cabeçalho */}
              <div style={{ background: '#dc2626', padding: '14px 20px', textAlign: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Termo de Autorização — Menor de Idade
                </div>
              </div>

              <div style={{ padding: '20px 20px' }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem', lineHeight: 1.9, textAlign: 'justify', marginBottom: 20, color: 'var(--text-primary)' }}>
                  Eu, responsável legal pelo menor inscrito, autorizo sua participação nas atividades
                  de capoeira realizadas pela <strong>Associação Cultural de Capoeira Barão de Mauá</strong>,
                  estando ciente das atividades físicas envolvidas.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                      Nome do Responsável <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      name="nome_responsavel"
                      value={form.nome_responsavel}
                      onChange={handleChange}
                      required={menorDeIdade}
                      placeholder="Nome completo do responsável legal"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                      CPF do Responsável <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      name="cpf_responsavel"
                      value={form.cpf_responsavel}
                      onChange={handleCPFResponsavelChange}
                      required={menorDeIdade}
                      placeholder="000.000.000-00"
                      style={{ maxWidth: 220 }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed rgba(220,38,38,0.4)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Assinatura do Pai */}
                  <div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Assinatura do Pai
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Pai:</span>
                      <div style={{
                        flex: 1, borderBottom: `1px solid ${form.assinatura_pai ? '#16a34a' : 'var(--border)'}`,
                        minHeight: 28, paddingBottom: 2,
                        fontFamily: 'Georgia, serif', fontSize: '0.9rem', fontStyle: 'italic',
                        color: form.assinatura_pai ? '#16a34a' : 'transparent', transition: 'all 0.2s',
                      }}>
                        {form.assinatura_pai ? (form.nome_pai || '— não informado —') : ''}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.83rem', lineHeight: 1.55 }}>
                      <input
                        type="checkbox"
                        name="assinatura_pai"
                        checked={form.assinatura_pai}
                        onChange={handleChange}
                        style={{ marginTop: 3, flexShrink: 0, accentColor: '#16a34a', width: 17, height: 17 }}
                      />
                      <span>
                        {form.assinatura_pai ? '✅ ' : ''}Eu, <strong>{form.nome_pai || '(nome do pai)'}</strong>,
                        assino eletronicamente e autorizo a participação do menor nas atividades da
                        Associação Cultural de Capoeira Barão de Mauá.
                      </span>
                    </label>
                  </div>

                  {/* Assinatura da Mãe */}
                  <div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Assinatura da Mãe
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Mãe:</span>
                      <div style={{
                        flex: 1, borderBottom: `1px solid ${form.assinatura_mae ? '#16a34a' : 'var(--border)'}`,
                        minHeight: 28, paddingBottom: 2,
                        fontFamily: 'Georgia, serif', fontSize: '0.9rem', fontStyle: 'italic',
                        color: form.assinatura_mae ? '#16a34a' : 'transparent', transition: 'all 0.2s',
                      }}>
                        {form.assinatura_mae ? (form.nome_mae || '— não informado —') : ''}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.83rem', lineHeight: 1.55 }}>
                      <input
                        type="checkbox"
                        name="assinatura_mae"
                        checked={form.assinatura_mae}
                        onChange={handleChange}
                        style={{ marginTop: 3, flexShrink: 0, accentColor: '#16a34a', width: 17, height: 17 }}
                      />
                      <span>
                        {form.assinatura_mae ? '✅ ' : ''}Eu, <strong>{form.nome_mae || '(nome da mãe)'}</strong>,
                        assino eletronicamente e autorizo a participação do menor nas atividades da
                        Associação Cultural de Capoeira Barão de Mauá.
                      </span>
                    </label>
                  </div>

                </div>
              </div>
            </div>
          )}

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

          {/* Autorização de Uso de Imagem */}
          <div className="form-section">
            <h2 className="form-section-title">Autorização de Uso de Imagem</h2>
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

          <button type="submit" className="btn-submit" disabled={loading || !!(duplicateErrors.cpf || duplicateErrors.identidade || duplicateErrors.nome_completo || duplicateErrors.email)}>
            {loading ? 'Enviando...' : 'Realizar Inscrição'}
          </button>
        </form>

        {/* Acesso ao Registro de Presença */}
        <Link href="/presenca" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginTop: 16,
          marginBottom: 32,
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #16a34a, #15803d)',
          borderRadius: 14,
          textDecoration: 'none',
          boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Registrar Presença no Treino
          </span>
        </Link>
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


      </>
    );
}
