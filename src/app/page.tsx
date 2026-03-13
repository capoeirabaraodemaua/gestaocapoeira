'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { graduacoes, getCordaColors, nomenclaturaGraduacao } from '@/lib/graduacoes';
import Link from 'next/link';
import Carteirinha, { CarteirinhaData } from '@/components/Carteirinha';
import DocumentsBar from '@/components/DocumentsBar';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type SuccessData = CarteirinhaData;

export default function Home() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const carteirinhaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardCpf, setCardCpf] = useState('');
  const [cardData, setCardData] = useState<SuccessData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState('');
  const [activeSection, setActiveSection] = useState<'ficha' | 'carteirinha' | 'financeiro'>('ficha');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [menorDeIdade, setMenorDeIdade] = useState(false);
  const [tipoGraduacao, setTipoGraduacao] = useState('adulta');
  const [graduacao, setGraduacao] = useState('');
  const [nucleo, setNucleo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [duplicateErrors, setDuplicateErrors] = useState<{ cpf?: string; identidade?: string; email?: string }>({});
  const [checkingDuplicate, setCheckingDuplicate] = useState<{ cpf?: boolean; identidade?: boolean; email?: boolean }>({});
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminCpf, setAdminCpf] = useState('');
  const [adminErro, setAdminErro] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminScreen, setAdminScreen] = useState<'login' | 'manage'>('login');
  const [adminConfigCpf, setAdminConfigCpf] = useState('09856925703'); // primary (backward compat)
  const [adminConfigCpfs, setAdminConfigCpfs] = useState<string[]>(['09856925703']); // up to 3
  const [manageTab, setManageTab] = useState<'edit' | 'include' | 'remove'>('edit');
  const [newAdminCpf, setNewAdminCpf] = useState('');
  const [manageSaving, setManageSaving] = useState(false);
  const [manageMsg, setManageMsg] = useState('');

  // Background changer state
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgModalOpen, setBgModalOpen] = useState(false);
  const [bgCpf, setBgCpf] = useState('');
  const [bgCpfOk, setBgCpfOk] = useState(false);
  const [bgCpfError, setBgCpfError] = useState('');
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadMsg, setBgUploadMsg] = useState('');
  const bgFileRef = useRef<HTMLInputElement>(null);

  // Load admin config CPF on mount
  useEffect(() => {
    fetch('/api/admin/config').then(r => r.json()).then(d => {
      const cpfs: string[] = Array.isArray(d.super_admin_cpfs) && d.super_admin_cpfs.length > 0
        ? d.super_admin_cpfs
        : d.super_admin_cpf ? [d.super_admin_cpf] : ['09856925703'];
      setAdminConfigCpfs(cpfs);
      setAdminConfigCpf(cpfs[0]);
    }).catch(() => {});
    // Load background URL
    fetch('/api/admin/background').then(r => r.json()).then(d => {
      if (d.url) setBgUrl(d.url);
    }).catch(() => {});
  }, []);

  // Login attempt limiting (max 5 attempts, 5-min lockout, stored in sessionStorage)
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000;

  function getLoginState() {
    try {
      const raw = sessionStorage.getItem('login_attempts');
      if (!raw) return { count: 0, lockedUntil: 0 };
      return JSON.parse(raw) as { count: number; lockedUntil: number };
    } catch { return { count: 0, lockedUntil: 0 }; }
  }
  function setLoginState(count: number, lockedUntil: number) {
    sessionStorage.setItem('login_attempts', JSON.stringify({ count, lockedUntil }));
  }

  async function handleAdminAccess() {
    const digits = adminCpf.replace(/\D/g, '');
    if (!digits) { setAdminErro('Digite seu CPF.'); return; }

    // Lockout check
    const ls = getLoginState();
    const now = Date.now();
    if (ls.lockedUntil > now) {
      const secs = Math.ceil((ls.lockedUntil - now) / 1000);
      setAdminErro(`Muitas tentativas. Aguarde ${secs}s antes de tentar novamente.`);
      return;
    }

    setAdminLoading(true);
    setAdminErro('');
    // Super admin CPFs (up to 3)
    if (adminConfigCpfs.includes(digits)) {
      sessionStorage.setItem('admin_auth', 'geral');
      window.location.href = '/admin';
      return;
    }
    // Check responsáveis config for nucleo-specific access
    try {
      const res = await fetch('/api/admin/responsaveis');
      const cfg = await res.json();
      const resp = (cfg.responsaveis || []).find((r: { cpf: string; cpf2?: string; nucleo_key: string }) =>
        (r.cpf || '').replace(/\D/g,'') === digits ||
        (r.cpf2 || '').replace(/\D/g,'') === digits
      );
      if (resp) {
        sessionStorage.setItem('admin_auth', resp.nucleo_key);
        window.location.href = '/admin';
        return;
      }
    } catch {}
    // Increment failed attempt
    const ls2 = getLoginState();
    const newCount = ls2.count + 1;
    if (newCount >= MAX_LOGIN_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_MS;
      setLoginState(0, lockUntil);
      setAdminErro(`CPF não autorizado. Conta bloqueada por 5 minutos após ${MAX_LOGIN_ATTEMPTS} tentativas falhas.`);
    } else {
      setLoginState(newCount, 0);
      setAdminErro(`CPF não autorizado. Tentativa ${newCount}/${MAX_LOGIN_ATTEMPTS}.`);
    }
    setAdminCpf('');
    setAdminLoading(false);
  }

  async function saveAdminCpfs(list: string[]) {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ super_admin_cpfs: list }),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      const saved: string[] = json.data.super_admin_cpfs;
      setAdminConfigCpfs(saved);
      setAdminConfigCpf(saved[0]);
      return true;
    }
    setManageMsg('Erro: ' + (json.error || 'falha ao salvar'));
    return false;
  }

  async function handleManageAdmin() {
    const digits = newAdminCpf.replace(/\D/g, '');
    if (digits.length < 11) { setManageMsg('CPF inválido (mínimo 11 dígitos).'); return; }
    setManageSaving(true);
    setManageMsg('');
    try {
      if (manageTab === 'include') {
        if (adminConfigCpfs.includes(digits)) { setManageMsg('Este CPF já está cadastrado como administrador.'); setManageSaving(false); return; }
        if (adminConfigCpfs.length >= 3) { setManageMsg('Limite de 3 administradores atingido. Remova um antes de incluir.'); setManageSaving(false); return; }
        const ok = await saveAdminCpfs([...adminConfigCpfs, digits]);
        if (ok) { setManageMsg('✓ Administrador incluído com sucesso!'); setNewAdminCpf(''); }
      } else if (manageTab === 'remove') {
        if (!adminConfigCpfs.includes(digits)) { setManageMsg('CPF não encontrado na lista de administradores.'); setManageSaving(false); return; }
        if (adminConfigCpfs.length === 1) { setManageMsg('Não é possível remover o único administrador ativo.'); setManageSaving(false); return; }
        const ok = await saveAdminCpfs(adminConfigCpfs.filter(c => c !== digits));
        if (ok) { setManageMsg('✓ Administrador removido com sucesso!'); setNewAdminCpf(''); }
      } else {
        // edit slot: replace by index (editSlot state)
        const ok = await saveAdminCpfs([digits]);
        if (ok) { setManageMsg('✓ Administrador atualizado!'); setNewAdminCpf(''); }
      }
    } catch (e: any) {
      setManageMsg('Erro: ' + e.message);
    }
    setManageSaving(false);
  }

  const [honeypot, setHoneypot] = useState('');

  const [form, setForm] = useState({
    nome_completo: '',
    apelido: '',
    nome_social: '',
    sexo: '',
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

  const checkDuplicate = async (field: 'cpf' | 'identidade' | 'email', value: string) => {
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
        const labels: Record<string, string> = { cpf: 'CPF', identidade: 'Numeração Única / RG', nome_completo: 'Nome', email: 'E-mail' };
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

  const handleSaveDraft = async () => {
    setDraftLoading(true); setDraftMsg('');
    const payload = {
      id: draftId || undefined,
      nome_completo: form.nome_completo || undefined,
      cpf: form.cpf || undefined,
      identidade: form.identidade || undefined,
      data_nascimento: form.data_nascimento || undefined,
      email: form.email || undefined,
      telefone: form.telefone || undefined,
      cep: form.cep || undefined,
      endereco: form.endereco || undefined,
      numero: form.numero || undefined,
      complemento: form.complemento || undefined,
      bairro: form.bairro || undefined,
      cidade: form.cidade || undefined,
      estado: form.estado || undefined,
      nucleo: nucleo || undefined,
      graduacao: graduacao || undefined,
      tipo_graduacao: tipoGraduacao || undefined,
      nome_pai: form.nome_pai || undefined,
      nome_mae: form.nome_mae || undefined,
      autoriza_imagem: form.autoriza_imagem,
      menor_de_idade: menorDeIdade,
      nome_responsavel: menorDeIdade ? (form.nome_responsavel || undefined) : undefined,
      cpf_responsavel: menorDeIdade ? (form.cpf_responsavel || undefined) : undefined,
    };
    try {
      const res = await fetch('/api/rascunhos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && data.data?.id) {
        setDraftId(data.data.id);
        const pend = data.data.dados_pendentes as string[];
        if (pend.length === 0) {
          setDraftMsg('✓ Rascunho salvo! Todos os dados preenchidos — clique em Finalizar para concluir.');
        } else {
          setDraftMsg(`✓ Rascunho salvo! Dados pendentes: ${pend.join(', ')}`);
        }
        // Send WhatsApp message with missing fields if phone present
        if (form.telefone && pend.length > 0) {
          const tel = form.telefone.replace(/\D/g, '');
          const phone = tel.startsWith('55') ? tel : `55${tel}`;
          const nome = form.nome_completo ? form.nome_completo.split(' ')[0] : 'Aluno';
          const msg = encodeURIComponent(
            `Olá ${nome}! Seu pré-cadastro na Associação Cultural de Capoeira Barão de Mauá foi salvo como rascunho.\n\nPara completar seu cadastro, ainda faltam as seguintes informações:\n${pend.map(p => `• ${p}`).join('\n')}\n\nAcesse o formulário e complete seu cadastro. 🥋`
          );
          window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${msg}`, '_blank');
        }
      } else {
        setDraftMsg('Erro ao salvar rascunho. Tente novamente.');
      }
    } catch {
      setDraftMsg('Erro ao salvar rascunho.');
    }
    setDraftLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Honeypot bot detection — bots fill hidden fields, humans don't
    if (honeypot) return;
    setLoading(true);

    try {
      // Upload de foto (storage público do Supabase)
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
        nome_completo: form.nome_completo || null,
        apelido: form.apelido || null,
        nome_social: form.nome_social || null,
        sexo: form.sexo || null,
        cpf: form.cpf || null,
        identidade: form.identidade || null,
        data_nascimento: form.data_nascimento || null,
        telefone: form.telefone || null,
        email: form.email || null,
        cep: form.cep || null,
        endereco: form.endereco || null,
        numero: form.numero || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        graduacao: graduacao || null,
        tipo_graduacao: tipoGraduacao || null,
        nucleo: nucleo || null,
        foto_url,
        nome_pai: form.nome_pai || null,
        nome_mae: form.nome_mae || null,
        autoriza_imagem: form.autoriza_imagem,
        menor_de_idade: menorDeIdade,
        nome_responsavel: menorDeIdade ? (form.nome_responsavel || null) : null,
        cpf_responsavel: menorDeIdade ? (form.cpf_responsavel || null) : null,
        assinatura_responsavel: menorDeIdade ? form.assinatura_responsavel : false,
        assinatura_pai: menorDeIdade ? form.assinatura_pai : false,
        assinatura_mae: menorDeIdade ? form.assinatura_mae : false,
      };

      // Usa API route server-side (service role — ignora RLS, trata colunas faltantes)
      const res = await fetch('/api/inscricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (result.duplicate) {
          alert(result.error);
          setLoading(false);
          return;
        }
        throw new Error(result.error || `HTTP ${res.status}`);
      }

      const { student_id, inscricao_numero } = result;

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
        inscricao_numero: inscricao_numero ?? null,
        telefone: form.telefone || null,
        student_id: student_id ?? null,
      });
    } catch (err: unknown) {
      console.error('Erro inscrição:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erro ao realizar inscrição: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const buscarCarteirinha = async () => {
    const raw = cardCpf.trim();
    const digits = raw.replace(/\D/g, '');
    if (!raw) { setCardError('Digite seu CPF ou Numeração Única.'); return; }
    setCardLoading(true); setCardError(''); setCardData(null);
    try {
      const { data: rows, error } = await supabase.from('students').select('*');
      const data = (!error && rows) ? rows.find(s => {
        const storedCpf = (s.cpf || '').replace(/\D/g, '');
        const storedId  = (s.identidade || '').replace(/\D/g, '').toLowerCase();
        const rawLower  = raw.replace(/\s/g, '').toLowerCase();
        if (digits.length >= 11 && storedCpf === digits) return true;
        if (rawLower && (
          (s.identidade || '').replace(/\s/g, '').toLowerCase() === rawLower ||
          (storedId && storedId === digits)
        )) return true;
        return false;
      }) ?? null : null;
      if (error || !data) { setCardError('Aluno não encontrado. Verifique o CPF ou Numeração Única.'); }
      else {
        // Verificar cadastro completo antes de emitir carteirinha
        const camposObrigatorios: Record<string, string> = {
          nome_completo: 'Nome Completo',
          data_nascimento: 'Data de Nascimento',
          telefone: 'Telefone',
          cep: 'CEP',
          endereco: 'Endereço',
          numero: 'Número',
          bairro: 'Bairro',
          cidade: 'Cidade',
          estado: 'Estado',
          nucleo: 'Núcleo',
          graduacao: 'Graduação',
          tipo_graduacao: 'Tipo de Graduação',
        };
        const pendentes = Object.entries(camposObrigatorios)
          .filter(([field]) => {
            const val = (data as Record<string, unknown>)[field];
            return !val || (typeof val === 'string' && !val.trim());
          })
          .map(([, label]) => label);

        if (pendentes.length > 0) {
          setCardError(`Cadastro incompleto. A carteirinha só pode ser emitida com o cadastro completo.\n\nDados pendentes: ${pendentes.join(', ')}`);
          setCardLoading(false);
          return;
        }

        // Compute virtual matricula if ordem_inscricao missing
        let cardInscricaoNum: number | null = (data as any).ordem_inscricao ?? null;
        if (!cardInscricaoNum) {
          const { count } = await supabase.from('students').select('*', { count: 'exact', head: true });
          cardInscricaoNum = count ?? null;
        }
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
          inscricao_numero: cardInscricaoNum,
          telefone: data.telefone || null,
          student_id: (data as any).id ?? null,
        });
      }
    } catch { setCardError('Erro ao buscar dados.'); }
    setCardLoading(false);
  };

  const shareCarteirinhaWhatsApp = (telefone: string | null | undefined, nome: string, cpfAluno?: string) => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inscri-o-capoeira-bar-o-de-mau.vercel.app';
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
      window.open(`https://api.whatsapp.com/send?phone=${br}&text=${msg}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
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
      {/* ── Hero Banner — imagem de fundo em tela cheia, com logo sobreposto ── */}
      <div className="hero-banner" style={{ position: 'relative' }}>
        <img
          src={bgUrl || '/wallpaper-capoeira.jpg'}
          alt="Capoeira Barão de Mauá"
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            objectFit: 'contain', objectPosition: 'center center',
            display: 'block',
          }}
        />
        {/* Floating background changer button */}
        <button
          type="button"
          onClick={() => { setBgModalOpen(true); setBgCpf(''); setBgCpfOk(false); setBgCpfError(''); setBgUploadMsg(''); }}
          title="Alterar imagem de fundo"
          style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8, color: '#fff', fontSize: '0.72rem', fontWeight: 700,
            padding: '5px 10px', cursor: 'pointer', zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 5,
            backdropFilter: 'blur(4px)',
          }}
        >
          🖼 Alterar Fundo
        </button>
      </div>

      {/* Background changer modal */}
      {bgModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setBgModalOpen(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 28px 24px',
            minWidth: 320, maxWidth: 420, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
            position: 'relative',
          }}>
            <button
              onClick={() => setBgModalOpen(false)}
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#64748b' }}
            >×</button>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e3a8a', marginBottom: 16 }}>
              🖼 Alterar Imagem de Fundo
            </div>

            {!bgCpfOk ? (
              <>
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
                  Digite o CPF do Administrador Geral para continuar.
                </p>
                <input
                  type="text"
                  placeholder="CPF do Admin Geral"
                  value={bgCpf}
                  onChange={e => setBgCpf(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') {
                    const digits = bgCpf.replace(/\D/g, '');
                    if (adminConfigCpfs.includes(digits)) { setBgCpfOk(true); setBgCpfError(''); }
                    else setBgCpfError('CPF não autorizado.');
                  }}}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', marginBottom: 8, fontSize: '0.9rem' }}
                />
                {bgCpfError && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: 8 }}>{bgCpfError}</div>}
                <button
                  onClick={() => {
                    const digits = bgCpf.replace(/\D/g, '');
                    if (adminConfigCpfs.includes(digits)) { setBgCpfOk(true); setBgCpfError(''); }
                    else setBgCpfError('CPF não autorizado.');
                  }}
                  style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                >
                  Verificar
                </button>
              </>
            ) : (
              <>
                {bgUrl && (
                  <div style={{ marginBottom: 14, textAlign: 'center' }}>
                    <img src={bgUrl} alt="Fundo atual" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Imagem atual</div>
                  </div>
                )}
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
                  Selecione uma imagem (JPG, PNG, WEBP) para o fundo da página inicial.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  ref={bgFileRef}
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBgUploading(true); setBgUploadMsg('');
                    try {
                      const fd = new FormData();
                      fd.append('file', file);
                      const res = await fetch('/api/admin/background', { method: 'POST', body: fd });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || 'Falha no upload');
                      const uploadedUrl = json.url as string;
                      // Save config
                      await fetch('/api/admin/background', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: uploadedUrl }),
                      });
                      setBgUrl(uploadedUrl);
                      setBgUploadMsg('✓ Imagem atualizada com sucesso!');
                    } catch (err: any) {
                      setBgUploadMsg('Erro: ' + err.message);
                    }
                    setBgUploading(false);
                    if (bgFileRef.current) bgFileRef.current.value = '';
                  }}
                />
                <button
                  onClick={() => bgFileRef.current?.click()}
                  disabled={bgUploading}
                  style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: bgUploading ? 'not-allowed' : 'pointer', width: '100%', marginBottom: 8, opacity: bgUploading ? 0.7 : 1 }}
                >
                  {bgUploading ? 'Enviando...' : '📤 Escolher Imagem'}
                </button>
                {bgUrl && (
                  <button
                    onClick={async () => {
                      setBgUploading(true); setBgUploadMsg('');
                      try {
                        await fetch('/api/admin/background', { method: 'DELETE' });
                        setBgUrl(null);
                        setBgUploadMsg('✓ Imagem removida. Fundo padrão restaurado.');
                      } catch { setBgUploadMsg('Erro ao remover imagem.'); }
                      setBgUploading(false);
                    }}
                    disabled={bgUploading}
                    style={{ background: 'none', color: '#dc2626', border: '1.5px solid #dc2626', borderRadius: 8, padding: '7px 16px', fontWeight: 700, cursor: 'pointer', width: '100%', fontSize: '0.82rem' }}
                  >
                    🗑 Remover / Restaurar Padrão
                  </button>
                )}
                {bgUploadMsg && (
                  <div style={{ marginTop: 10, fontSize: '0.82rem', color: bgUploadMsg.startsWith('✓') ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {bgUploadMsg}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="container" style={{ marginTop: 0 }}>
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
              {t('nav_register')}
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
              {t('nav_attendance')}
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
              {t('nav_card')}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('financeiro')}
              style={{
                background: activeSection === 'financeiro' ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'rgba(22,163,74,0.1)',
                border: 'none',
                borderBottom: 'none',
                borderRadius: '10px 10px 0 0',
                padding: '11px 22px',
                color: activeSection === 'financeiro' ? '#ffffff' : '#16a34a',
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              {t('nav_financial')}
            </button>
            <a
              href="/organograma"
              style={{
                background: 'rgba(124,58,237,0.12)',
                border: 'none',
                borderRadius: '10px 10px 0 0',
                padding: '11px 18px',
                color: '#a78bfa',
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="2" y="15" width="6" height="4" rx="1"/><rect x="16" y="15" width="6" height="4" rx="1"/><path d="M12 6v4M12 10H5v5M12 10h7v5"/></svg>
              Organograma
            </a>
            <a
              href="/hierarquia"
              style={{
                background: 'rgba(202,138,4,0.12)',
                border: 'none',
                borderRadius: '10px 10px 0 0',
                padding: '11px 18px',
                color: '#fbbf24',
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              Hierarquia ACCBM
            </a>
          </div>

          {activeSection === 'ficha' && (
          <form onSubmit={handleSubmit}>
            {/* Honeypot — hidden from humans, bots fill it — do not remove */}
            <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
            </div>
            {/* Núcleo */}
            <div className="form-section" style={{ borderTopLeftRadius: 0 }}>
              <h2 className="form-section-title">{t('common_nucleus')}</h2>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>{t('form_select_nucleus')} <span className="required">*</span></label>
                  <select value={nucleo} onChange={(e) => setNucleo(e.target.value)}>
                    <option value="">{t('form_select_nucleus')}</option>
                    <option value="Saracuruna">Núcleo Saracuruna</option>
                    <option value="Poliesportivo Edson Alves">Núcleo Poliesportivo Edson Alves – Mauá</option>
                    <option value="Poliesportivo do Ipiranga">Núcleo Poliesportivo do Ipiranga – Mauá</option>
                    <option value="Vila Urussaí">Núcleo Vila Urussaí</option>
                    <option value="Jayme Fichman">Núcleo Jayme Fichman</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Dados Pessoais */}
          <div className="form-section">
            <h2 className="form-section-title">{t('form_personal')}</h2>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>{t('form_full_name')} <span className="required">*</span></label>
                <input
                  name="nome_completo"
                  value={form.nome_completo}
                  onChange={handleChange}
                  placeholder="Digite seu nome completo"
                />
              </div>

              {/* Apelido + Nome Social */}
              <div className="form-group">
                <label>{t('form_nickname')} <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
                <input
                  name="apelido"
                  value={form.apelido}
                  onChange={handleChange}
                  placeholder="Como você é conhecido(a)"
                />
              </div>
              <div className="form-group">
                <label>{t('form_social_name')} <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
                <input
                  name="nome_social"
                  value={form.nome_social}
                  onChange={handleChange}
                  placeholder="Nome pelo qual prefere ser chamado(a)"
                />
              </div>

              {/* Sexo */}
              <div className="form-group full-width">
                <label>{t('form_sex')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {([
                    { v: 'masculino',     label: t('form_sex_male'),        icon: '♂' },
                    { v: 'feminino',      label: t('form_sex_female'),       icon: '♀' },
                    { v: 'nao-binario',   label: t('form_sex_nonbinary'),    icon: '⚧' },
                    { v: 'outros',        label: t('form_sex_other'),        icon: '◈' },
                    { v: 'nao-informado', label: t('form_sex_undisclosed'),  icon: '—' },
                  ] as { v: string; label: string; icon: string }[]).map(opt => {
                    const selected = form.sexo === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, sexo: opt.v }))}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 18px',
                          borderRadius: 999,
                          border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
                          background: selected ? 'var(--accent)' : 'transparent',
                          color: selected ? '#fff' : 'var(--text-secondary)',
                          fontSize: '0.85rem',
                          fontWeight: selected ? 700 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          outline: 'none',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.01em',
                        }}
                      >
                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{opt.icon}</span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="form-group">
                <label>
                  CPF{' '}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>(opcional — preencha se possuir)</span>
                </label>
                <input
                  name="cpf"
                  value={form.cpf}
                  onChange={(e) => { handleCPFChange(e); setDuplicateErrors(prev => ({ ...prev, cpf: undefined })); }}
                  onBlur={() => { if (form.cpf) checkDuplicate('cpf', form.cpf); }}
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
                <label>Identidade / Numeração Única (RG / CIN) <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                <input
                  name="identidade"
                  value={form.identidade}
                  onChange={(e) => { handleChange(e); setDuplicateErrors(prev => ({ ...prev, identidade: undefined })); }}
                  onBlur={() => form.identidade && checkDuplicate('identidade', form.identidade)}
                  placeholder="Nº do RG, CIN ou Documento Único"
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
                <label>{t('form_birthdate')} <span className="required">*</span></label>
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
                />
                {form.data_nascimento && (
                  <span style={{ fontSize: '0.78rem', marginTop: 4, display: 'block', color: menorDeIdade ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {menorDeIdade ? '⚠ Menor de idade — preencha o Termo de Autorização abaixo' : '✓ Maior de idade'}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>{t('form_phone')} <span className="required">*</span></label>
                <input name="telefone" value={form.telefone} onChange={handleTelefoneChange} placeholder="(00) 00000-0000" />
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
            <h2 className="form-section-title">{t('form_photo')}</h2>
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
                    {t('form_add_photo')}
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
            </div>
          </div>

          {/* Endereço */}
          <div className="form-section">
            <h2 className="form-section-title">{t('form_address')}</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('form_cep')}</label>
                <input name="cep" value={form.cep} onChange={handleCEPChange} placeholder="00000-000" />
              </div>
              <div className="form-group">
                <label>Estado <span className="required">*</span></label>
                <input name="estado" value={form.estado} onChange={handleChange} placeholder="UF" />
              </div>
              <div className="form-group full-width">
                <label>Endereço <span className="required">*</span></label>
                <input name="endereco" value={form.endereco} onChange={handleChange} placeholder="Rua, Avenida..." />
              </div>
              <div className="form-group">
                <label>Número <span className="required">*</span></label>
                <input name="numero" value={form.numero} onChange={handleChange} placeholder="Nº" />
              </div>
              <div className="form-group">
                <label>Complemento</label>
                <input name="complemento" value={form.complemento} onChange={handleChange} placeholder="Apto, Bloco..." />
              </div>
              <div className="form-group">
                <label>Bairro <span className="required">*</span></label>
                <input name="bairro" value={form.bairro} onChange={handleChange} placeholder="Bairro" />
              </div>
              <div className="form-group">
                <label>Cidade <span className="required">*</span></label>
                <input name="cidade" value={form.cidade} onChange={handleChange} placeholder="Cidade" />
              </div>
            </div>
          </div>

          {/* Graduação */}
          <div className="form-section">
            <h2 className="form-section-title">{t('common_graduation')}</h2>
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
                <select value={graduacao} onChange={(e) => setGraduacao(e.target.value)}>
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

          {/* Draft message */}
          {draftMsg && (
            <div style={{
              margin: '0 0 14px',
              padding: '12px 16px',
              borderRadius: 10,
              background: draftMsg.includes('Erro') ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)',
              border: `1px solid ${draftMsg.includes('Erro') ? 'rgba(220,38,38,0.25)' : 'rgba(22,163,74,0.25)'}`,
              color: draftMsg.includes('Erro') ? '#dc2626' : '#16a34a',
              fontSize: '0.84rem',
              fontWeight: 600,
            }}>
              {draftMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? t('form_saving') : t('form_submit')}
            </button>
            <button type="button" onClick={handleSaveDraft} disabled={draftLoading}
              style={{
                width: '100%', padding: '14px', borderRadius: 10, cursor: draftLoading ? 'wait' : 'pointer',
                background: 'rgba(234,179,8,0.08)', border: '2px solid rgba(234,179,8,0.35)',
                color: '#ca8a04', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              {draftLoading ? t('form_saving') : draftId ? `💾 ${t('form_save_draft')}` : `💾 ${t('form_save_draft')}`}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0 }}>
              Ainda não tem todos os dados? Salve como rascunho e complete depois.
            </p>
          </div>
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
                placeholder="CPF ou Numeração Única"
                value={cardCpf}
                onChange={e => setCardCpf(e.target.value)}
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
            {cardError && (
              <div style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 8, fontWeight: 600, whiteSpace: 'pre-line', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 14px' }}>
                ⚠ {cardError}
              </div>
            )}

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

        {/* ── Ficha Financeira tab ── */}
        {activeSection === 'financeiro' && (
          <div className="form-section" style={{ borderTopLeftRadius: 0 }}>
            <h2 className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              Ficha Financeira
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 20, marginTop: -4 }}>
              Acesse sua ficha financeira individual. A senha de acesso é o seu CPF cadastrado na associação.
            </p>

            {/* If we already have a student from credencial search, show their card */}
            {cardData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                  {cardData.foto_url
                    ? <img src={cardData.foto_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(22,163,74,0.35)', flexShrink: 0 }} />
                    : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(22,163,74,0.1)', border: '2px solid rgba(22,163,74,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>👤</div>
                  }
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{cardData.nome}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 2 }}>{cardData.graduacao} · {cardData.nucleo || '—'}</div>
                    <div style={{ color: 'rgba(22,163,74,0.8)', fontSize: '0.72rem', marginTop: 2 }}>CPF: {cardData.cpf}</div>
                  </div>
                </div>
                <a
                  href="/financeiro"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: '1rem', boxShadow: '0 4px 16px rgba(22,163,74,0.3)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  💰 Acessar Ficha de {cardData.nome.split(' ')[0]}
                </a>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0 }}>
                  Você será levado à ficha financeira. A senha de acesso é o seu CPF.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.15)', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      placeholder="CPF ou Numeração Única"
                      value={cardCpf}
                      onChange={e => setCardCpf(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && buscarCarteirinha()}
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button
                      type="button"
                      onClick={buscarCarteirinha}
                      disabled={cardLoading}
                      style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap' }}
                    >
                      {cardLoading ? 'Buscando...' : 'Verificar'}
                    </button>
                  </div>
                  {cardError && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: 0, fontWeight: 600 }}>⚠ {cardError}</p>}
                </div>
                <a
                  href="/financeiro"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: '0.95rem', boxShadow: '0 4px 16px rgba(22,163,74,0.3)' }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  💰 Acessar Ficha Financeira
                </a>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0 }}>
                  Digite seu CPF cadastrado para entrar na sua ficha financeira individual.
                </p>
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
            href="https://api.whatsapp.com/send?phone=5521966102513"
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

      {/* Botão fixo — Painel Administrativo */}
      <button
        onClick={() => { setAdminModalOpen(true); setAdminErro(''); setAdminCpf(''); setAdminScreen('login'); setManageMsg(''); setNewAdminCpf(''); }}
        style={{
          position: 'fixed', bottom: '20px', left: '20px',
          background: 'linear-gradient(135deg,#b45309,#d97706)',
          color: '#fff', border: '1.5px solid #fbbf24', borderRadius: '8px',
          padding: '8px 14px', fontSize: '11px', cursor: 'pointer',
          zIndex: 9999, backdropFilter: 'blur(4px)', letterSpacing: '0.03em',
          fontWeight: 700, boxShadow: '0 2px 12px rgba(180,83,9,0.45)',
        }}
      >
        🔒 Painel Administrativo
      </button>

      {adminModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
          onClick={e => { if (e.target === e.currentTarget) { setAdminModalOpen(false); setAdminLoading(false); } }}>
          <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '14px', padding: '32px 28px', width: '360px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {adminScreen === 'login' ? (
              <>
                <div style={{ textAlign: 'center', fontSize: '26px' }}>🔐</div>
                <h2 style={{ color: '#fff', textAlign: 'center', margin: 0, fontSize: '15px', fontWeight: 700 }}>{t('admin_title')}</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: 0, fontSize: '12px' }}>{t('admin_cpf_label')}</p>
                <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', margin: 0, fontSize: '11px' }}>Responsável por núcleo ou administrador geral</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={adminCpf}
                  onChange={e => { setAdminCpf(e.target.value); setAdminErro(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdminAccess(); }}
                  placeholder="000.000.000-00"
                  autoFocus
                  maxLength={14}
                  disabled={adminLoading}
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '11px 14px', color: '#fff', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'center', letterSpacing: '0.08em' }}
                />
                {adminErro && <p style={{ color: '#f87171', textAlign: 'center', margin: 0, fontSize: '12px', fontWeight: 600 }}>⚠ {adminErro}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: 4 }}>
                  <button onClick={() => { setAdminModalOpen(false); setAdminLoading(false); }}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#aaa', cursor: 'pointer', fontSize: '13px' }}>
                    Cancelar
                  </button>
                  <button onClick={handleAdminAccess} disabled={adminLoading}
                    style={{ flex: 2, padding: '10px', borderRadius: '8px', background: 'linear-gradient(135deg,#b45309,#d97706)', border: 'none', color: '#fff', cursor: adminLoading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700, opacity: adminLoading ? 0.7 : 1 }}>
                    {adminLoading ? '⏳ Verificando...' : 'Entrar'}
                  </button>
                </div>
                {/* Botão para gerenciar admin — exige verificação de CPF primeiro */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, textAlign: 'center' }}>
                  <button
                    onClick={async () => {
                      const digits = adminCpf.replace(/\D/g, '');
                      if (!adminConfigCpfs.includes(digits)) {
                        setAdminErro('Digite o CPF de um administrador geral para gerenciar.');
                        return;
                      }
                      setAdminScreen('manage');
                      setManageTab('edit');
                      setManageMsg('');
                      setNewAdminCpf('');
                    }}
                    style={{ background: 'rgba(180,83,9,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', borderRadius: '7px', padding: '7px 16px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    ⚙ Gerenciar Administrador Geral
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                  <button onClick={() => { setAdminScreen('login'); setManageMsg(''); setNewAdminCpf(''); }}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: 1 }}>←</button>
                  <h2 style={{ color: '#fff', margin: 0, fontSize: '14px', fontWeight: 700, flex: 1 }}>⚙ Administradores Gerais</h2>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 7px' }}>{adminConfigCpfs.length}/3</span>
                </div>

                {/* Lista de admins cadastrados */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>CPFs com acesso total</div>
                  {adminConfigCpfs.map((cpf, idx) => (
                    <div key={cpf} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontWeight: 700, minWidth: 14 }}>{idx + 1}</span>
                      <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '12px', letterSpacing: '0.05em', flex: 1 }}>
                        {cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                      </span>
                      {adminConfigCpfs.length > 1 && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Remover o CPF ${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')} dos administradores gerais?`)) return;
                            setManageSaving(true); setManageMsg('');
                            const ok = await saveAdminCpfs(adminConfigCpfs.filter(c => c !== cpf));
                            if (ok) setManageMsg('✓ Administrador removido.');
                            setManageSaving(false);
                          }}
                          style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>
                          🗑
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Adicionar novo admin */}
                {adminConfigCpfs.length < 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>➕ Adicionar administrador ({adminConfigCpfs.length}/3)</div>
                    <input
                      type="text" inputMode="numeric" value={newAdminCpf}
                      onChange={e => setNewAdminCpf(e.target.value.replace(/\D/g,''))}
                      placeholder="CPF do novo administrador"
                      maxLength={11}
                      style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: '0.9rem', outline: 'none', width: '100%', boxSizing: 'border-box', letterSpacing: '0.06em' }}
                    />
                    <button
                      onClick={async () => {
                        const digits = newAdminCpf.replace(/\D/g, '');
                        if (digits.length < 11) { setManageMsg('CPF inválido (11 dígitos).'); return; }
                        if (adminConfigCpfs.includes(digits)) { setManageMsg('Este CPF já é administrador.'); return; }
                        setManageSaving(true); setManageMsg('');
                        const ok = await saveAdminCpfs([...adminConfigCpfs, digits]);
                        if (ok) { setManageMsg('✓ Administrador adicionado!'); setNewAdminCpf(''); }
                        setManageSaving(false);
                      }}
                      disabled={manageSaving || newAdminCpf.replace(/\D/g,'').length < 11}
                      style={{ padding: '9px', borderRadius: 8, background: 'linear-gradient(135deg,#059669,#047857)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: manageSaving ? 'wait' : 'pointer', opacity: newAdminCpf.replace(/\D/g,'').length < 11 ? 0.5 : 1 }}>
                      {manageSaving ? '⏳ Salvando...' : '✅ Adicionar'}
                    </button>
                  </div>
                )}

                {adminConfigCpfs.length >= 3 && (
                  <div style={{ fontSize: '11px', color: '#fbbf24', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    Limite de 3 administradores atingido. Remova um para adicionar outro.
                  </div>
                )}

                {manageMsg && (
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: manageMsg.startsWith('✓') ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)', border: `1px solid ${manageMsg.startsWith('✓') ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)'}`, color: manageMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontSize: '12px', fontWeight: 600, textAlign: 'center' }}>
                    {manageMsg}
                  </div>
                )}

                <button onClick={() => { setAdminScreen('login'); setManageMsg(''); setNewAdminCpf(''); }}
                  style={{ padding: '9px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer' }}>
                  ← Voltar ao Login
                </button>
              </>
            )}
          </div>
        </div>
      )}

      </>
    );
}
