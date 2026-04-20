'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { graduacoes, getCordaColors, nomenclaturaGraduacao } from '@/lib/graduacoes';
import Link from 'next/link';
import Carteirinha, { CarteirinhaData } from '@/components/Carteirinha';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type SuccessData = CarteirinhaData;

export default function Home() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  // Draft access by student
  const [draftAccessCpf, setDraftAccessCpf] = useState('');
  const [draftAccessLoading, setDraftAccessLoading] = useState(false);
  const [draftAccessMsg, setDraftAccessMsg] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [successDisplayId, setSuccessDisplayId] = useState<string | null>(null);
  const [criarContaPassword, setCriarContaPassword] = useState('');
  const [criarContaPhone, setCriarContaPhone] = useState('');
  const [criarContaLoading, setCriarContaLoading] = useState(false);
  const [criarContaMsg, setCriarContaMsg] = useState('');
  const [criarContaUsername, setCriarContaUsername] = useState('');
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
  const [duplicateErrors, setDuplicateErrors] = useState<{ cpf?: string; identidade?: string; email?: string; nome?: string }>({});
  const [checkingDuplicate, setCheckingDuplicate] = useState<{ cpf?: boolean; identidade?: boolean; email?: boolean; nome?: boolean }>({});
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminCpf, setAdminCpf] = useState(''); // kept for backward compat (unused)
  const [adminErro, setAdminErro] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminScreen, setAdminScreen] = useState<'login' | 'change' | 'recover' | 'register'>('login');
  const [adminConfigCpf, setAdminConfigCpf] = useState(''); // legacy
  const [adminConfigCpfs, setAdminConfigCpfs] = useState<string[]>([]); // legacy
  const [manageTab, setManageTab] = useState<'edit' | 'include' | 'remove'>('edit');
  const [newAdminCpf, setNewAdminCpf] = useState('');
  const [manageSaving, setManageSaving] = useState(false);
  const [manageMsg, setManageMsg] = useState('');
  // New login fields
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminShowPass, setAdminShowPass] = useState(false);
  const [adminChgCurrent, setAdminChgCurrent] = useState('');
  const [adminChgNew, setAdminChgNew] = useState('');
  const [adminChgConfirm, setAdminChgConfirm] = useState('');
  const [adminChgMsg, setAdminChgMsg] = useState('');
  // Recover: admin geral resets a user
  const [recAdminUser, setRecAdminUser] = useState('');
  const [recAdminPass, setRecAdminPass] = useState('');
  const [recTargetUser, setRecTargetUser] = useState('');
  const [recNewPass, setRecNewPass] = useState('');
  const [recMsg, setRecMsg] = useState('');
  // Register: new admin sets initial password (authorized by Admin Geral)
  const [regUser, setRegUser] = useState('');
  const [regNewPass, setRegNewPass] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regAdminUser, setRegAdminUser] = useState('');
  const [regAdminPass, setRegAdminPass] = useState('');
  const [regMsg, setRegMsg] = useState('');

  // Dynamic nucleos from database
  const [dynamicNucleos, setDynamicNucleos] = useState<Array<{ id: string; nome: string; slug: string; ativo: boolean }>>([]);

  // Background changer state
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgModalOpen, setBgModalOpen] = useState(false);
  const [bgCpf, setBgCpf] = useState('');
  const [bgCpfOk, setBgCpfOk] = useState(false);
  const [bgCpfError, setBgCpfError] = useState('');
  const [bgUploading, setBgUploading] = useState(false);
  const [bgUploadMsg, setBgUploadMsg] = useState('');
  const bgFileRef = useRef<HTMLInputElement>(null);

  // Mark as mounted (client-only) to avoid SSR/hydration mismatches
  useEffect(() => { setMounted(true); }, []);

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
    // Load nucleos from database
    fetch('/api/admin/nucleos', { headers: { 'x-admin-auth': 'geral' } })
      .then(r => r.json())
      .then(d => { if (d.nucleos) setDynamicNucleos(d.nucleos.filter((n: { ativo: boolean }) => n.ativo)); })
      .catch(() => {});
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
    if (!adminUser.trim() || !adminPass) { setAdminErro('Preencha usuário e senha.'); return; }
    // Lockout check
    const ls = getLoginState();
    const now = Date.now();
    if (ls.lockedUntil > now) {
      const secs = Math.ceil((ls.lockedUntil - now) / 1000);
      setAdminErro(`Muitas tentativas. Aguarde ${secs}s.`);
      return;
    }
    setAdminLoading(true);
    setAdminErro('');
    try {
      const res = await fetch('/api/admin/panel-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username: adminUser.trim(), password: adminPass }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setLoginState(0, 0);
        sessionStorage.setItem('admin_auth', data.nucleo);
        sessionStorage.setItem('admin_user', adminUser.trim());
        sessionStorage.setItem('admin_is_owner', data.isOwner ? 'true' : 'false');
        // Admin Geral e Owner tem acesso a todos os nucleos
        const ALL_NUCLEOS = dynamicNucleos.length > 0 ? [...dynamicNucleos.map(n => n.slug), 'geral'] : ['geral'];
        const nucleosList = data.isGeral ? ALL_NUCLEOS : [data.nucleo];
        sessionStorage.setItem('admin_auth_nucleos', JSON.stringify(nucleosList));
        // Se for primeiro login, redireciona para trocar senha
        if (data.first_login) {
          setAdminScreen('change');
          setAdminLoading(false);
          return;
        }
        window.location.href = '/admin';
        return;
      }
      const newCount = ls.count + 1;
      if (newCount >= MAX_LOGIN_ATTEMPTS) {
        setLoginState(0, Date.now() + LOCKOUT_MS);
        setAdminErro(`Usuário ou senha incorretos. Bloqueado por 5 minutos após ${MAX_LOGIN_ATTEMPTS} tentativas.`);
      } else {
        setLoginState(newCount, 0);
        setAdminErro(`${data.error || 'Usuário ou senha incorretos.'} Tentativa ${newCount}/${MAX_LOGIN_ATTEMPTS}.`);
      }
    } catch {
      setAdminErro('Erro de conexão. Tente novamente.');
    }
    setAdminPass('');
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
    // Condições atípicas (array serializado como JSON)
    condicoes_atipicas: [] as string[],
    condicoes_atipicas_outro: '',
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

  // Normaliza nome: remove acentos, minúsculas, colapsa espaços
  // "JOÃO DA SILVA" == "joao da silva" == "João da Silva"
  const normalizeName = (s: string) =>
    (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const checkDuplicate = async (field: 'cpf' | 'identidade' | 'email', value: string) => {
    const cleanValue = value.trim();
    if (!cleanValue) return;
    setCheckingDuplicate(prev => ({ ...prev, [field]: true }));
    setDuplicateErrors(prev => ({ ...prev, [field]: undefined }));
    try {
      // Use server-side API to bypass RLS and get accurate duplicate check
      const res = await fetch('/api/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value: cleanValue }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.duplicate && result.message) {
          setDuplicateErrors(prev => ({ ...prev, [field]: result.message }));
        }
      }
    } catch {}
    setCheckingDuplicate(prev => ({ ...prev, [field]: false }));
  };

  // Verifica duplicata de nome completo no onBlur — normaliza acentos e capitalização
  const checkDuplicateName = async (nome: string) => {
    const nomeClean = nome.trim();
    const parts = nomeClean.split(/\s+/).filter(Boolean);
    // Valida que tem nome + sobrenome
    if (parts.length < 2) {
      setDuplicateErrors(prev => ({ ...prev, nome: 'Informe nome e sobrenome completos.' }));
      return;
    }
    setDuplicateErrors(prev => ({ ...prev, nome: undefined }));
    setCheckingDuplicate(prev => ({ ...prev, nome: true }));
    try {
      // Use server-side API to bypass RLS and get accurate duplicate check
      const res = await fetch('/api/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'nome', value: nomeClean }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.duplicate && result.message) {
          setDuplicateErrors(prev => ({ ...prev, nome: result.message }));
        } else if (result.error) {
          setDuplicateErrors(prev => ({ ...prev, nome: result.error }));
        }
      }
    } catch {}
    setCheckingDuplicate(prev => ({ ...prev, nome: false }));
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

  const loadDraftByCpf = async () => {
    const cpfDigits = draftAccessCpf.replace(/\D/g, '');
    if (!cpfDigits || cpfDigits.length < 6) {
      setDraftAccessMsg('Digite seu CPF para localizar o rascunho.');
      return;
    }
    setDraftAccessLoading(true);
    setDraftAccessMsg('');
    try {
      // List all drafts and find by CPF
      const res = await fetch('/api/rascunhos');
      if (!res.ok) throw new Error();
      const drafts = await res.json() as Array<{ id: string; cpf?: string; nome_completo?: string; dados_pendentes: string[] }>;
      const found = drafts.find(d => (d.cpf || '').replace(/\D/g, '') === cpfDigits);
      if (!found) {
        setDraftAccessMsg('Nenhum rascunho encontrado para este CPF. Verifique e tente novamente.');
        setDraftAccessLoading(false);
        return;
      }
      // Load full draft
      const res2 = await fetch(`/api/rascunhos?id=${found.id}`);
      const draft = await res2.json();
      if (!draft) { setDraftAccessMsg('Erro ao carregar rascunho.'); setDraftAccessLoading(false); return; }
      // Populate form
      setForm({
        nome_completo: draft.nome_completo || '',
        apelido: draft.apelido || '',
        nome_social: draft.nome_social || '',
        sexo: draft.sexo || '',
        cpf: draft.cpf || '',
        identidade: draft.identidade || '',
        data_nascimento: draft.data_nascimento || '',
        email: draft.email || '',
        cep: draft.cep || '',
        endereco: draft.endereco || '',
        numero: draft.numero || '',
        complemento: draft.complemento || '',
        bairro: draft.bairro || '',
        cidade: draft.cidade || '',
        estado: draft.estado || '',
        telefone: draft.telefone || '',
        nome_pai: draft.nome_pai || '',
        nome_mae: draft.nome_mae || '',
        autoriza_imagem: draft.autoriza_imagem ?? false,
        nome_responsavel: draft.nome_responsavel || '',
        cpf_responsavel: draft.cpf_responsavel || '',
        assinatura_responsavel: draft.assinatura_responsavel ?? false,
        assinatura_pai: draft.assinatura_pai ?? false,
        assinatura_mae: draft.assinatura_mae ?? false,
        condicoes_atipicas: draft.condicoes_atipicas || [],
        condicoes_atipicas_outro: draft.condicoes_atipicas_outro || '',
      });
      if (draft.nucleo) setNucleo(draft.nucleo);
      if (draft.graduacao) setGraduacao(draft.graduacao);
      if (draft.tipo_graduacao) setTipoGraduacao(draft.tipo_graduacao);
      setDraftId(draft.id);
      setDraftLoaded(true);
      const pend = draft.dados_pendentes as string[];
      setDraftAccessMsg(
        pend.length === 0
          ? `✓ Rascunho carregado — ${draft.nome_completo || 'aluno'}. Todos os dados completos, clique em Finalizar!`
          : `✓ Rascunho carregado — ${draft.nome_completo || 'aluno'}. Dados pendentes: ${pend.join(', ')}.`
      );
    } catch {
      setDraftAccessMsg('Erro ao buscar rascunho. Tente novamente.');
    }
    setDraftAccessLoading(false);
  };

  const handleSaveDraft = async () => {
    // Valida e-mail obrigatório
    if (!form.email || !form.email.trim()) {
      setDraftMsg('⚠ E-mail é obrigatório. Preencha o campo antes de salvar.');
      setTimeout(() => {
        const el = document.querySelector('[name="email"]') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus();
      }, 50);
      return;
    }
    // Bloqueia rascunho se há duplicata já detectada na tela
    const dupEntry = Object.entries(duplicateErrors).find(([, v]) => !!v);
    if (dupEntry) {
      setDraftMsg(`⚠ Não é possível salvar: ${dupEntry[1]}`);
      const elName = dupEntry[0] === 'nome' ? 'nome_completo' : dupEntry[0];
      const el = document.querySelector(`[name="${elName}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setDraftLoading(true); setDraftMsg('');
    const payload = {
      id: draftId || undefined,
      nome_completo: form.nome_completo || undefined,
      apelido: form.apelido || undefined,
      nome_social: form.nome_social || undefined,
      sexo: form.sexo || undefined,
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
      tipo_graduacao: tipoGraduacaoNorm || undefined,
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
            `Ola ${nome}! Seu pre-cadastro no Sistema de Gestao de Alunos DEMO foi salvo como rascunho.\n\nPara completar seu cadastro, ainda faltam as seguintes informacoes:\n${pend.map(p => `- ${p}`).join('\n')}\n\nAcesse o formulario e complete seu cadastro.`
          );
          window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${msg}`, '_blank');
        }
      } else if (res.status === 409 && data.duplicate) {
        // Duplicata detectada — mostra no campo correto e impede rascunho
        const field = data.field as 'nome' | 'cpf' | 'identidade' | 'email';
        setDuplicateErrors(prev => ({ ...prev, [field]: data.error }));
        setDraftMsg(`⚠ ${data.error}`);
        setTimeout(() => {
          const elName = field === 'nome' ? 'nome_completo' : field;
          const el = document.querySelector(`[name="${elName}"]`) as HTMLElement | null;
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.focus();
        }, 50);
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

    // Validação de nome (nome + sobrenome) antes de qualquer chamada
    const nomeClean = form.nome_completo.trim();
    const nomeParts = nomeClean.split(/\s+/).filter(Boolean);
    if (nomeParts.length < 2) {
      setDuplicateErrors(prev => ({ ...prev, nome: 'Informe nome e sobrenome completos.' }));
      setTimeout(() => {
        const el = document.querySelector('[name="nome_completo"]') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus();
      }, 50);
      return;
    }

    // Valida e-mail obrigatório
    if (!form.email || !form.email.trim()) {
      setTimeout(() => {
        const el = document.querySelector('[name="email"]') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus();
      }, 50);
      return;
    }

    // Bloqueia submit se há qualquer erro de duplicata detectado no onBlur (nome, CPF, identidade, email)
    const dupField = Object.entries(duplicateErrors).find(([, v]) => !!v);
    if (dupField) {
      const fieldName = dupField[0];
      setTimeout(() => {
        const el = document.querySelector(`[name="${fieldName === 'nome' ? 'nome_completo' : fieldName}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus();
      }, 50);
      return;
    }

    setLoading(true);

    try {
      // Upload de foto via API server-side (bucket privado — usa signed URL)
      let foto_url = null;
      if (photoFile) {
        const fd = new FormData();
        fd.append('foto', photoFile);
        const upRes = await fetch('/api/upload-foto', { method: 'POST', body: fd });
        if (upRes.ok) {
          const upData = await upRes.json();
          foto_url = upData.foto_url || null;
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
        tipo_graduacao: tipoGraduacaoNorm || null,
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
        if (result.duplicate || result.field === 'nome') {
          // Mostra erro inline no campo correto
          const field = result.field === 'nome' ? 'nome' : (result.field || 'nome');
          setDuplicateErrors(prev => ({ ...prev, [field]: result.error }));
          // Rola até o campo com erro
          setTimeout(() => {
            const el = document.querySelector('[name="nome_completo"]') as HTMLElement | null;
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el?.focus();
          }, 100);
          setLoading(false);
          return;
        }
        if (result.field === 'cpf' || result.field === 'identidade') {
          setDuplicateErrors(prev => ({ ...prev, [result.field]: result.error }));
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
        tipo_graduacao: tipoGraduacaoNorm,
        foto_url: foto_url || null,
        menor_de_idade: menorDeIdade,
        nome_pai: form.nome_pai,
        nome_mae: form.nome_mae,
        nome_responsavel: menorDeIdade ? form.nome_responsavel : null,
        cpf_responsavel: menorDeIdade ? form.cpf_responsavel : null,
        inscricao_numero: inscricao_numero ?? null,
        telefone: form.telefone || null,
        student_id: student_id ?? null,
        data_nascimento: form.data_nascimento || null,
      });
      // Auto-assign sequential DEMO display ID
      setCriarContaPassword('');
      setCriarContaPhone(form.telefone || '');
      setCriarContaMsg('');
      setCriarContaUsername('');
      setSuccessDisplayId(null);
      if (student_id) {
        fetch('/api/aluno/gerar-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'assign', student_id }),
        }).then(r => r.json()).then(d => {
          if (d.display_id) setSuccessDisplayId(d.display_id);
        }).catch(() => {});

        // Save atypical conditions to student-extras
        const condicoesArr = [...form.condicoes_atipicas];
        if (condicoesArr.includes('Outro') && form.condicoes_atipicas_outro.trim()) {
          const idx = condicoesArr.indexOf('Outro');
          condicoesArr[idx] = `Outro: ${form.condicoes_atipicas_outro.trim()}`;
        }
        if (condicoesArr.length > 0) {
          fetch('/api/student-extras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: student_id, condicoes_atipicas: JSON.stringify(condicoesArr) }),
          }).catch(() => {});
        }
      }
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
      // Use server-side API (supabaseAdmin) to bypass RLS and get reliable data + inscricao_numero
      const param = digits.length >= 11
        ? `cpf=${encodeURIComponent(raw)}`
        : `identidade=${encodeURIComponent(raw)}`;
      const res = await fetch(`/api/carteirinha?${param}`);
      if (!res.ok) {
        setCardError('Aluno não encontrado. Verifique o CPF ou Numeração Única.');
        setCardLoading(false);
        return;
      }
      const { student: data, inscricao_numero: inscricaoNumApi } = await res.json();

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
        inscricao_numero: inscricaoNumApi ?? null,
        telefone: data.telefone || null,
        student_id: data.id ?? null,
        data_nascimento: data.data_nascimento ?? null,
        apelido: data.apelido || null,
        nome_social: data.nome_social || null,
      });
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
`*Carteirinha - Sistema de Gestao DEMO*

Ola, *${nome}*! Sua carteirinha de associado esta disponivel. Toque no link abaixo para visualizar e imprimir:

${url}

_Sistema de Gestao de Alunos DEMO_`
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
  // Normalize tipo_graduacao to canonical form before any save
  const tipoGraduacaoNorm = tipoGraduacao === 'infantil' ? 'Infantil' : tipoGraduacao === 'adulta' ? 'Adulto' : tipoGraduacao;

  return (
    <>
      {/* ── Hero Banner — imagem de fundo completa, sem corte ── */}
      <div className="hero-banner" style={{
        position: 'relative',
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        lineHeight: 0,
      }}>
        {/* Imagem de fundo — contain para não cortar nada */}
        <img
          src={bgUrl || '/wallpaper-capoeira.jpg'}
          alt="Sistema de Gestao DEMO"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            borderRadius: 12,
          }}
        />
        {/* Overlay escuro leve */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.12)',
          borderRadius: 12,
        }} />

        {/* Floating background changer button */}
        <button
          type="button"
          onClick={() => { setBgModalOpen(true); setBgCpf(''); setBgCpfOk(false); setBgCpfError(''); setBgUploadMsg(''); }}
          title={t('bg_change')}
          style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8, color: '#fff', fontSize: '0.72rem', fontWeight: 700,
            padding: '5px 10px', cursor: 'pointer', zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 5,
            backdropFilter: 'blur(4px)',
          }}
        >
          {t('bg_change')}
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
              {t('bg_title')}
            </div>

            {!bgCpfOk ? (
              <>
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
                  {t('bg_cpf_prompt')}
                </p>
                <input
                  type="text"
                  placeholder={t('bg_cpf_placeholder')}
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
                  {t('bg_verify_btn')}
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
                  {t('bg_select_hint')}
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
                  {bgUploading ? t('bg_uploading') : t('bg_choose_btn')}
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
                    {t('bg_remove_btn')}
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
              href="/aluno"
              style={{
                background: 'linear-gradient(135deg,#1d4ed8,#1e40af)',
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
                boxShadow: '0 -2px 8px rgba(29,78,216,0.25)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              🥋 {t('student_area')}
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
            <div className="form-section section-nucleo" style={{ borderTopLeftRadius: 0 }}>
              <div className="form-section-header">
                <div className="form-section-icon">🏫</div>
                <h2 className="form-section-title">{t('common_nucleus')}</h2>
              </div>
              <div className="form-section-body">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>{t('form_select_nucleus')} <span className="required">*</span></label>
                  <select value={nucleo} onChange={(e) => setNucleo(e.target.value)}>
                    <option value="">{t('form_select_nucleus')}</option>
                    {dynamicNucleos.length > 0 ? (
                      dynamicNucleos.map(n => (
                        <option key={n.id} value={n.nome}>{n.nome}</option>
                      ))
                    ) : (
                      <>
                        <option value="Saracuruna">Nucleo Saracuruna</option>
                        <option value="Poliesportivo Edson Alves">Nucleo Poliesportivo Edson Alves</option>
                        <option value="Poliesportivo do Ipiranga">Nucleo Poliesportivo do Ipiranga</option>
                        <option value="Vila Urussai">Nucleo Vila Urussai</option>
                        <option value="Jayme Fichman">Nucleo Jayme Fichman</option>
                        <option value="Academia Mais Saude">Academia Mais Saude</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              </div>
            </div>

            {/* Dados Pessoais */}
          <div className="form-section section-pessoal">
            <div className="form-section-header">
              <div className="form-section-icon">👤</div>
              <h2 className="form-section-title">{t('form_personal')}</h2>
            </div>
            <div className="form-section-body">
            <div className="form-grid">
              <div className="form-group full-width">
                <label>{t('form_full_name')} <span className="required">*</span></label>
                <input
                  name="nome_completo"
                  value={form.nome_completo}
                  onChange={e => {
                    handleChange(e);
                    setDuplicateErrors(prev => ({ ...prev, nome: undefined }));
                  }}
                  onBlur={() => { if (form.nome_completo.trim()) checkDuplicateName(form.nome_completo); }}
                  placeholder="Digite seu nome completo"
                  style={duplicateErrors.nome ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {checkingDuplicate.nome && (
                  <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>{t('checking_name')}</span>
                )}
                {duplicateErrors.nome && (
                  <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ⚠ {duplicateErrors.nome}
                  </span>
                )}
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
                  {t('form_cpf_label')}{' '}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{t('form_cpf_optional')}</span>
                </label>
                <input
                  name="cpf"
                  value={form.cpf}
                  onChange={(e) => { handleCPFChange(e); setDuplicateErrors(prev => ({ ...prev, cpf: undefined })); }}
                  onBlur={() => { if (form.cpf) checkDuplicate('cpf', form.cpf); }}
                  placeholder="000.000.000-00"
                  style={duplicateErrors.cpf ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {checkingDuplicate.cpf && <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>{t('checking_field')}</span>}
                {duplicateErrors.cpf && (
                  <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                    ⚠ {duplicateErrors.cpf}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>{t('form_rg_label')} <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>{t('form_rg_optional_label')}</span></label>
                <input
                  name="identidade"
                  value={form.identidade}
                  onChange={(e) => { handleChange(e); setDuplicateErrors(prev => ({ ...prev, identidade: undefined })); }}
                  onBlur={() => form.identidade && checkDuplicate('identidade', form.identidade)}
                  placeholder="Nº do RG, CIN ou Documento Único"
                  style={duplicateErrors.identidade ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {checkingDuplicate.identidade && <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>{t('checking_field')}</span>}
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
                    {menorDeIdade ? t('form_age_minor') : t('form_age_adult')}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>{t('form_phone')} <span className="required">*</span></label>
                <input name="telefone" value={form.telefone} onChange={handleTelefoneChange} placeholder="(00) 00000-0000" />
              </div>
              <div className="form-group">
                <label>E-mail <span className="required">*</span></label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={e => { handleChange(e); setDuplicateErrors(prev => ({ ...prev, email: undefined })); setEmailTouched(true); }}
                  onBlur={() => { setEmailTouched(true); if (form.email) checkDuplicate('email', form.email); }}
                  placeholder="seu@email.com"
                  style={(emailTouched && !form.email) || duplicateErrors.email ? { borderColor: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,0.2)' } : {}}
                />
                {emailTouched && !form.email && !duplicateErrors.email && (
                  <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 4, fontWeight: 600 }}>
                    ⚠ E-mail é obrigatório.
                  </p>
                )}
                {duplicateErrors.email && (
                  <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 4, fontWeight: 600 }}>
                    ⚠ {duplicateErrors.email}
                  </p>
                )}
              </div>
              <div className="form-group">
                <label>{t('form_father_name')}</label>
                <input name="nome_pai" value={form.nome_pai} onChange={handleChange} placeholder={t('form_father_name')} />
              </div>
              <div className="form-group">
                <label>{t('form_mother_name')}</label>
                <input name="nome_mae" value={form.nome_mae} onChange={handleChange} placeholder={t('form_mother_name')} />
              </div>
            </div>
            </div>
          </div>

          {/* Termo de Autorização — aparece automaticamente para menores de idade */}
          {menorDeIdade && (
            <div className="form-section" style={{ border: '2px solid #dc2626', padding: 0, overflow: 'hidden' }}>
              {/* Cabeçalho */}
              <div style={{ background: '#dc2626', padding: '14px 20px', textAlign: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {t('form_minor_term_title')}
                </div>
              </div>

              <div style={{ padding: '20px 20px' }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem', lineHeight: 1.9, textAlign: 'justify', marginBottom: 20, color: 'var(--text-primary)' }}>
                  {t('form_minor_term_text')}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                      {t('form_guardian_name')} <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      name="nome_responsavel"
                      value={form.nome_responsavel}
                      onChange={handleChange}
                      placeholder={t('form_guardian_name')}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                      {t('form_guardian_cpf_label')} <span style={{ color: '#dc2626' }}>*</span>
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
          <div className="form-section section-foto">
            <div className="form-section-header">
              <div className="form-section-icon">📷</div>
              <h2 className="form-section-title">{t('form_photo')}</h2>
            </div>
            <div className="form-section-body">
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
          </div>

          {/* Endereço */}
          <div className="form-section section-endereco">
            <div className="form-section-header">
              <div className="form-section-icon">📍</div>
              <h2 className="form-section-title">{t('form_address')}</h2>
            </div>
            <div className="form-section-body">
            <div className="form-grid">
              <div className="form-group">
                <label>{t('form_cep')}</label>
                <input name="cep" value={form.cep} onChange={handleCEPChange} placeholder="00000-000" />
              </div>
              <div className="form-group">
                <label>{t('form_estado_label')} <span className="required">*</span></label>
                <input name="estado" value={form.estado} onChange={handleChange} placeholder="UF" />
              </div>
              <div className="form-group full-width">
                <label>{t('form_endereco_label')} <span className="required">*</span></label>
                <input name="endereco" value={form.endereco} onChange={handleChange} placeholder={t('form_street')} />
              </div>
              <div className="form-group">
                <label>{t('form_numero_label')} <span className="required">*</span></label>
                <input name="numero" value={form.numero} onChange={handleChange} placeholder="Nº" />
              </div>
              <div className="form-group">
                <label>{t('form_complemento_label')}</label>
                <input name="complemento" value={form.complemento} onChange={handleChange} placeholder={t('form_complement')} />
              </div>
              <div className="form-group">
                <label>{t('form_bairro_label')} <span className="required">*</span></label>
                <input name="bairro" value={form.bairro} onChange={handleChange} placeholder={t('form_neighborhood')} />
              </div>
              <div className="form-group">
                <label>{t('form_cidade_label')} <span className="required">*</span></label>
                <input name="cidade" value={form.cidade} onChange={handleChange} placeholder={t('form_city')} />
              </div>
            </div>
            </div>
          </div>

          {/* Graduação */}
          <div className="form-section section-graduacao">
            <div className="form-section-header">
              <div className="form-section-icon">🥋</div>
              <h2 className="form-section-title">{t('common_graduation')}</h2>
            </div>
            <div className="form-section-body">
            <div className="form-grid">
              <div className="form-group">
                <label>{t('form_tipo_label')} <span className="required">*</span></label>
                <select value={tipoGraduacao} onChange={(e) => { setTipoGraduacao(e.target.value); setGraduacao(''); }}>
                  <option value="infantil">{t('form_tipo_infantil')}</option>
                  <option value="adulta">{t('form_tipo_adulta')}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('form_corda_label')} <span className="required">*</span></label>
                <select value={graduacao} onChange={(e) => setGraduacao(e.target.value)}>
                  <option value="">{t('form_corda_select')}</option>
                  {graduacoes.map(g => (
                    <option key={g} value={g}>{g}{nomenclaturaGraduacao[g] ? ` — ${nomenclaturaGraduacao[g]}` : ''}</option>
                  ))}
                </select>
              </div>
              {graduacao && (
                <div className="form-group full-width">
                  <label>{t('form_corda_preview')}</label>
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
          </div>

          {/* Condição do Aluno – Desenvolvimento Atípico */}
          <div className="form-section" style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
            <div className="form-section-header" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(109,40,217,0.04))' }}>
              <div className="form-section-icon">🧩</div>
              <h2 className="form-section-title">{t('form_condicoes_title')}</h2>
            </div>
            <div className="form-section-body">
              <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 14px', lineHeight: 1.5 }}>
                {t('form_condicoes_desc')}
              </p>
              {(() => {
                const opcoes = [
                  t('cond_tea'),
                  t('cond_tdah'),
                  t('cond_def_intelectual'),
                  t('cond_down'),
                  t('cond_dislexia'),
                  t('cond_discalculia'),
                  t('cond_ansiedade'),
                  t('cond_aprendizagem'),
                  t('cond_atraso'),
                  t('cond_def_visual'),
                  t('cond_def_auditiva'),
                  t('cond_def_fisica'),
                  t('cond_tod'),
                  t('cond_superdotacao'),
                  t('cond_epilepsia'),
                  t('cond_outro'),
                ];
                const selected: string[] = form.condicoes_atipicas as string[];
                const toggle = (op: string) => {
                  setForm(prev => {
                    const cur: string[] = prev.condicoes_atipicas as string[];
                    const next = cur.includes(op) ? cur.filter(x => x !== op) : [...cur, op];
                    return { ...prev, condicoes_atipicas: next };
                  });
                };
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px 16px' }}>
                      {opcoes.map(op => {
                        const checked = selected.includes(op);
                        return (
                          <label key={op} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${checked ? 'rgba(139,92,246,0.5)' : 'var(--border, #e5e7eb)'}`, background: checked ? 'rgba(139,92,246,0.06)' : 'transparent', transition: 'all 0.15s' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(op)}
                              style={{ marginTop: 2, accentColor: '#7c3aed', flexShrink: 0, width: 16, height: 16 }}
                            />
                            <span style={{ fontSize: '0.84rem', color: checked ? '#5b21b6' : '#374151', fontWeight: checked ? 600 : 400, lineHeight: 1.4 }}>{op}</span>
                          </label>
                        );
                      })}
                    </div>
                    {selected.includes('Outro') && (
                      <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: '0.78rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>{t('form_condicoes_outro')}</label>
                        <input
                          type="text"
                          value={form.condicoes_atipicas_outro as string}
                          onChange={e => setForm(prev => ({ ...prev, condicoes_atipicas_outro: e.target.value }))}
                          placeholder={t('form_condicoes_outro_placeholder')}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid rgba(139,92,246,0.4)', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }}
                        />
                      </div>
                    )}
                    {selected.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {selected.map(s => (
                          <span key={s} style={{ background: 'rgba(139,92,246,0.12)', color: '#5b21b6', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 99, padding: '2px 10px', fontSize: '0.74rem', fontWeight: 600 }}>
                            {s === 'Outro' && (form.condicoes_atipicas_outro as string) ? `Outro: ${form.condicoes_atipicas_outro}` : s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Autorização de Uso de Imagem */}
          <div className="form-section section-autorizacao">
            <div className="form-section-header">
              <div className="form-section-icon">✅</div>
              <h2 className="form-section-title">{t('form_image_auth_section')}</h2>
            </div>
            <div className="form-section-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="checkbox-group">
                <input type="checkbox" name="autoriza_imagem" checked={form.autoriza_imagem} onChange={handleChange} />
                <span>{t('form_image_auth_full')}</span>
              </label>
            </div>
            </div>
          </div>

          {/* ── Acessar Rascunho ── */}
          {mounted && !draftLoaded && (
            <div style={{ margin: '0 0 16px', background: 'rgba(234,179,8,0.05)', border: '1.5px dashed rgba(234,179,8,0.3)', borderRadius: 12, padding: '16px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ca8a04', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {t('draft_access_title')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder={t('draft_cpf_placeholder')}
                  value={draftAccessCpf}
                  onChange={e => setDraftAccessCpf(e.target.value)}
                  style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none' }}
                />
                <button type="button" onClick={loadDraftByCpf} disabled={draftAccessLoading}
                  style={{ padding: '9px 18px', background: '#ca8a04', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: draftAccessLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                  {draftAccessLoading ? t('form_saving') : t('draft_load_btn')}
                </button>
              </div>
              {draftAccessMsg && (
                <div style={{ marginTop: 8, fontSize: '0.8rem', fontWeight: 600, color: draftAccessMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
                  {draftAccessMsg}
                </div>
              )}
            </div>
          )}
          {mounted && draftLoaded && (
            <div style={{ margin: '0 0 16px', background: 'rgba(22,163,74,0.06)', border: '1.5px solid rgba(22,163,74,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 700 }}>
                {t('draft_loaded_msg')}
              </div>
              <button type="button" onClick={() => { setDraftLoaded(false); setDraftAccessMsg(''); setDraftAccessCpf(''); }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>✕ {t('common_close')}</button>
            </div>
          )}

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
              {draftLoading ? t('form_saving') : (mounted && draftLoaded) ? '💾 Salvar Rascunho (atualizar)' : `💾 ${t('form_save_draft')}`}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0 }}>
              {t('draft_hint')}
            </p>
          </div>
        </form>
        )}

        {/* ===== ABA CARTEIRINHA ===== */}
        {activeSection === 'carteirinha' && (
          <div className="form-section" style={{ borderTopLeftRadius: 0, marginBottom: 32 }}>
            <h2 className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              {t('card_title')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16, marginTop: -4 }}>
              {t('card_subtitle')}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                placeholder={t('card_cpf_placeholder')}
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
                {cardLoading ? t('card_searching') : t('card_search_btn')}
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
                  {t('success_print')}
                </button>
                <button
                  type="button"
                  onClick={() => shareCarteirinhaWhatsApp(cardData.telefone, cardData.nome, cardData.cpf)}
                  style={{ padding: '12px 24px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  {t('success_whatsapp')}
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
              {t('financial_title')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 20, marginTop: -4 }}>
              {t('financial_subtitle')}
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
                  💰 {t('financial_access_student')} {cardData.nome.split(' ')[0]}
                </a>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0 }}>
                  {t('financial_password_hint')}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.15)', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      placeholder={t('card_cpf_placeholder')}
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
                      {cardLoading ? t('card_searching') : t('card_verify_btn')}
                    </button>
                  </div>
                  {cardError && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: 0, fontWeight: 600 }}>⚠ {cardError}</p>}
                </div>
                <a
                  href="/financeiro"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: '0.95rem', boxShadow: '0 4px 16px rgba(22,163,74,0.3)' }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  💰 {t('financial_access_btn')}
                </a>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0 }}>
                  {t('financial_cpf_hint')}
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
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a', margin: '0 0 6px' }}>{t('success_title')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 10px' }}>
                {t('success_welcome')} <strong style={{ color: 'var(--text-primary)' }}>{successData.nome.split(' ')[0]}</strong>! {t('success_card_ready')}
              </p>
              {successData.inscricao_numero != null && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', borderRadius: 8, padding: '6px 16px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Matrícula</span>
                  <span style={{ color: '#fbbf24', fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.06em' }}>
                    DEMO-{String(successData.inscricao_numero).padStart(6, '0')}
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
              {t('success_print')}
            </button>
            <button
              onClick={() => shareCarteirinhaWhatsApp(successData.telefone, successData.nome, successData.cpf)}
              style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,rgba(37,211,102,0.15),rgba(37,211,102,0.08))', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t('success_whatsapp')}
            </button>
            <button
              onClick={() => { setSuccess(false); setSuccessData(null); }}
              style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,#0f172a,#1e293b)', border: '1px solid rgba(100,116,139,0.4)', color: '#94a3b8', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {t('success_finish')}
            </button>

            {/* Criar Conta de Acesso */}
            {successData?.student_id && (
              <div style={{ marginTop: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '16px 16px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e3a5f' }}>{t('success_create_account')}</div>
                    <div style={{ fontSize: '0.74rem', color: '#0369a1' }}>{t('success_create_account_desc')}</div>
                  </div>
                </div>

                {successDisplayId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#dbeafe', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                    <span style={{ fontSize: '0.76rem', color: '#1e40af', fontWeight: 600 }}>ID: </span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#1d4ed8', letterSpacing: '0.05em' }}>{successDisplayId}</span>
                  </div>
                )}

                {criarContaUsername ? (
                  <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534', marginBottom: 4 }}>{t('success_account_created')}</div>
                    <div style={{ fontSize: '0.78rem', color: '#15803d' }}>
                      {t('success_account_login')}: <strong>{criarContaUsername}</strong><br />
                      {t('success_account_access')}
                    </div>
                  </div>
                ) : criarContaMsg && criarContaMsg.startsWith('❌') ? (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: '0.78rem', color: '#991b1b' }}>{criarContaMsg}</div>
                ) : null}

                {!criarContaUsername && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>{t('success_initial_password')}</label>
                      <input
                        type="password"
                        value={criarContaPassword}
                        onChange={e => setCriarContaPassword(e.target.value)}
                        placeholder={t('success_password_hint')}
                        minLength={6}
                        style={{ width: '100%', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#374151', marginBottom: 3 }}>{t('form_phone')}</label>
                      <input
                        type="tel"
                        value={criarContaPhone}
                        onChange={e => setCriarContaPhone(e.target.value)}
                        placeholder="(21) 99999-9999"
                        style={{ width: '100%', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '9px 11px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
                      />
                    </div>
                    <button
                      disabled={criarContaLoading || criarContaPassword.length < 6}
                      onClick={async () => {
                        if (!successData?.student_id || criarContaPassword.length < 6) return;
                        setCriarContaLoading(true);
                        setCriarContaMsg('');
                        try {
                          const res = await fetch('/api/aluno/auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'admin-create-auto',
                              student_id: successData.student_id,
                              password: criarContaPassword,
                              phone: criarContaPhone || successData.telefone || '',
                              nome_completo: successData.nome,
                              nucleo: successData.nucleo,
                              telefone: successData.telefone || '',
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setCriarContaMsg(`❌ ${data.error || 'Erro ao criar conta.'}`);
                          } else {
                            setCriarContaUsername(data.username);
                            if (data.display_id) setSuccessDisplayId(data.display_id);
                          }
                        } catch {
                          setCriarContaMsg('❌ Erro de conexão.');
                        } finally {
                          setCriarContaLoading(false);
                        }
                      }}
                      style={{ background: criarContaLoading || criarContaPassword.length < 6 ? '#9ca3af' : 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: criarContaLoading || criarContaPassword.length < 6 ? 'not-allowed' : 'pointer' }}
                    >
                      {criarContaLoading ? t('creating_account') : t('success_create_account_btn')}
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn-submit"
              style={{ marginTop: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)' }}
              onClick={() => window.location.reload()}
            >
              {t('success_new_registration')}
            </button>
          </div>
        </div>
      )}

      {/* ── Rodapé ── */}
      <footer style={{ marginTop:24, paddingBottom:24, display:'flex', justifyContent:'flex-end', paddingRight:4 }}>
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          background:'rgba(37,211,102,0.07)', border:'1px solid rgba(37,211,102,0.25)',
          borderRadius:12, padding:'10px 14px',
        }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', lineHeight:1.4 }}>
              {t('footer_created_by')}
            </div>
            <div style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-primary)', lineHeight:1.4 }}>
              {t('footer_author')}
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
        🔒 {t('admin_panel_title')}
      </button>

      {adminModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
          onClick={e => { if (e.target === e.currentTarget) { setAdminModalOpen(false); setAdminLoading(false); setAdminScreen('login'); } }}>
          <div style={{ background: 'linear-gradient(160deg,#1a1a2e,#16213e)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '28px 26px', width: 520, maxWidth: '96vw', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', maxHeight: '92vh', overflowY: 'auto' }}>

            {/* ── LOGIN ── */}
            {adminScreen === 'login' && (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>🔐</div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', marginBottom: 2 }}>{t('admin_panel_title')}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.73rem' }}>{t('admin_access_profiles')}</div>
                </div>

                {/* Cards de perfil de acesso */}
                <div style={{ display: 'grid', gridTemplateColumns: dynamicNucleos.length > 0 ? `repeat(${Math.min(dynamicNucleos.length + 2, 4)}, 1fr)` : '1fr 1fr 1fr', gap: 8 }}>
                  {/* Owner (Desenvolvedor) */}
                  <div onClick={() => { setAdminUser('owner'); setTimeout(() => document.getElementById('adminPassInput')?.focus(), 50); }}
                    style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.18),rgba(109,40,217,0.1))', border: `1.5px solid ${adminUser === 'owner' ? '#8b5cf6' : 'rgba(124,58,237,0.35)'}`, borderRadius: 10, padding: '10px 8px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', boxShadow: adminUser === 'owner' ? '0 0 0 2px rgba(139,92,246,0.3)' : 'none' }}>
                    <div style={{ fontSize: 28, marginBottom: 2 }}>*</div>
                    <div style={{ color: '#c4b5fd', fontWeight: 800, fontSize: '0.7rem', lineHeight: 1.2 }}>Owner</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.58rem', marginTop: 2 }}>Desenvolvedor</div>
                  </div>
                  {/* Admin Geral */}
                  <div onClick={() => { setAdminUser('admin'); setTimeout(() => document.getElementById('adminPassInput')?.focus(), 50); }}
                    style={{ background: 'linear-gradient(135deg,rgba(29,78,216,0.18),rgba(30,64,175,0.1))', border: `1.5px solid ${adminUser === 'admin' ? '#3b82f6' : 'rgba(29,78,216,0.35)'}`, borderRadius: 10, padding: '10px 8px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', boxShadow: adminUser === 'admin' ? '0 0 0 2px rgba(59,130,246,0.3)' : 'none' }}>
                    <img src="/logo-barao-maua.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain', marginBottom: 5, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5)) brightness(1.1)' }} />
                    <div style={{ color: '#93c5fd', fontWeight: 800, fontSize: '0.7rem', lineHeight: 1.2 }}>Admin Geral</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.58rem', marginTop: 2 }}>Todos os nucleos</div>
                  </div>
                  {/* Nucleos dinamicos do banco de dados */}
                  {dynamicNucleos.map((nuc, idx) => {
                    const colors = [
                      { bg: 'rgba(220,38,38,0.15)', border: 'rgba(220,38,38,0.3)', text: '#fca5a5', hue: '330deg' },
                      { bg: 'rgba(234,88,12,0.15)', border: 'rgba(234,88,12,0.3)', text: '#fdba74', hue: '10deg' },
                      { bg: 'rgba(22,163,74,0.15)', border: 'rgba(22,163,74,0.3)', text: '#86efac', hue: '90deg' },
                      { bg: 'rgba(147,51,234,0.15)', border: 'rgba(147,51,234,0.3)', text: '#d8b4fe', hue: '240deg' },
                      { bg: 'rgba(8,145,178,0.15)', border: 'rgba(8,145,178,0.3)', text: '#67e8f9', hue: '175deg' },
                      { bg: 'rgba(5,150,105,0.15)', border: 'rgba(5,150,105,0.3)', text: '#6ee7b7', hue: '120deg' },
                    ];
                    const c = colors[idx % colors.length];
                    return (
                      <a key={nuc.id} href={`/nucleo/${nuc.slug}`} style={{ textDecoration: 'none' }}>
                        <div style={{ background: `linear-gradient(135deg,${c.bg},rgba(0,0,0,0.08))`, border: `1.5px solid ${c.border}`, borderRadius: 10, padding: '10px 8px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', height: '100%', boxSizing: 'border-box' }}>
                          <img src={nuc.logo_url || '/logo-barao-maua.png'} alt="" style={{ width: 36, height: 36, objectFit: 'contain', marginBottom: 5, filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.5)) sepia(1) saturate(3) hue-rotate(${c.hue})` }} />
                          <div style={{ color: c.text, fontWeight: 800, fontSize: '0.65rem', lineHeight: 1.2 }}>{nuc.nome}</div>
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.56rem', marginTop: 2 }}>{nuc.cidade || 'Demo'}</div>
                        </div>
                      </a>
                    );
                  })}
                </div>

                {/* Separador Admin Geral */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', marginBottom: 10, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t('admin_geral_login')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('admin_login_label')}</div>
                      <input autoFocus value={adminUser} onChange={e => { setAdminUser(e.target.value); setAdminErro(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdminAccess(); }}
                        placeholder="owner, admin ou CPF" disabled={adminLoading}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.14)', borderRadius: 9, color: '#fff', fontSize: '0.95rem', outline: 'none' }} />
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('admin_password')}</div>
                      <div style={{ position: 'relative' }}>
                        <input id="adminPassInput" type={adminShowPass ? 'text' : 'password'} value={adminPass} onChange={e => { setAdminPass(e.target.value); setAdminErro(''); }}
                          onKeyDown={e => { if (e.key === 'Enter') handleAdminAccess(); }}
                          placeholder="••••••••" disabled={adminLoading}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 40px 10px 14px', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.14)', borderRadius: 9, color: '#fff', fontSize: '0.95rem', outline: 'none' }} />
                        <button type="button" onClick={() => setAdminShowPass(v => !v)}
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
                          {adminShowPass ? '🙈' : '👁'}
                        </button>
                      </div>
                    </div>
                  </div>
                  {adminErro && <div style={{ marginTop: 8, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '8px 12px', color: '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>⚠ {adminErro}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button onClick={() => { setAdminModalOpen(false); setAdminLoading(false); setAdminUser(''); setAdminPass(''); setAdminErro(''); }}
                      style={{ flex: 1, padding: '10px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem' }}>
                      {t('admin_cancel_btn')}
                    </button>
                    <button onClick={handleAdminAccess} disabled={adminLoading}
                      style={{ flex: 2, padding: '10px', borderRadius: 9, background: 'linear-gradient(135deg,#b45309,#d97706)', border: 'none', color: '#fff', cursor: adminLoading ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: 700, opacity: adminLoading ? 0.7 : 1 }}>
                      {adminLoading ? t('admin_verifying') : t('admin_enter_as')}
                    </button>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10, marginTop: 4, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => { setAdminScreen('change'); setAdminChgMsg(''); setAdminChgCurrent(''); setAdminChgNew(''); setAdminChgConfirm(''); }}
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 7, padding: '6px 13px', fontSize: '0.73rem', cursor: 'pointer', fontWeight: 600 }}>
                      {t('admin_change_password')}
                    </button>
                    <button onClick={() => { setAdminScreen('recover'); setRecMsg(''); setRecAdminUser(''); setRecAdminPass(''); setRecTargetUser(''); setRecNewPass(''); }}
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 7, padding: '6px 13px', fontSize: '0.73rem', cursor: 'pointer', fontWeight: 600 }}>
                      {t('admin_reset_password')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── ALTERAR MINHA SENHA ── */}
            {adminScreen === 'change' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setAdminScreen('login')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHeight: 1 }}>←</button>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>🔑 Alterar Minha Senha</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>Use sua senha atual para definir uma nova</div>
                  </div>
                </div>
                <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '8px 12px', color: '#93c5fd', fontSize: '0.75rem' }}>
                  💡 Admin Geral: usuário <strong>admin</strong>, senha padrão inicial: <strong>accbm2025</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Login / CPF', val: adminUser, set: setAdminUser, ph: 'admin  ou  CPF do responsável', pw: false },
                    { label: 'Senha Atual', val: adminChgCurrent, set: setAdminChgCurrent, ph: '••••••••', pw: true },
                    { label: 'Nova Senha', val: adminChgNew, set: setAdminChgNew, ph: 'mínimo 6 caracteres', pw: true },
                    { label: 'Confirmar Nova Senha', val: adminChgConfirm, set: setAdminChgConfirm, ph: '••••••••', pw: true },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
                      <input type={f.pw ? 'password' : 'text'} value={f.val} onChange={e => { f.set(e.target.value); setAdminChgMsg(''); }}
                        placeholder={f.ph}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.13)', borderRadius: 8, color: '#fff', fontSize: '0.9rem', outline: 'none' }} />
                    </div>
                  ))}
                </div>
                {adminChgMsg && <div style={{ borderRadius: 8, padding: '8px 12px', background: adminChgMsg.startsWith('✓') ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${adminChgMsg.startsWith('✓') ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.3)'}`, color: adminChgMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>{adminChgMsg}</div>}
                <button disabled={manageSaving} onClick={async () => {
                  if (!adminUser || !adminChgCurrent || !adminChgNew || !adminChgConfirm) { setAdminChgMsg('Preencha todos os campos.'); return; }
                  if (adminChgNew !== adminChgConfirm) { setAdminChgMsg('As senhas não coincidem.'); return; }
                  if (adminChgNew.length < 6) { setAdminChgMsg('Nova senha deve ter mínimo 6 caracteres.'); return; }
                  setManageSaving(true);
                  const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change-password', username: adminUser.trim().toLowerCase(), current_password: adminChgCurrent, new_password: adminChgNew }) });
                  const d = await res.json();
                  setAdminChgMsg(res.ok ? '✓ Senha alterada com sucesso! Faça login com a nova senha.' : (d.error || 'Erro ao alterar senha.'));
                  if (res.ok) { setAdminChgCurrent(''); setAdminChgNew(''); setAdminChgConfirm(''); }
                  setManageSaving(false);
                }} style={{ padding: '10px', borderRadius: 9, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: manageSaving ? 'wait' : 'pointer', opacity: manageSaving ? 0.7 : 1 }}>
                  {manageSaving ? '⏳ Salvando...' : '✅ Salvar Nova Senha'}
                </button>
              </>
            )}

            {/* ── REDEFINIR SENHA (Admin Geral redefine senha de qualquer usuário) ── */}
            {adminScreen === 'recover' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setAdminScreen('login')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHeight: 1 }}>←</button>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>🔄 Redefinir Senha</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>Somente o Admin Geral pode redefinir senhas de outros</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Usuário Admin Geral', val: recAdminUser, set: setRecAdminUser, ph: 'admin', pw: false },
                    { label: 'Senha do Admin Geral', val: recAdminPass, set: setRecAdminPass, ph: '••••••••', pw: true },
                    { label: 'Usuário para Redefinir', val: recTargetUser, set: setRecTargetUser, ph: 'ex: responsavel_saracuruna', pw: false },
                    { label: 'Nova Senha para o Usuário', val: recNewPass, set: setRecNewPass, ph: 'mínimo 6 caracteres', pw: true },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
                      <input type={f.pw ? 'password' : 'text'} value={f.val} onChange={e => { f.set(e.target.value); setRecMsg(''); }}
                        placeholder={f.ph}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.13)', borderRadius: 8, color: '#fff', fontSize: '0.9rem', outline: 'none' }} />
                    </div>
                  ))}
                </div>
                {recMsg && <div style={{ borderRadius: 8, padding: '8px 12px', background: recMsg.startsWith('✓') ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${recMsg.startsWith('✓') ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.3)'}`, color: recMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>{recMsg}</div>}
                <button disabled={manageSaving} onClick={async () => {
                  if (!recAdminUser || !recAdminPass || !recTargetUser || !recNewPass) { setRecMsg('Preencha todos os campos.'); return; }
                  if (recNewPass.length < 6) { setRecMsg('Nova senha deve ter mínimo 6 caracteres.'); return; }
                  setManageSaving(true);
                  const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-password', admin_username: recAdminUser, admin_password: recAdminPass, target_username: recTargetUser, new_password: recNewPass }) });
                  const d = await res.json();
                  setRecMsg(res.ok ? `✓ Senha de "${recTargetUser}" redefinida com sucesso!` : (d.error || 'Erro ao redefinir senha.'));
                  if (res.ok) { setRecTargetUser(''); setRecNewPass(''); }
                  setManageSaving(false);
                }} style={{ padding: '10px', borderRadius: 9, background: 'linear-gradient(135deg,#b45309,#d97706)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: manageSaving ? 'wait' : 'pointer', opacity: manageSaving ? 0.7 : 1 }}>
                  {manageSaving ? '⏳ Redefinindo...' : '🔄 Redefinir Senha'}
                </button>
              </>
            )}

          </div>
        </div>
      )}

      </>
    );
}
