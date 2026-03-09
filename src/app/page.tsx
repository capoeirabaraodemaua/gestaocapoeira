'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { graduacoes, getCordaColors, nomenclaturaGraduacao } from '@/lib/graduacoes';
import Link from 'next/link';
import Carteirinha, { CarteirinhaData } from '@/components/Carteirinha';
import DocumentsBar from '@/components/DocumentsBar';

type SuccessData = CarteirinhaData;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const carteirinhaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardCpf, setCardCpf] = useState('');
  const [cardData, setCardData] = useState<SuccessData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState('');
  const [activeSection, setActiveSection] = useState<'ficha' | 'carteirinha'>('ficha');
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

      // Busca o ID e número de inscrição do aluno recém inserido
      const { data: newStudent } = await supabase
        .from('students')
        .select('id, ordem_inscricao')
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
      setSuccessData({
        nome: form.nome_completo,
        cpf: form.cpf,
        identidade: form.identidade,
        nucleo,
        graduacao,
        tipo_graduacao: tipoGraduacao,
        foto_url: foto_url || null,
        menor_de_idade: menorDeIdade,
        nome_pai: form.nome_pai,
        nome_mae: form.nome_mae,
        nome_responsavel: menorDeIdade ? form.nome_responsavel : null,
        cpf_responsavel: menorDeIdade ? form.cpf_responsavel : null,
        inscricao_numero: (newStudent as any)?.ordem_inscricao ?? null,
        telefone: form.telefone || null,
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao realizar inscrição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const buscarCarteirinha = async () => {
    const cpfClean = cardCpf.replace(/\D/g, '');
    if (cpfClean.length < 11) { setCardError('CPF inválido.'); return; }
    setCardLoading(true); setCardError(''); setCardData(null);
    try {
      const { data, error } = await supabase.from('students').select('*').eq('cpf', cardCpf).limit(1).single();
      if (error || !data) { setCardError('Aluno não encontrado. Verifique o CPF.'); }
      else {
        setCardData({
          nome: data.nome_completo,
          cpf: data.cpf,
          identidade: data.identidade,
          nucleo: data.nucleo || '',
          graduacao: data.graduacao || '',
          tipo_graduacao: data.tipo_graduacao || '',
          foto_url: data.foto_url || null,
          menor_de_idade: data.menor_de_idade || false,
          nome_pai: data.nome_pai || '',
          nome_mae: data.nome_mae || '',
          nome_responsavel: data.nome_responsavel || null,
          cpf_responsavel: data.cpf_responsavel || null,
          inscricao_numero: (data as any).ordem_inscricao ?? null,
          telefone: data.telefone || null,
        });
      }
    } catch { setCardError('Erro ao buscar dados.'); }
    setCardLoading(false);
  };

  const shareCarteirinhaWhatsApp = (telefone: string | null | undefined, nome: string, cpfAluno?: string) => {
    const base = window.location.origin;
    const cpfEncoded = cpfAluno ? encodeURIComponent(cpfAluno) : '';
    const url = `${base}/carteirinha${cpfEncoded ? `?cpf=${cpfEncoded}` : ''}`;
    const phone = (telefone || '').replace(/\D/g, '');
    const br = phone.startsWith('55') ? phone : `55${phone}`;
    const msg = encodeURIComponent(
`🎖️ *Carteirinha ACCBM — Capoeira Barão de Mauá*

Olá, *${nome}*! Sua carteirinha de associado está disponível. Toque no link abaixo para visualizar e imprimir:

🔗 ${url}

_Associação Cultural de Capoeira Barão de Mauá_`
    );
    if (phone.length >= 10) {
      window.open(`https://wa.me/${br}?text=${msg}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    }
  };

  const printCard = async (ref: React.RefObject<HTMLDivElement | null>, nome: string) => {
    const el = ref.current;
    if (!el) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Credencial — ${nome}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        @page { size: A6 landscape; margin: 4mm; }
        html, body { width:100%; height:100%; background:#fff; display:flex; justify-content:center; align-items:center; }
        img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
        @media print { html,body { margin:0; padding:0; } }
      </style>
      </head><body><img src="${imgData}" /><script>window.onload=()=>{window.print();setTimeout(()=>window.close(),2000);}<\/script></body></html>
    `);
    printWin.document.close();
  };

  const selectedColors = graduacao ? getCordaColors(graduacao) : [];

  return (
    <>
      {/* Hero Banner — altura total, sem sobreposição */}
        <div className="hero-banner" style={{ position: 'relative', overflow: 'hidden', minHeight: 400 }}>
          <img
            src="/wallpaper-capoeira.jpg"
            alt="Capoeira Barão de Mauá"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              zIndex: 0,
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 100%)', zIndex: 1 }} />
        </div>

        <div className="container" style={{ marginTop: 0, position: 'relative', zIndex: 3 }}>
          {/* Action tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, marginBottom: 0, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveSection('ficha')}
              style={{
                background: activeSection === 'ficha' ? 'linear-gradient(135deg, #b45309 0%, #78350f 100%)' : 'rgba(180,83,9,0.12)',
                border: 'none',
                borderRadius: '10px 10px 0 0',
                padding: '11px 22px',
                color: activeSection === 'ficha' ? '#fff' : '#78350f',
                fontWeight: 800,
                fontSize: '0.88rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Fazer Cadastro
            </button>
            <a
              href="/presenca"
              style={{
                background: 'rgba(22,163,74,0.85)',
                borderRadius: '10px 10px 0 0',
                padding: '11px 22px',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.88rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              Registrar Presença
            </a>
            <button
              type="button"
              onClick={() => setActiveSection('carteirinha')}
              style={{
                background: activeSection === 'carteirinha' ? '#1d4ed8' : 'rgba(29,78,216,0.1)',
                border: 'none',
                borderBottom: 'none',
                borderRadius: '10px 10px 0 0',
                padding: '11px 22px',
                color: activeSection === 'carteirinha' ? '#ffffff' : '#1d4ed8',
                fontWeight: 800,
                fontSize: '0.88rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Credencial do Aluno
            </button>
          </div>

          {activeSection === 'ficha' && (
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
                    <option key={g} value={g}>{g}{nomenclaturaGraduacao[g] ? ` — ${nomenclaturaGraduacao[g]}` : ''}</option>
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{graduacao}</span>
                    {nomenclaturaGraduacao[graduacao] && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(220,38,38,0.12)', color: '#f87171', border: '1px solid rgba(220,38,38,0.25)' }}>
                        {nomenclaturaGraduacao[graduacao]}
                      </span>
                    )}
                  </div>
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
            {loading ? 'Enviando...' : 'Finalizar Cadastro'}
          </button>
        </form>
        )}

        {/* ===== ABA CARTEIRINHA ===== */}
        {activeSection === 'carteirinha' && (
          <div className="form-section" style={{ borderTopLeftRadius: 0, marginBottom: 32 }}>
            <h2 className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Credencial do Aluno
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16, marginTop: -4 }}>
              Informe seu CPF para gerar e imprimir sua credencial de associado.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                placeholder="CPF (000.000.000-00)"
                value={cardCpf}
                onChange={e => setCardCpf(formatCPF(e.target.value))}
                onKeyDown={e => e.key === 'Enter' && buscarCarteirinha()}
                style={{ flex: 1, minWidth: 200 }}
              />
              <button
                type="button"
                onClick={buscarCarteirinha}
                disabled={cardLoading}
                style={{ background: 'linear-gradient(135deg,#b45309,#78350f)', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap' }}
              >
                {cardLoading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {cardError && <p style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 8, fontWeight: 600 }}>⚠ {cardError}</p>}

            {cardData && (
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div ref={cardRef}>
                  <Carteirinha data={cardData} />
                </div>
                <button
                  type="button"
                  onClick={() => printCard(cardRef, cardData.nome)}
                  style={{ padding: '12px 32px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir / Salvar PDF
                </button>
                <button
                  type="button"
                  onClick={() => shareCarteirinhaWhatsApp(cardData.telefone, cardData.nome, cardData.cpf)}
                  style={{ padding: '12px 24px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Enviar via WhatsApp
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Success modal */}
      {success && successData && (
        <div className="success-overlay" style={{ overflowY: 'auto', padding: '20px 0' }}>
          <div className="success-card" style={{ maxWidth: 420, width: '95%', padding: '28px 24px' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a', margin: '0 0 6px' }}>Cadastro Realizado com Sucesso!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 10px' }}>
                Bem-vindo(a), <strong style={{ color: 'var(--text-primary)' }}>{successData.nome.split(' ')[0]}</strong>! Sua carteirinha está pronta.
              </p>
              {successData.inscricao_numero != null && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', borderRadius: 8, padding: '6px 16px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Matrícula</span>
                  <span style={{ color: '#fbbf24', fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.06em' }}>
                    ACCBM-{String(successData.inscricao_numero).padStart(6, '0')}
                  </span>
                </div>
              )}
            </div>

            {/* Carteirinha */}
            <div ref={carteirinhaRef} style={{ marginBottom: 16 }}>
              <Carteirinha data={successData} />
            </div>

            {/* Action buttons */}
            <button
              onClick={() => printCard(carteirinhaRef, successData.nome)}
              style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Imprimir / Salvar PDF
            </button>
            <button
              onClick={() => shareCarteirinhaWhatsApp(successData.telefone, successData.nome, successData.cpf)}
              style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,rgba(37,211,102,0.15),rgba(37,211,102,0.08))', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Enviar via WhatsApp
            </button>
            <button
              className="btn-submit"
              style={{ marginTop: 0, background: 'linear-gradient(135deg,#16a34a,#15803d)' }}
              onClick={() => window.location.reload()}
            >
              Nova Inscrição
            </button>
          </div>
        </div>
      )}

      {/* ── Documentos ACCBM — parte inferior da página ── */}
      <div className="container" style={{ marginTop: 8 }}>
        <DocumentsBar />
      </div>

      {/* ── Rodapé ── */}
      <footer style={{ marginTop:24, paddingBottom:24, display:'flex', justifyContent:'flex-end', paddingRight:4 }}>
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          background:'rgba(37,211,102,0.07)', border:'1px solid rgba(37,211,102,0.25)',
          borderRadius:12, padding:'10px 14px',
        }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', lineHeight:1.4 }}>
              Site criado pelo
            </div>
            <div style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-primary)', lineHeight:1.4 }}>
              Instrutor André Ferreira
            </div>
          </div>
          <a
            href="https://wa.me/5521966102513"
            target="_blank"
            rel="noopener noreferrer"
            title="Mais informações: (21) 96610-2513"
            style={{
              display:'flex', alignItems:'center', gap:6,
              background:'linear-gradient(135deg,#25d366,#128c7e)',
              color:'#fff', borderRadius:9, padding:'8px 12px',
              textDecoration:'none', fontWeight:700, fontSize:'0.78rem', flexShrink:0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            (21) 96610-2513
          </a>
        </div>
      </footer>

      </>
    );
}
