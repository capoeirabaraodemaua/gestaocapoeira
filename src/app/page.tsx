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
        cep: form.cep,
        endereco: form.endereco,
        numero: form.numero,
        complemento: form.complemento,
        bairro: form.bairro,
        cidade: form.cidade,
        estado: form.estado,
        graduacao,
        tipo_graduacao: tipoGraduacao,
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
      <div className="hero-banner">
        <div className="hero-content">
            <img
              src="/logo.jpg"
              alt="Logo Associação Cultural de Capoeira Barão de Mauá"
              className="hero-logo"
              style={{ objectFit: 'contain', borderRadius: '50%', width: 160, height: 160 }}
            />
          <h1 className="hero-title">Associação Cultural de Capoeira<br/>Barão de Mauá</h1>
          <p className="hero-subtitle">Ficha de Inscrição</p>
        </div>
      </div>

      <div className="container" style={{ marginTop: '-30px', position: 'relative', zIndex: 3 }}>
        <form onSubmit={handleSubmit}>
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
    </>
  );
}
