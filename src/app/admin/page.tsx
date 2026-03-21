'use client';
// v2
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getCordaColors, graduacoes, nomenclaturaGraduacao } from '@/lib/graduacoes';
import { getCheckins, getHistorico, removeCheckin, CheckinRecord } from '@/lib/checkins';
import Link from 'next/link';
import Carteirinha from '@/components/Carteirinha';
import DocumentsBar from '@/components/DocumentsBar';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface PresencaCount {
  student_id: string;
  count: number;
}

interface TermoEnviado {
  sent_at: string;   // ISO timestamp
  sent_count: number;
}

const hoje = () => {
  const now = new Date();
  const br = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${br.getFullYear()}-${String(br.getMonth()+1).padStart(2,'0')}-${String(br.getDate()).padStart(2,'0')}`;
};

const BUCKET = 'photos';

async function registrarTermoEnviado(studentId: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const key = `termos-enviados/${studentId}.json`;
  // Lê registro anterior para incrementar contagem
  let prev: TermoEnviado = { sent_at: '', sent_count: 0 };
  const { data } = await admin.storage.from(BUCKET).download(key);
  if (data) {
    try { prev = JSON.parse(await data.text()); } catch {}
  }
  const record: TermoEnviado = {
    sent_at: new Date().toISOString(),
    sent_count: (prev.sent_count || 0) + 1,
  };
  await admin.storage.from(BUCKET).upload(
    key,
    new Blob([JSON.stringify(record)], { type: 'application/json' }),
    { upsert: true },
  );
  return record;
}

async function carregarTermosEnviados(studentIds: string[]): Promise<Record<string, TermoEnviado>> {
  if (!studentIds.length) return {};
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const result: Record<string, TermoEnviado> = {};
  await Promise.all(studentIds.map(async (id) => {
    const { data } = await admin.storage.from(BUCKET).download(`termos-enviados/${id}.json`);
    if (data) {
      try { result[id] = JSON.parse(await data.text()); } catch {}
    }
  }));
  return result;
}

interface Student {
  id: string;
  nome_completo: string;
  apelido?: string | null;
  nome_social?: string | null;
  sexo?: string | null;
  cpf: string;
  identidade: string;
  data_nascimento: string;
  telefone: string;
  email?: string | null;
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
  ordem_inscricao?: number | null;
  ultimo_checkin?: string | null;
  checkin_nucleo?: string | null;
}

type EditForm = Partial<Student>;

// ─── Auth helpers ────────────────────────────────────────────────────────────
type NucleoKey = 'edson-alves' | 'ipiranga' | 'saracuruna' | 'vila-urussai' | 'jayme-fichman' | 'geral';
interface Profile { user: string; pass: string; nucleo: NucleoKey; label: string; color: string; }

const PROFILES_KEY = 'accbm_admin_profiles';
const DEFAULT_PROFILES: Profile[] = [
  { nucleo: 'edson-alves',    label: 'Poliesportivo Edson Alves', color: '#dc2626', user: 'edsonalves',     pass: 'edson2025'       },
  { nucleo: 'ipiranga',       label: 'Poliesportivo do Ipiranga', color: '#ea580c', user: 'ipiranga',       pass: 'ipiranga2025'    },
  { nucleo: 'saracuruna',     label: 'Núcleo Saracuruna',         color: '#16a34a', user: 'saracuruna',     pass: 'sara2025'        },
  { nucleo: 'vila-urussai',   label: 'Núcleo Vila Urussaí',       color: '#9333ea', user: 'vilaurussai',    pass: 'urussai2025'     },
  { nucleo: 'jayme-fichman',  label: 'Núcleo Jayme Fichman',      color: '#0891b2', user: 'jaymefichman',   pass: 'fichman2025'     },
  { nucleo: 'geral',          label: 'Admin Geral',                color: '#1d4ed8', user: 'admin',          pass: 'accbm2025'       },
];

function getProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_PROFILES;
}
function saveProfiles(profiles: Profile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}
// ─────────────────────────────────────────────────────────────────────────────

// ── GPS Map component (Leaflet, loaded dynamically) ──────────────────────────
function GpsMap({ checkins, containerRef, leafletMapRef }: {
  checkins: CheckinRecord[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  leafletMapRef: React.MutableRefObject<any>;
}) {
  const withGps = checkins.filter(c => c.lat && c.lng);

  useEffect(() => {
    if (!containerRef.current) return;

    // Load Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    let destroyed = false;

    import('leaflet').then(({ default: L }) => {
      if (destroyed || !containerRef.current) return;

      // Destroy previous map instance
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      // Fix default icon paths for Next.js
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const center: [number, number] = withGps.length > 0
        ? [withGps[0].lat!, withGps[0].lng!]
        : [-22.655, -43.1];

      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false });
      leafletMapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (withGps.length === 0) {
        map.setView(center, 13);
        return;
      }

      const bounds: [number, number][] = [];

      withGps.forEach(c => {
        const isPending = (c as any)._offline_pending;
        const color = isPending ? '#f59e0b' : '#16a34a';
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;overflow:hidden;">${c.foto_url
            ? `<img src="${c.foto_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
            : `<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'><circle cx='12' cy='8' r='4'/><path d='M6 21v-2a6 6 0 0112 0v2'/></svg>`
          }</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });

        const localLine = c.local_nome ? `<br/>📍 ${c.local_nome}` : '';
        const pendingLine = isPending ? '<br/><span style="color:#f59e0b;font-weight:700">⏳ Pendente sync</span>' : '';
        L.marker([c.lat!, c.lng!], { icon })
          .bindPopup(`<div style="font-family:Inter,sans-serif;min-width:160px"><div style="font-weight:700;font-size:0.92rem">${c.nome_completo}</div><div style="color:#64748b;font-size:0.78rem">${c.graduacao} · ${c.nucleo}</div><div style="font-size:0.8rem;margin-top:4px">🕐 ${c.hora}${localLine}${pendingLine}</div><a href="https://maps.google.com/?q=${c.lat},${c.lng}" target="_blank" style="display:inline-block;margin-top:6px;font-size:0.75rem;color:#3b82f6">Ver no Google Maps →</a></div>`)
          .addTo(map);
        bounds.push([c.lat!, c.lng!]);
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 16);
      } else {
        map.fitBounds(bounds as any, { padding: [30, 30] });
      }
    }).catch(() => {});

    return () => {
      destroyed = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkins]);

  const offlineCount = withGps.filter(c => (c as any)._offline_pending).length;
  const onlineCount  = withGps.length - offlineCount;

  return (
    <div style={{ marginBottom: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.9rem' }}>🗺 Localização GPS em Tempo Real</span>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', marginLeft: 10 }}>
            {withGps.length} de {checkins.length} alunos com GPS
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem' }}>
          {onlineCount > 0 && <span style={{ background: 'rgba(22,163,74,0.25)', border: '1px solid rgba(22,163,74,0.5)', color: '#86efac', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>● {onlineCount} sincronizado{onlineCount !== 1 ? 's' : ''}</span>}
          {offlineCount > 0 && <span style={{ background: 'rgba(245,158,11,0.25)', border: '1px solid rgba(245,158,11,0.5)', color: '#fcd34d', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>⏳ {offlineCount} pendente{offlineCount !== 1 ? 's' : ''}</span>}
        </div>
      </div>
      {withGps.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Nenhum check-in com GPS registrado ainda.
        </div>
      ) : (
        <div ref={containerRef} style={{ height: 380, width: '100%' }} />
      )}
    </div>
  );
}

// ── Histórico de Graduações — tipo fora do componente ──────────────────────
interface RegistroGraduacao {
  id: string;
  data_graduacao: string;
  graduacao_recebida: string;
  evento: string;
  professor_responsavel: string;
  observacoes?: string;
  criado_em: string;
}
const EMPTY_GRAD_FORM = { data_graduacao: '', graduacao_recebida: '', evento: '', professor_responsavel: '', observacoes: '' };
const GRAD_OPCOES_ADULTO = [
  'Crua','Crua e Amarela','Amarela','Amarela e Laranja','Laranja','Laranja e Azul',
  'Azul','Azul e Verde','Verde','Verde e Roxa','Roxa','Roxa e Marrom',
  'Marrom','Marrom e Vermelha','Vermelha','Vermelha e Branco','Branco Mor',
];
const GRAD_OPCOES_INFANTIL = [
  'Crua','Crua Ponta Cinza','Crua Ponta Amarela','Crua Ponta Laranja','Crua Ponta Verde','Crua Ponta Azul','Crua Ponta Roxa',
  'Crua e Cinza','Crua e Laranja','Crua e Verde','Crua e Azul','Crua e Roxa',
  'Cinza','Cinza e Amarela','Verde e Amarela','Amarela e Azul',
];

export default function AdminPage() {
  const { t } = useLanguage();
  const [authed, setAuthed] = useState(false);
  const [activeNucleo, setActiveNucleo] = useState<NucleoKey | null>(null);
  const [availableNucleos, setAvailableNucleos] = useState<NucleoKey[]>([]);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPass, setShowPass] = useState(false);
  // Change-credentials modal
  const [showChangeCreds, setShowChangeCreds] = useState(false);
  const [editingProfile, setEditingProfile] = useState<NucleoKey>('edson-alves');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeDone, setChangeDone] = useState(false);

  const SUPER_ADMIN_CPF = '09856925703';

  // ── Funções Histórico de Graduações ───────────────────────────────────────
  async function loadHistGrad(studentId: string) {
    setHistGradLoading(true);
    try {
      const res = await fetch(`/api/historico-graduacoes?student_id=${encodeURIComponent(studentId)}`);
      const data = await res.json();
      setHistGradRecords(data.records || []);
    } catch { setHistGradRecords([]); }
    setHistGradLoading(false);
  }

  async function saveHistGrad(studentId: string, form: typeof EMPTY_GRAD_FORM, editing: RegistroGraduacao | null) {
    if (!form.data_graduacao || !form.graduacao_recebida || !form.professor_responsavel) {
      setHistGradMsg('Preencha data, graduação e professor.'); return;
    }
    setHistGradSaving(true); setHistGradMsg('');
    try {
      const registro = editing ? { ...form, id: editing.id } : { ...form };
      const res = await fetch('/api/historico-graduacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, registro }),
      });
      const data = await res.json();
      if (data.ok) {
        setHistGradRecords(data.records || []);
        setHistGradForm(EMPTY_GRAD_FORM);
        setHistGradEditing(null);
        setHistGradMsg('✓ Salvo!');
        setTimeout(() => setHistGradMsg(''), 3000);
      } else { setHistGradMsg('Erro: ' + (data.error || '')); }
    } catch (e: any) { setHistGradMsg('Erro: ' + e.message); }
    setHistGradSaving(false);
  }

  async function deleteHistGrad(studentId: string, registroId: string) {
    if (!confirm('Remover este registro?')) return;
    const res = await fetch(`/api/historico-graduacoes?student_id=${encodeURIComponent(studentId)}&registro_id=${encodeURIComponent(registroId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) setHistGradRecords(data.records || []);
  }

  // Admin action logger
  async function logAdminAction(action: string, details?: string) {
    try {
      const nucleo = activeNucleo || 'unknown';
      const user = loginUser || 'admin';
      await fetch('/api/admin/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user, nucleo, details }),
      });
    } catch {}
  }

  // Login attempt limiting
  const ADMIN_MAX_ATTEMPTS = 5;
  const ADMIN_LOCKOUT_MS = 5 * 60 * 1000;
  function getAdminLoginState() {
    try {
      const raw = sessionStorage.getItem('admin_panel_login_attempts');
      if (!raw) return { count: 0, lockedUntil: 0 };
      return JSON.parse(raw) as { count: number; lockedUntil: number };
    } catch { return { count: 0, lockedUntil: 0 }; }
  }
  function setAdminLoginState(count: number, lockedUntil: number) {
    sessionStorage.setItem('admin_panel_login_attempts', JSON.stringify({ count, lockedUntil }));
  }

  // Autenticar com base no sessionStorage (set pelo modal da página principal ou pelo formulário de login)
  useEffect(() => {
    const stored = sessionStorage.getItem('admin_auth') as NucleoKey | null;
    if (!stored) return;
    setAuthed(true);
    setActiveNucleo(stored);

    // Tenta restaurar lista de núcleos da sessão
    try {
      const storedNucleos = JSON.parse(sessionStorage.getItem('admin_auth_nucleos') || '[]') as NucleoKey[];
      if (storedNucleos.length > 1) {
        setAvailableNucleos(storedNucleos);
        return;
      }
    } catch {}

    // Se não há lista salva (sessão antiga), busca da API para detectar múltiplos núcleos
    if (stored !== 'geral') {
      fetch('/api/admin/responsaveis')
        .then(r => r.json())
        .then(cfg => {
          // Descobre o CPF do responsável logado buscando qual nucleo_key bate com stored
          const allResp = cfg.responsaveis || [];
          // Para cada responsável, verifica se ele está no nucleo_key guardado
          // e coleta todos os nucleos onde ele aparece
          const nucleoEntry = allResp.find((r: any) => r.nucleo_key === stored);
          if (!nucleoEntry) return;
          // Pega o CPF do responsável atual (pode ser cpf ou cpf2)
          // Como não temos o CPF logado, busca todos os núcleos que têm o mesmo nome
          const nome1 = nucleoEntry.nome?.trim();
          const nome2 = nucleoEntry.nome2?.trim();
          const cpf1 = nucleoEntry.cpf?.trim();
          const cpf2 = nucleoEntry.cpf2?.trim();
          // Encontra todos os núcleos que compartilham qualquer desses cpfs
          const found: NucleoKey[] = allResp
            .filter((r: any) =>
              (cpf1 && (r.cpf === cpf1 || r.cpf2 === cpf1)) ||
              (cpf2 && (r.cpf === cpf2 || r.cpf2 === cpf2)) ||
              (nome1 && (r.nome === nome1 || r.nome2 === nome1)) ||
              (nome2 && (r.nome === nome2 || r.nome2 === nome2))
            )
            .map((r: any) => r.nucleo_key as NucleoKey);
          const unique = [...new Set(found)];
          if (unique.length > 1) {
            setAvailableNucleos(unique);
            sessionStorage.setItem('admin_auth_nucleos', JSON.stringify(unique));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Lockout check
    const als = getAdminLoginState();
    const now = Date.now();
    if (als.lockedUntil > now) {
      const secs = Math.ceil((als.lockedUntil - now) / 1000);
      setLoginError(`Muitas tentativas incorretas. Aguarde ${secs}s para tentar novamente.`);
      return;
    }

    // Try user/pass profiles first
    const profiles = getProfiles();
    const match = profiles.find(p => p.user === loginUser.trim() && p.pass === loginPass);
    if (match) {
      sessionStorage.setItem('admin_auth', match.nucleo);
      setAuthed(true);
      setActiveNucleo(match.nucleo);
      setAdminLoginState(0, 0);
      setLoginError('');
      fetch('/api/admin/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', user: loginUser.trim(), nucleo: match.nucleo }) }).catch(() => {});
      return;
    }
    // Try CPF-based login — aceita CPF no campo usuário OU no campo senha
    const cpfFromUser = loginUser.replace(/\D/g, '');
    const cpfFromPass = loginPass.replace(/\D/g, '');
    const cpfDigits = cpfFromUser.length >= 11 ? cpfFromUser : cpfFromPass.length >= 11 ? cpfFromPass : '';
    if (cpfDigits.length >= 11) {
      // Super admin CPF — full access
      if (cpfDigits === SUPER_ADMIN_CPF) {
        sessionStorage.setItem('admin_auth', 'geral');
        setAuthed(true);
        setActiveNucleo('geral');
        setAdminLoginState(0, 0);
        setLoginError('');
        fetch('/api/admin/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login_cpf', user: 'admin_geral', nucleo: 'geral' }) }).catch(() => {});
        return;
      }
      // Check responsáveis config (cpf or cpf2) — busca TODOS os núcleos do responsável
      try {
        const res = await fetch('/api/admin/responsaveis');
        const cfg = await res.json();
        const allMatches: any[] = (cfg.responsaveis || []).filter((r: any) =>
          (r.cpf || '').replace(/\D/g,'') === cpfDigits ||
          (r.cpf2 || '').replace(/\D/g,'') === cpfDigits
        );
        if (allMatches.length > 0) {
          const nucleosList = allMatches.map((r: any) => r.nucleo_key as NucleoKey);
          const firstNucleo = nucleosList[0];
          sessionStorage.setItem('admin_auth', firstNucleo);
          sessionStorage.setItem('admin_auth_nucleos', JSON.stringify(nucleosList));
          setAuthed(true);
          setActiveNucleo(firstNucleo);
          setAvailableNucleos(nucleosList);
          setAdminLoginState(0, 0);
          setLoginError('');
          fetch('/api/admin/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login_cpf', user: cpfDigits.slice(-4), nucleo: nucleosList.join(',') }) }).catch(() => {});
          return;
        }
      } catch {}
    }
    // Increment failed login attempt
    const als2 = getAdminLoginState();
    const newCount = als2.count + 1;
    if (newCount >= ADMIN_MAX_ATTEMPTS) {
      setAdminLoginState(0, Date.now() + ADMIN_LOCKOUT_MS);
      setLoginError(`Credenciais incorretas. Acesso bloqueado por 5 minutos após ${ADMIN_MAX_ATTEMPTS} tentativas.`);
    } else {
      setAdminLoginState(newCount, 0);
      setLoginError(`Usuário, senha ou CPF incorretos. Tentativa ${newCount}/${ADMIN_MAX_ATTEMPTS}.`);
    }
  };

  const handleChangeCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.trim()) { setChangeError('Informe o novo usuário.'); return; }
    if (newPass.length < 6) { setChangeError('Senha deve ter ao menos 6 caracteres.'); return; }
    if (newPass !== newPassConfirm) { setChangeError('As senhas não coincidem.'); return; }
    const profiles = getProfiles();
    const updated = profiles.map(p => p.nucleo === editingProfile ? { ...p, user: newUser.trim(), pass: newPass } : p);
    saveProfiles(updated);
    setChangeDone(true);
    setTimeout(() => {
      setChangeDone(false); setShowChangeCreds(false);
      setNewUser(''); setNewPass(''); setNewPassConfirm(''); setChangeError('');
    }, 2000);
  };

  const currentProfile = getProfiles().find(p => p.nucleo === activeNucleo);

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterNucleo, setFilterNucleo] = useState('');
  const [filterGraduacao, setFilterGraduacao] = useState('');
  const [sortOrder, setSortOrder] = useState<'nome-asc' | 'nome-desc' | 'grad-asc' | 'grad-desc' | 'data-asc' | 'data-desc'>('nome-asc');
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({});
  const [saving, setSaving] = useState(false);
  const [editFotoFile, setEditFotoFile] = useState<File | null>(null);
  const editFotoRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'alunos' | 'presencas' | 'relatorio' | 'ranking' | 'certificado' | 'financeiro' | 'doacoes' | 'editais' | 'materiais' | 'patrimonio' | 'rascunhos' | 'dados-faltantes' | 'manual' | 'eventos' | 'lixeira' | 'justificativas' | 'contas' | 'auditoria' | 'responsaveis'>('alunos');
  // Responsáveis de núcleo
  const [respUsers, setRespUsers] = useState<Array<{ username: string; label: string; nucleo: string; color: string; email: string }>>([]);
  const [respLoading, setRespLoading] = useState(false);
  const [respAdminPass, setRespAdminPass] = useState('');
  const [respAdminAuthed, setRespAdminAuthed] = useState(false);
  const [respAuthMsg, setRespAuthMsg] = useState('');
  const [respNewLogin, setRespNewLogin] = useState('');
  const [respNewPass, setRespNewPass] = useState('');
  const [respNewNucleo, setRespNewNucleo] = useState('');
  const [respCreateMsg, setRespCreateMsg] = useState('');
  const [respCreating, setRespCreating] = useState(false);
  const [respDeleteTarget, setRespDeleteTarget] = useState('');
  const [respDeleteMsg, setRespDeleteMsg] = useState('');
  const [respDeleting, setRespDeleting] = useState(false);
  const [respResetTarget, setRespResetTarget] = useState('');
  const [respResetPass, setRespResetPass] = useState('');
  const [respResetMsg, setRespResetMsg] = useState('');
  const [respResetting, setRespResetting] = useState(false);
  // Justificativas
  type JustificativaAdmin = { id: string; student_id: string; student_name: string; nucleo: string; data_falta: string; motivo: string; status: 'pendente' | 'aprovado' | 'recusado'; resposta_mestre?: string; created_at: string; updated_at: string; };
  const [justificativas, setJustificativas] = useState<JustificativaAdmin[]>([]);
  const [loadingJustificativas, setLoadingJustificativas] = useState(false);
  const [justRespostaMap, setJustRespostaMap] = useState<Record<string, string>>({});
  const [justMsg, setJustMsg] = useState('');
  // Contas de alunos
  type AlunoAccount = { student_id: string; username: string; email?: string; active: boolean; phone?: string; created_at: string; last_login?: string; display_id?: string; };
  const [alunoContas, setAlunoContas] = useState<AlunoAccount[]>([]);
  const [loadingContas, setLoadingContas] = useState(false);
  const [contasMsg, setContasMsg] = useState('');
  const [novaContaForm, setNovaContaForm] = useState({ student_id: '', password: '', confirm_password: '', email: '' });
  const [resetPassForm, setResetPassForm] = useState({ student_id: '', new_password: '', confirm_new_password: '' });
  const [studentDisplayIds, setStudentDisplayIds] = useState<Record<string, string>>({});
  // Auditoria
  type AuditEntry = { id: string; action: string; user: string; nucleo: string; timestamp: string; details?: string };
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  // Lixeira
  const [lixeira, setLixeira] = useState<Array<{ id: string; deleted_at: string; deleted_by: string; student: Record<string, unknown>; extras?: Record<string, string> }>>([]);
  const [loadingLixeira, setLoadingLixeira] = useState(false);
  const [lixeiraSearch, setLixeiraSearch] = useState('');
  const [lixeiraEditing, setLixeiraEditing] = useState<string | null>(null);
  const [lixeiraEditForm, setLixeiraEditForm] = useState<Record<string, unknown>>({});
  const [lixeiraEditExtras, setLixeiraEditExtras] = useState<Record<string, string>>({});
  const [lixeiraMsg, setLixeiraMsg] = useState('');
  const [relatorioHistorico, setRelatorioHistorico] = useState<Record<string, string[]>>({});
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [relDias, setRelDias] = useState(30);
  const [presencas, setPresencas] = useState<PresencaCount[]>([]);
  const [totalTreinos, setTotalTreinos] = useState(0);
  const [filterPresencaNucleo, setFilterPresencaNucleo] = useState('');
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [historico, setHistorico] = useState<Record<string, string[]>>({});
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [chartStudent, setChartStudent] = useState<Student | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<CheckinRecord | null>(null);
  const [removing, setRemoving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingCheckins, setLoadingCheckins] = useState(false);
  const [checkinsError, setCheckinsError] = useState<string | null>(null);
  const [termosEnviados, setTermosEnviados] = useState<Record<string, TermoEnviado>>({});
  const [presencaDate, setPresencaDate] = useState(hoje());
  const [undoStack, setUndoStack] = useState<CheckinRecord[]>([]);
  const [undoVisible, setUndoVisible] = useState(false);
  const [showGpsMap, setShowGpsMap] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const [showCarteirinha, setShowCarteirinha] = useState(false);
  const [adminMatriculaNum, setAdminMatriculaNum] = useState<number | null>(null);
  const adminCardRef = useRef<HTMLDivElement>(null);

  // ── Histórico de Graduações ────────────────────────────────────────────────
  const [showHistGrad, setShowHistGrad] = useState(false);
  const [histGradRecords, setHistGradRecords] = useState<RegistroGraduacao[]>([]);
  const [histGradLoading, setHistGradLoading] = useState(false);
  const [histGradSaving, setHistGradSaving] = useState(false);
  const [histGradMsg, setHistGradMsg] = useState('');
  const [histGradEditing, setHistGradEditing] = useState<RegistroGraduacao | null>(null);
  const [histGradForm, setHistGradForm] = useState(EMPTY_GRAD_FORM);
  const certRef = useRef<HTMLDivElement>(null);

  // ── Certificado state ─────────────────────────────────────────────────────
  const [certStudent, setCertStudent] = useState<Student | null>(null);
  const [certGraduacao, setCertGraduacao] = useState('');
  const [certEvento, setCertEvento] = useState('');
  const [certLocal, setCertLocal] = useState('');
  const [certData, setCertData] = useState(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  });
  const [certSearch, setCertSearch] = useState('');
  const [certFilteredStudents, setCertFilteredStudents] = useState<Student[]>([]);
  const [certTemplateUrl, setCertTemplateUrl] = useState<string | null>(null);
  const [certTemplateName, setCertTemplateName] = useState<string | null>(null);
  const certTemplateInputRef = useRef<HTMLInputElement>(null);

  // ── Offline sync validation state ──────────────────────────────────────────
  const OFFLINE_QUEUE_KEY = 'accbm_offline_checkins';
  const [offlinePending, setOfflinePending] = useState<Array<{ student: { id: string; nome_completo: string; graduacao: string; nucleo: string | null; foto_url: string | null }; date: string; hora: string; localNome: string | null }>>([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [syncOfflineResult, setSyncOfflineResult] = useState<{ ok: number; fail: number } | null>(null);
  const [rankingNucleoTab, setRankingNucleoTab] = useState<'todos' | 'edson-alves' | 'ipiranga' | 'saracuruna' | 'vila-urussai' | 'jayme-fichman'>('todos');
  const [showBirthdayAlert, setShowBirthdayAlert] = useState(true);

  // ── Financeiro admin state ────────────────────────────────────────────────
  const [finAlerts, setFinAlerts] = useState<Array<{ student_id: string; nome_completo: string; nucleo: string; updated_at?: string; comprovante_pendente: boolean; uniforme_solicitado: boolean; mensalidade_atrasada: boolean; batizado_modalidade_escolhida?: boolean; mensalidade_registrada?: boolean; contribuicao_registrada?: boolean; pagamento_registrado?: boolean; ultimas_acoes?: string[] }>>([]);
  const [finLoadingAlerts, setFinLoadingAlerts] = useState(false);
  const [finStudent, setFinStudent] = useState<Student | null>(null);
  const [finFicha, setFinFicha] = useState<any>(null);
  const [finSearch, setFinSearch] = useState('');
  const [finLoading, setFinLoading] = useState(false);
  const [finSaving, setFinSaving] = useState(false);
  const [finMsg, setFinMsg] = useState('');
  const [finSection, setFinSection] = useState<'batizado' | 'mensalidades' | 'contribuicao' | 'uniformes'>('batizado');

  // ── Doações state ─────────────────────────────────────────────────────────
  const [doacoes, setDoacoes] = useState<any[]>([]);
  const [loadingDoacoes, setLoadingDoacoes] = useState(false);
  const [doacaoForm, setDoacaoForm] = useState<any>({});
  const [doacaoEditId, setDoacaoEditId] = useState<string | null>(null);
  const [showDoacaoForm, setShowDoacaoForm] = useState(false);

  // ── Editais state ─────────────────────────────────────────────────────────
  const [editais, setEditais] = useState<any[]>([]);
  const [loadingEditais, setLoadingEditais] = useState(false);
  const [editalForm, setEditalForm] = useState<any>({});
  const [editalEditId, setEditalEditId] = useState<string | null>(null);
  const [showEditalForm, setShowEditalForm] = useState(false);

  // ── Config financeiro ────────────────────────────────────────────────────
  const [finConfig, setFinConfig] = useState<{ mensalidade_valor: number; batizado_integral: number; batizado_parcela1: number; batizado_parcela2: number; batizado_parcela3: number; contribuicao_mensal: number }>({ mensalidade_valor: 80, batizado_integral: 150, batizado_parcela1: 60, batizado_parcela2: 50, batizado_parcela3: 40, contribuicao_mensal: 30 });
  const [finConfigSaving, setFinConfigSaving] = useState(false);
  const [finConfigMsg, setFinConfigMsg] = useState('');
  const [showFinConfig, setShowFinConfig] = useState(false);

  // ── Materiais state ────────────────────────────────────────────────────────
  const [materiais, setMateriais] = useState<any[]>([]);
  const [loadingMateriais, setLoadingMateriais] = useState(false);
  const [materialForm, setMaterialForm] = useState<any>({});
  const [materialEditId, setMaterialEditId] = useState<string | null>(null);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [filterMatNucleo, setFilterMatNucleo] = useState('');

  // ── Patrimônio state ───────────────────────────────────────────────────────
  const [patrimonio, setPatrimonio] = useState<any[]>([]);
  const [loadingPatrimonio, setLoadingPatrimonio] = useState(false);
  const [patrimonioForm, setPatrimonioForm] = useState<any>({});
  const [patrimonioEditId, setPatrimonioEditId] = useState<string | null>(null);
  const [showPatrimonioForm, setShowPatrimonioForm] = useState(false);
  const [filterPatNucleo, setFilterPatNucleo] = useState('');

  // ── Rascunhos state ───────────────────────────────────────────────────────
  const [rascunhos, setRascunhos] = useState<any[]>([]);
  const [loadingRascunhos, setLoadingRascunhos] = useState(false);
  const [rascunhoExpanded, setRascunhoExpanded] = useState<string | null>(null);
  const [rascunhosCount, setRascunhosCount] = useState(0);
  const [showDadosFaltantes, setShowDadosFaltantes] = useState(false);
  const [rascunhoEditId, setRascunhoEditId] = useState<string | null>(null);
  const [rascunhoEditForm, setRascunhoEditForm] = useState<any>({});
  const [rascunhoSaving, setRascunhoSaving] = useState(false);
  const [rascunhoFotoFile, setRascunhoFotoFile] = useState<File | null>(null);
  const rascunhoFotoRef = useRef<HTMLInputElement>(null);
  const [showRascunhoNew, setShowRascunhoNew] = useState(false);
  const [newRascunhoForm, setNewRascunhoForm] = useState<any>({});

  // ── Manual do Administrador state ─────────────────────────────────────────
  const [manuais, setManuais] = useState<Array<{ name: string; size: number; created_at: string; url: string | null }>>([]);
  const [loadingManuais, setLoadingManuais] = useState(false);
  const [uploadingManual, setUploadingManual] = useState(false);
  const [manualMsg, setManualMsg] = useState('');
  const manualFileRef = useRef<HTMLInputElement>(null);
  // Translations state
  const [translatingManual, setTranslatingManual] = useState<string | null>(null);
  const [manualTranslations, setManualTranslations] = useState<Record<string, Record<string, string>>>({});
  const [manualViewLang, setManualViewLang] = useState<Record<string, string>>({});
  const [manualViewOpen, setManualViewOpen] = useState<string | null>(null);
  const MANUAL_LANGS: { code: string; flag: string; label: string }[] = [
    { code: 'pt',    flag: '🇧🇷', label: 'Português (BR)' },
    { code: 'pt-PT', flag: '🇵🇹', label: 'Português (PT)' },
    { code: 'en',    flag: '🇺🇸', label: 'English' },
    { code: 'es',    flag: '🇪🇸', label: 'Español' },
    { code: 'fr',    flag: '🇫🇷', label: 'Français' },
    { code: 'it',    flag: '🇮🇹', label: 'Italiano' },
    { code: 'sv',    flag: '🇸🇪', label: 'Svenska' },
    { code: 'af',    flag: '🇿🇦', label: 'Afrikaans' },
    { code: 'nl',    flag: '🇳🇱', label: 'Nederlands' },
    { code: 'ja',    flag: '🇯🇵', label: '日本語' },
    { code: 'ko',    flag: '🇰🇷', label: '한국어' },
    { code: 'zh',    flag: '🇨🇳', label: '中文' },
    { code: 'de',    flag: '🇩🇪', label: 'Deutsch' },
  ];

  // ── DB maintenance state (Admin Geral only) ───────────────────────────────

  // ── Eventos state ──────────────────────────────────────────────────────────
  const [eventos, setEventos] = useState<any[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(false);
  const [eventoForm, setEventoForm] = useState<any>({ tipo: 'batizado', nome: '', data: '', hora: '', local: '', nucleo: '', participantes: [] });
  const [eventoEditId, setEventoEditId] = useState<string | null>(null);
  const [showEventoForm, setShowEventoForm] = useState(false);
  const [eventoMsg, setEventoMsg] = useState('');
  const [eventoSaving, setEventoSaving] = useState(false);
  const [eventoParticipantSearch, setEventoParticipantSearch] = useState('');
  const [eventoParticipantStaging, setEventoParticipantStaging] = useState<any | null>(null);
  const [eventoFinalizing, setEventoFinalizing] = useState<string | null>(null);

  // ── Responsáveis por núcleo ───────────────────────────────────────────────
  const [responsaveis, setResponsaveis] = useState<Array<{ nucleo_key: string; nucleo_label: string; nome: string; cpf: string }>>([]);
  const [loadingResponsaveis, setLoadingResponsaveis] = useState(false);
  const [responsaveisMsg, setResponsaveisMsg] = useState('');
  const [responsaveisSavedMsg, setResponsaveisSavedMsg] = useState<Record<string, string>>({});
  const [responsaveisUnlocked, setResponsaveisUnlocked] = useState(false);
  const [responsaveisLockCpf, setResponsaveisLockCpf] = useState('');
  const [responsaveisLockError, setResponsaveisLockError] = useState('');
  const [devLockLoading, setDevLockLoading] = useState(false);

  // ── Relatório de Alunos ────────────────────────────────────────────────────
  const [relAlunosOpen, setRelAlunosOpen] = useState(false);
  const [relAlunosNucleo, setRelAlunosNucleo] = useState('');
  const [relAlunosMes, setRelAlunosMes] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  });
  interface RelAlunoItem { id: string; nome: string; graduacao: string; dias: number; email?: string; telefone?: string; custom?: boolean; }
  const [relAlunosList, setRelAlunosList] = useState<RelAlunoItem[]>([]);
  const [relAlunosEdit, setRelAlunosEdit] = useState<string|null>(null);
  const [relAlunosEditVal, setRelAlunosEditVal] = useState<{nome:string;graduacao:string;dias:number}>({nome:'',graduacao:'',dias:0});
  const [relAlunosNewNome, setRelAlunosNewNome] = useState('');
  const [relAlunosNewGrad, setRelAlunosNewGrad] = useState('');
  const [relAlunosNewDias, setRelAlunosNewDias] = useState('');

  // ── Gráfico individual por aluno ──────────────────────────────────────────
  const [indivChartOpen, setIndivChartOpen] = useState(false);
  const [indivSearch, setIndivSearch] = useState('');
  const [indivStudent, setIndivStudent] = useState<Student | null>(null);
  const [indivHistorico, setIndivHistorico] = useState<string[]>([]);
  const [indivLoading, setIndivLoading] = useState(false);

  const printAdminCard = async (nome: string) => {
    const el = adminCardRef.current;
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
    const pw = window.open('', '_blank');
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Credencial — ${nome}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size: A6 landscape; margin: 4mm; }
      html,body { width:100%; height:100%; background:#fff; display:flex; justify-content:center; align-items:center; }
      img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
      @media print { html,body { margin:0; padding:0; } }
    </style>
    </head><body><img src="${imgData}" /><script>window.onload=()=>{window.print();setTimeout(()=>pw.close(),2000);}<\/script></body></html>`);
    pw.document.close();
  };

  useEffect(() => {
    fetchStudents();
    fetchPresencas();
    // Load offline queue for admin validation
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (raw) setOfflinePending(JSON.parse(raw));
    } catch {}
    // Load financial alerts on mount so badge counts are always visible
    fetch('/api/financeiro/alertas').then(r => r.json()).then(d => { setFinAlerts(d); }).catch(() => {});
    // Pre-load responsáveis config for geral admin to prevent accidental empty saves
    fetch('/api/admin/responsaveis').then(r => r.json()).then(cfg => { setResponsaveis(cfg.responsaveis || []); }).catch(() => {});
    // Pre-load rascunhos count for badge
    fetch('/api/rascunhos').then(r => r.json()).then((d: any[]) => { setRascunhosCount(d.length); setRascunhos(d); }).catch(() => {});
    // Pre-load eventos on mount so they're ready immediately
    fetch('/api/eventos').then(r => r.json()).then(d => { setEventos(Array.isArray(d) ? d : []); }).catch(() => {});
  }, []);

  // Reload eventos whenever the eventos tab becomes active
  useEffect(() => {
    if (activeTab !== 'eventos') return;
    fetch('/api/eventos')
      .then(r => r.json())
      .then(d => { setEventos(Array.isArray(d) ? d : []); setLoadingEventos(false); })
      .catch(() => setLoadingEventos(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Auto-refresh presencas every 30s when GPS map is visible
  useEffect(() => {
    if (!showGpsMap) return;
    const timer = setInterval(() => fetchPresencas(false), 30000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGpsMap]);

  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const list = data as Student[];
      // Compute virtual ordem_inscricao for students missing it (sort by created_at asc → index+1)
      const sortedAsc = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let listWithNum = list.map(s => ({
        ...s,
        ordem_inscricao: s.ordem_inscricao ?? (sortedAsc.findIndex(x => x.id === s.id) + 1),
      }));
      // Mescla extras (apelido, nome_social, sexo) do Storage — Storage é a fonte de verdade
      // pois as colunas podem não existir no banco de dados
      try {
        const extRes = await fetch('/api/student-extras');
        if (extRes.ok) {
          const extMap: Record<string, { apelido?: string; nome_social?: string; sexo?: string }> = await extRes.json();
          listWithNum = listWithNum.map(s => {
            const ext = extMap[s.id];
            if (!ext) return s;
            return {
              ...s,
              apelido:     ext.apelido     || s.apelido     || null,
              nome_social: ext.nome_social || s.nome_social || null,
              sexo:        ext.sexo        || s.sexo        || null,
            };
          });
        }
      } catch { /* extras são opcionais */ }
      // Mescla email das contas de acesso — fallback para alunos sem email no banco
      try {
        const contasRes = await fetch('/api/aluno/contas');
        if (contasRes.ok) {
          const contasData: AlunoAccount[] = await contasRes.json();
          const contaEmailMap: Record<string, string> = {};
          contasData.forEach(a => { if (a.email) contaEmailMap[a.student_id] = a.email; });
          setAlunoContas(Array.isArray(contasData) ? contasData : []);
          listWithNum = listWithNum.map(s => ({
            ...s,
            email: s.email || contaEmailMap[s.id] || null,
          }));
        }
      } catch { /* contas são opcionais */ }
      setStudents(listWithNum);
      // Load display IDs (ACCBM-XXXX) for all students
      fetch('/api/aluno/gerar-id').then(r => r.json()).then(d => {
        if (d && typeof d === 'object') setStudentDisplayIds(d as Record<string, string>);
      }).catch(() => {});
      // Carrega registros de termos enviados para alunos menores
      const menoresIds = list.filter(s => s.menor_de_idade).map(s => s.id);
      if (menoresIds.length) {
        carregarTermosEnviados(menoresIds).then(setTermosEnviados);
      }
    }
    setLoading(false);
  };

  // Builds synthetic checkin records from the offline queue stored in localStorage
  const getOfflineCheckins = (date: string): CheckinRecord[] => {
    try {
      const raw = localStorage.getItem('accbm_offline_checkins');
      if (!raw) return [];
      const queue: Array<{
        student: { id: string; nome_completo: string; graduacao: string; nucleo: string | null; foto_url: string | null };
        date: string; hora: string;
        localNome: string | null; localEndereco: string | null; localMapUrl: string | null;
        lat: number | null; lng: number | null;
      }> = JSON.parse(raw);
      return queue
        .filter(q => q.date === date)
        .map(q => ({
          student_id:     q.student.id,
          nome_completo:  q.student.nome_completo,
          graduacao:      q.student.graduacao || '',
          nucleo:         q.student.nucleo || '',
          foto_url:       q.student.foto_url || null,
          telefone:       '',
          hora:           q.hora,
          timestamp:      new Date().toISOString(),
          local_nome:     q.localNome || null,
          local_endereco: q.localEndereco || null,
          local_map_url:  q.localMapUrl || null,
          lat:            q.lat ?? null,
          lng:            q.lng ?? null,
          _offline_pending: true,
        } as CheckinRecord & { _offline_pending: boolean }));
    } catch { return []; }
  };

  const fetchPresencas = async (showSpinner = false, dateOverride?: string) => {
    if (showSpinner) setRefreshing(true);
    setLoadingCheckins(true);
    setCheckinsError(null);
    const fetchDate = dateOverride || presencaDate;
    try {
      const res = await fetch(`/api/checkins?date=${fetchDate}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCheckinsError(body.error || `Erro HTTP ${res.status}`);
        // Still show offline pending records so admin can see them
        setCheckins(getOfflineCheckins(fetchDate));
      } else {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Merge server records with offline pending (avoid duplicates by student_id)
          const serverIds = new Set(data.map((r: CheckinRecord) => r.student_id));
          const offlinePending = getOfflineCheckins(fetchDate).filter(r => !serverIds.has(r.student_id));
          setCheckins([...data, ...offlinePending]);
        } else {
          setCheckinsError(data.error || 'Resposta inesperada da API');
          setCheckins(getOfflineCheckins(fetchDate));
        }
      }
    } catch (e: unknown) {
      // Network error — show offline pending records
      setCheckinsError(e instanceof Error ? e.message : 'Erro ao buscar presenças');
      setCheckins(getOfflineCheckins(fetchDate));
    } finally {
      setLoadingCheckins(false);
      if (showSpinner) setRefreshing(false);
    }
  };

  const fetchHistorico = async () => {
    setLoadingHistorico(true);
    const hist = await getHistorico(30);
    setHistorico(hist);
    setLoadingHistorico(false);
  };

  // Restrict students by login profile (nucleus-specific logins see only their own)
  const nucleoFilter = activeNucleo === 'edson-alves' ? 'Poliesportivo Edson Alves'
    : activeNucleo === 'ipiranga' ? 'Poliesportivo do Ipiranga'
    : activeNucleo === 'saracuruna' ? 'Saracuruna'
    : activeNucleo === 'vila-urussai' ? 'Vila Urussaí'
    : activeNucleo === 'jayme-fichman' ? 'Jayme Fichman'
    : null;
  const filtered = students.filter(s => {
    const matchSearch =
      s.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
      s.cpf.includes(search) ||
      (s.graduacao || '').toLowerCase().includes(search.toLowerCase());
    const matchNucleo = !filterNucleo || s.nucleo === filterNucleo;
    const matchProfile = !nucleoFilter || s.nucleo === nucleoFilter;
    const matchGraduacao = !filterGraduacao || s.graduacao === filterGraduacao;
    return matchSearch && matchNucleo && matchProfile && matchGraduacao;
  }).sort((a, b) => {
    if (sortOrder === 'nome-asc') return a.nome_completo.localeCompare(b.nome_completo, 'pt-BR');
    if (sortOrder === 'nome-desc') return b.nome_completo.localeCompare(a.nome_completo, 'pt-BR');
    if (sortOrder === 'grad-asc') return graduacoes.indexOf(a.graduacao) - graduacoes.indexOf(b.graduacao);
    if (sortOrder === 'grad-desc') return graduacoes.indexOf(b.graduacao) - graduacoes.indexOf(a.graduacao);
    if (sortOrder === 'data-asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortOrder === 'data-desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  // For stats, only count students visible to this profile
  const visibleStudents = nucleoFilter ? students.filter(s => s.nucleo === nucleoFilter) : students;
  const menores = visibleStudents.filter(s => s.menor_de_idade).length;

  const openEdit = (student: Student) => {
    setEditing(student);
    setEditForm({ ...student });
    setEditFotoFile(null);
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
    try {
      let foto_url = editForm.foto_url ?? null;

      // Upload new photo if selected
      if (editFotoFile) {
        const ext = editFotoFile.name.split('.').pop() || 'jpg';
        const path = `fotos/${editing.id}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, editFotoFile, { upsert: true });
        if (!upErr) {
          const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(path);
          foto_url = pubData.publicUrl;
        }
      }

      // Core fields — always present in DB
      const corePayload: Record<string, any> = {
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
        foto_url,
      };

      // Try to save with optional new columns first
      const fullPayload = {
        ...corePayload,
        apelido: (editForm as any).apelido || null,
        nome_social: (editForm as any).nome_social || null,
        sexo: (editForm as any).sexo || null,
        email: (editForm as any).email || null,
      };

      let { error } = await supabase
        .from('students')
        .update(fullPayload)
        .eq('id', editing.id);

      // If error is about missing columns, retry with core fields only
      if (error && (error.message.includes('column') || error.code === '42703')) {
        const retry = await supabase
          .from('students')
          .update(corePayload)
          .eq('id', editing.id);
        error = retry.error;
      }

      if (error) {
        alert('Erro ao salvar: ' + error.message);
      } else {
        // Persiste apelido/nome_social/sexo no Storage — AWAIT garante que os dados
        // estejam salvos antes do fetchStudents recarregar a lista
        try {
          await fetch('/api/student-extras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: editing.id,
              apelido:     (editForm as any).apelido     ?? '',
              nome_social: (editForm as any).nome_social ?? '',
              sexo:        (editForm as any).sexo        ?? '',
            }),
          });
        } catch { /* não bloqueia o salvamento */ }
        logAdminAction('edit_student', `id:${editing.id} nome:${editForm.nome_completo}`);
        setEditing(null);
        setEditFotoFile(null);
        await fetchStudents();
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    // Fetch extras before deleting so they can be saved in lixeira
    let extras: Record<string, string> = {};
    try {
      const extRes = await fetch(`/api/student-extras?id=${deleteConfirm.id}`);
      if (extRes.ok) extras = await extRes.json();
    } catch {}
    // Save to lixeira before deleting from DB
    try {
      await fetch('/api/lixeira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: deleteConfirm,
          deleted_by: activeNucleo || 'geral',
          extras,
        }),
      });
    } catch {}
    const { error } = await supabase.from('students').delete().eq('id', deleteConfirm.id);
    if (error) {
      alert('Erro ao excluir. Tente novamente.');
    } else {
      // Remove extras do Storage junto com o aluno
      fetch(`/api/student-extras?id=${deleteConfirm.id}`, { method: 'DELETE' }).catch(() => {});
      logAdminAction('delete_student', `id:${deleteConfirm.id} nome:${deleteConfirm.nome_completo}`);
      setDeleteConfirm(null);
      setSelected(null);
      fetchStudents();
    }
  };

  const fetchRelatorio = async (dias: number) => {
    setLoadingRelatorio(true);
    const hist = await getHistorico(dias);
    setRelatorioHistorico(hist);
    setLoadingRelatorio(false);
  };

  const syncAllOfflineNow = async () => {
    if (!offlinePending.length) return;
    setSyncingOffline(true);
    let ok = 0; let fail = 0;
    const remaining: typeof offlinePending = [];
    for (const item of offlinePending) {
      try {
        const res = await fetch('/api/checkins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student: item.student, date: item.date }),
        });
        if (res.ok) { ok++; } else { fail++; remaining.push(item); }
      } catch { fail++; remaining.push(item); }
    }
    setOfflinePending(remaining);
    try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining)); } catch {}
    setSyncingOffline(false);
    setSyncOfflineResult({ ok, fail });
    setTimeout(() => setSyncOfflineResult(null), 6000);
    if (ok > 0) fetchPresencas(false, offlinePending[0]?.date);
  };

  const confirmRemoveCheckin = async () => {
    if (!removeConfirm) return;
    setRemoving(true);
    const studentId = removeConfirm.student_id;
    const removedRecord = removeConfirm;
    try {
      await removeCheckin(presencaDate, studentId);
      await new Promise(r => setTimeout(r, 600));
      const fresh = await getCheckins(presencaDate);
      setCheckins(fresh);
      setRemoveConfirm(null);
      // push to undo stack
      setUndoStack(prev => [...prev, removedRecord]);
      setUndoVisible(true);
      setTimeout(() => setUndoVisible(false), 8000);
    } catch {
      alert('Erro ao remover presença. Tente novamente.');
    }
    setRemoving(false);
  };

  const handleUndoCheckin = async (record: CheckinRecord) => {
    try {
      const res = await fetch('/api/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: { id: record.student_id, ...record }, date: presencaDate }),
      });
      if (res.ok) {
        await new Promise(r => setTimeout(r, 600));
        const fresh = await getCheckins(presencaDate);
        setCheckins(fresh);
        setUndoStack(prev => prev.filter(r => r.student_id !== record.student_id));
      }
    } catch {}
  };

  // ── Change-creds modal (shared between login screen and panel) ──────────────
  const ChangeCrendsModal = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 16px', color: '#1e3a8a', fontWeight: 800, fontSize: '1rem' }}>Alterar Login e Senha</h3>
        {changeDone ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>✅ Credenciais salvas!</div>
        ) : (
          <form onSubmit={handleChangeCreds} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Profile selector */}
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>Perfil a alterar</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {getProfiles().map(p => (
                  <button key={p.nucleo} type="button" onClick={() => setEditingProfile(p.nucleo)}
                    style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: `2px solid ${editingProfile === p.nucleo ? p.color : '#e2e8f0'}`, background: editingProfile === p.nucleo ? p.color : '#f8fafc', color: editingProfile === p.nucleo ? '#fff' : '#64748b', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', transition: 'all .15s' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Novo usuário</label>
              <input value={newUser} onChange={e => setNewUser(e.target.value)} placeholder={`ex: ${editingProfile}`} autoFocus
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Nova senha (mín. 6 caracteres)</label>
              <div style={{ position: 'relative' }}>
                <input type={showNewPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••"
                  style={{ width: '100%', padding: '10px 38px 10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                <button type="button" onClick={() => setShowNewPass(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                  {showNewPass ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Confirmar nova senha</label>
              <input type="password" value={newPassConfirm} onChange={e => setNewPassConfirm(e.target.value)} placeholder="••••••••"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {changeError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>⚠ {changeError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => setShowChangeCreds(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#64748b' }}>Cancelar</button>
              <button type="submit" style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>Salvar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (!authed) {
    const profiles = getProfiles();
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e3a8a 50%,#0f172a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-accbm.png" alt="ACCBM" style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 10, borderRadius: '50%' }} />
          <div style={{ background: 'linear-gradient(90deg,#dc2626,#2563eb,#16a34a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.03em' }}>Sistema de Gestão de Alunos ACCBM</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', marginTop: 4 }}>Associação Cultural de Capoeira Barão de Mauá</div>
        </div>

        {/* Profile cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          {profiles.map(p => (
            <div key={p.nucleo} style={{ background: 'rgba(255,255,255,0.07)', border: `2px solid ${p.color}44`, borderRadius: 12, padding: '14px 20px', textAlign: 'center', minWidth: 110 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, margin: '0 auto 6px' }} />
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>{p.label}</div>
            </div>
          ))}
        </div>

        {/* Login form */}
        <div style={{ width: '100%', maxWidth: 360, background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', padding: '28px 24px' }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 5 }}>Usuário ou CPF</label>
              <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Usuário ou CPF do responsável" autoFocus
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: '0.95rem', outline: 'none', color: '#fff', background: 'rgba(255,255,255,0.1)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 5 }}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••••"
                  style={{ width: '100%', padding: '11px 40px 11px 14px', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: '0.95rem', outline: 'none', color: '#fff', background: 'rgba(255,255,255,0.1)', boxSizing: 'border-box' }} />
                <button type="button" onClick={() => setShowPass(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0 }}>
                  {showPass ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>
            {loginError && <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 8, padding: '8px 12px', color: '#fca5a5', fontSize: '0.82rem', fontWeight: 600 }}>⚠ {loginError}</div>}
            <button type="submit" style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', marginTop: 4 }}>Entrar</button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { setShowChangeCreds(true); setChangeError(''); setChangeDone(false); setEditingProfile('edson-alves'); }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
              Alterar login / senha
            </button>
          </div>
        </div>

        {showChangeCreds && <ChangeCrendsModal />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>

      <div className="container-wide">
        <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" className="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Voltar ao formulário
          </Link>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Botões de troca de núcleo — visível quando responsável gerencia mais de um */}
            {availableNucleos.length > 1 && availableNucleos.map(nk => {
              const prof = getProfiles().find(p => p.nucleo === nk);
              if (!prof) return null;
              const isActive = activeNucleo === nk;
              return (
                <button
                  key={nk}
                  onClick={() => {
                    setActiveNucleo(nk);
                    sessionStorage.setItem('admin_auth', nk);
                    setActiveTab('alunos');
                  }}
                  style={{
                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem',
                    background: isActive ? prof.color : `${prof.color}22`,
                    border: `1px solid ${prof.color}88`,
                    color: isActive ? '#fff' : prof.color,
                    transition: 'all 0.15s',
                  }}
                >
                  {isActive ? '✓ ' : ''}{prof.label}
                </button>
              );
            })}
            {/* Current profile badge — só mostra quando tem 1 núcleo */}
            {availableNucleos.length <= 1 && currentProfile && (
              <div style={{ padding: '4px 10px', borderRadius: 20, background: `${currentProfile.color}22`, border: `1px solid ${currentProfile.color}55`, color: currentProfile.color, fontSize: '0.75rem', fontWeight: 700 }}>
                {currentProfile.label}
              </div>
            )}
            <button
              onClick={() => { setShowChangeCreds(true); setChangeError(''); setChangeDone(false); setEditingProfile(activeNucleo || 'edson-alves'); setNewUser(''); setNewPass(''); setNewPassConfirm(''); }}
              style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.3)', color: '#1d4ed8', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Alterar senha
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('admin_auth'); sessionStorage.removeItem('admin_auth_nucleos'); setAuthed(false); setActiveNucleo(null); setAvailableNucleos([]); }}
              style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sair
            </button>
          </div>
          {showChangeCreds && <ChangeCrendsModal />}
        </div>

        <div className="admin-header">
          <div>
            <h1 style={{
              background: 'linear-gradient(90deg, #dc2626 0%, #2563eb 45%, #16a34a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontSize: '1.9rem',
              fontWeight: 900,
              letterSpacing: '0.03em',
              textShadow: 'none',
              filter: 'drop-shadow(0 2px 8px rgba(37,99,235,0.25))',
            }}>
              Sistema de Gestão de Alunos ACCBM
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
              Associação Cultural de Capoeira Barão de Mauá
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/presenca" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem' }}>
              ✓ Registrar Presença
            </Link>
            {activeNucleo === 'geral' && (
              <button
                onClick={() => {
                  setActiveTab('lixeira');
                  setLoadingLixeira(true);
                  fetch('/api/lixeira').then(r => r.json()).then(d => { setLixeira(Array.isArray(d) ? d : []); setLoadingLixeira(false); }).catch(() => setLoadingLixeira(false));
                }}
                style={{
                  background: activeTab === 'lixeira' ? 'linear-gradient(135deg,#374151,#1f2937)' : 'linear-gradient(135deg,#4b5563,#374151)',
                  color: '#d1d5db',
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: activeTab === 'lixeira' ? '1px solid #6b7280' : '1px solid transparent',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                🗑️ Cadastros Excluídos
                {lixeira.length > 0 && (
                  <span style={{ background: '#6b7280', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {lixeira.length}
                  </span>
                )}
              </button>
            )}
            {activeTab === 'alunos' && <>
              <input
                className="search-input"
                placeholder="Buscar por nome, CPF ou graduação..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="search-input"
                style={{ width: 210 }}
                value={filterNucleo}
                onChange={(e) => setFilterNucleo(e.target.value)}
              >
                <option value="">Todos os núcleos</option>
                <option value="Saracuruna">Núcleo Saracuruna</option>
                <option value="Poliesportivo Edson Alves">Núcleo Poliesportivo Edson Alves</option>
                <option value="Poliesportivo do Ipiranga">Núcleo Poliesportivo do Ipiranga</option>
                <option value="Vila Urussaí">Núcleo Vila Urussaí</option>
                <option value="Jayme Fichman">Núcleo Jayme Fichman</option>
              </select>
              <select
                className="search-input"
                style={{ width: 190 }}
                value={filterGraduacao}
                onChange={(e) => setFilterGraduacao(e.target.value)}
              >
                <option value="">Todas as graduações</option>
                <optgroup label="── Adulto ──">
                  {graduacoes.filter(g => !g.includes('ponta') && !['Cinza','Cinza e Amarela','Verde e Amarela','Amarela e Azul','Crua e Cinza','Crua e Laranja','Crua e Verde','Crua e Azul','Crua e Roxa'].includes(g)).map(g => (
                    <option key={g} value={g}>{g}{nomenclaturaGraduacao[g] ? ` — ${nomenclaturaGraduacao[g]}` : ''}</option>
                  ))}
                </optgroup>
                <optgroup label="── Infantil ──">
                  {graduacoes.filter(g => g.includes('ponta') || ['Cinza','Cinza e Amarela','Verde e Amarela','Amarela e Azul','Crua e Cinza','Crua e Laranja','Crua e Verde','Crua e Azul','Crua e Roxa'].includes(g)).map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </optgroup>
              </select>
              <select
                className="search-input"
                style={{ width: 195 }}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              >
                <option value="nome-asc">Nome A → Z</option>
                <option value="nome-desc">Nome Z → A</option>
                <option value="grad-asc">Graduação ↑ menor → maior</option>
                <option value="grad-desc">Graduação ↓ maior → menor</option>
                <option value="data-asc">Cadastro mais antigo</option>
                <option value="data-desc">Cadastro mais recente</option>
              </select>
            </>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 0, borderBottom: '2px solid var(--border)', flexWrap: 'wrap', overflowX: 'auto' }}>
          {([
            { key: 'alunos',       label: t('admin_students'),  activeColor: '#dc2626', geralOnly: false },
            { key: 'presencas',    label: t('admin_attendance'), activeColor: '#dc2626', geralOnly: false },
            { key: 'relatorio',    label: t('admin_report'),     activeColor: '#dc2626', geralOnly: false },
            { key: 'ranking',      label: t('admin_ranking'),    activeColor: '#dc2626', geralOnly: false },
            { key: 'certificado',  label: t('admin_certificate'),activeColor: '#dc2626', geralOnly: false },
            { key: 'financeiro',   label: `${t('admin_financial')}${finAlerts.filter(a => !nucleoFilter || a.nucleo === nucleoFilter).length > 0 ? ` 🔔${finAlerts.filter(a => !nucleoFilter || a.nucleo === nucleoFilter).length}` : ''}`, activeColor: '#16a34a', geralOnly: false },
            { key: 'doacoes',      label: t('admin_donations'),  activeColor: '#8b5cf6', geralOnly: true },
            { key: 'editais',      label: t('admin_notices'),    activeColor: '#0891b2', geralOnly: true },
            { key: 'materiais',    label: t('admin_materials'),  activeColor: '#ea580c', geralOnly: false },
            { key: 'patrimonio',   label: t('admin_patrimony'),  activeColor: '#ca8a04', geralOnly: false },
            { key: 'rascunhos',       label: `${t('admin_drafts')}${rascunhosCount > 0 ? ` 🔔${rascunhosCount}` : ''}`, activeColor: '#f59e0b', geralOnly: false },
            { key: 'dados-faltantes', label: `${t('admin_missing_data')}${(() => { const c = (nucleoFilter ? rascunhos.filter((r:any)=>(r.nucleo||'')===nucleoFilter) : rascunhos).filter((r:any)=>(r.dados_pendentes||[]).length>0).length; return c>0?` 🔔${c}`:''; })()}`, activeColor: '#dc2626', geralOnly: false },
            { key: 'manual',          label: t('admin_manual'),  activeColor: '#7c3aed', geralOnly: false },
            { key: 'eventos',         label: t('admin_events'),  activeColor: '#0ea5e9', geralOnly: false },
            { key: 'lixeira',         label: '🗑️ Lixeira',       activeColor: '#6b7280', geralOnly: true },
            { key: 'justificativas',  label: `📝 Justificativas${justificativas.filter(j => j.status === 'pendente' && (!nucleoFilter || j.nucleo === nucleoFilter)).length > 0 ? ` 🔔${justificativas.filter(j => j.status === 'pendente' && (!nucleoFilter || j.nucleo === nucleoFilter)).length}` : ''}`, activeColor: '#f59e0b', geralOnly: false },
            { key: 'contas',          label: '👤 Contas Alunos',  activeColor: '#6366f1', geralOnly: false },
            { key: 'auditoria',       label: '🔍 Auditoria',       activeColor: '#0f172a', geralOnly: true },
            { key: 'responsaveis',    label: '👥 Responsáveis',    activeColor: '#1d4ed8', geralOnly: true },
          ] as const).filter(tab => !tab.geralOnly || activeNucleo === 'geral').map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === 'presencas') fetchPresencas();
                if ((tab.key === 'relatorio' || tab.key === 'ranking') && Object.keys(relatorioHistorico).length === 0) fetchRelatorio(relDias);
                if (tab.key === 'relatorio') {
                  // Load contas + IDs for the accounts sub-report
                  Promise.all([
                    fetch('/api/aluno/contas').then(r => r.json()),
                    fetch('/api/aluno/gerar-id').then(r => r.json()),
                  ]).then(([contas, idMap]) => {
                    setAlunoContas(Array.isArray(contas) ? contas : []);
                    if (idMap && typeof idMap === 'object') setStudentDisplayIds(idMap as Record<string, string>);
                  }).catch(() => {});
                }
                if (tab.key === 'financeiro') {
                  setFinLoadingAlerts(true);
                  fetch('/api/financeiro/alertas').then(r => r.json()).then(d => { setFinAlerts(d); setFinLoadingAlerts(false); }).catch(() => setFinLoadingAlerts(false));
                  fetch('/api/financeiro/config').then(r => r.json()).then(d => { if (d) setFinConfig(d); }).catch(() => {});
                }
                if (tab.key === 'doacoes') {
                  setLoadingDoacoes(true);
                  fetch('/api/doacoes').then(r => r.json()).then(d => { setDoacoes(d); setLoadingDoacoes(false); }).catch(() => setLoadingDoacoes(false));
                }
                if (tab.key === 'editais') {
                  setLoadingEditais(true);
                  fetch('/api/editais').then(r => r.json()).then(d => { setEditais(d); setLoadingEditais(false); }).catch(() => setLoadingEditais(false));
                }
                if (tab.key === 'materiais') {
                  setLoadingMateriais(true);
                  fetch('/api/materiais').then(r => r.json()).then(d => { setMateriais(d); setLoadingMateriais(false); }).catch(() => setLoadingMateriais(false));
                }
                if (tab.key === 'patrimonio') {
                  setLoadingPatrimonio(true);
                  fetch('/api/patrimonio').then(r => r.json()).then(d => { setPatrimonio(d); setLoadingPatrimonio(false); }).catch(() => setLoadingPatrimonio(false));
                }
                if (tab.key === 'rascunhos') {
                  setLoadingRascunhos(true);
                  fetch('/api/rascunhos').then(r => r.json()).then(d => { setRascunhos(d); setRascunhosCount(d.length); setLoadingRascunhos(false); }).catch(() => setLoadingRascunhos(false));
                  setLoadingResponsaveis(true);
                  fetch('/api/admin/responsaveis').then(r => r.json()).then(cfg => { setResponsaveis(cfg.responsaveis || []); setLoadingResponsaveis(false); }).catch(() => setLoadingResponsaveis(false));
                }
                if (tab.key === 'dados-faltantes') {
                  setLoadingRascunhos(true);
                  fetch('/api/rascunhos').then(r => r.json()).then(d => { setRascunhos(d); setRascunhosCount(d.length); setLoadingRascunhos(false); }).catch(() => setLoadingRascunhos(false));
                }
                if (tab.key === 'manual') {
                  setLoadingManuais(true); setManualMsg('');
                  fetch('/api/admin/manual').then(r => r.json()).then(async d => {
                    const files = d.files || [];
                    setManuais(files);
                    // Load translations for each manual
                    await Promise.all(files.map(async (f: { name: string }) => {
                      try {
                        const tr = await fetch(`/api/admin/manual/translate?name=${encodeURIComponent(f.name)}`).then(r => r.json());
                        if (tr.translations) {
                          setManualTranslations(prev => ({ ...prev, [f.name]: tr.translations }));
                          setManualViewLang(prev => ({ ...prev, [f.name]: prev[f.name] || 'pt' }));
                        }
                      } catch {}
                    }));
                    setLoadingManuais(false);
                  }).catch(() => setLoadingManuais(false));
                }
                if (tab.key === 'lixeira') {
                  setLoadingLixeira(true); setLixeiraMsg('');
                  fetch('/api/lixeira').then(r => r.json()).then(d => { setLixeira(Array.isArray(d) ? d : []); setLoadingLixeira(false); }).catch(() => setLoadingLixeira(false));
                }
                if (tab.key === 'justificativas') {
                  setLoadingJustificativas(true); setJustMsg('');
                  const url = nucleoFilter ? `/api/aluno/justificativas?admin=true&nucleo=${encodeURIComponent(nucleoFilter)}` : '/api/aluno/justificativas?admin=true';
                  fetch(url).then(r => r.json()).then(d => { setJustificativas(Array.isArray(d) ? d : []); setLoadingJustificativas(false); }).catch(() => setLoadingJustificativas(false));
                }
                if (tab.key === 'contas') {
                  setLoadingContas(true); setContasMsg('');
                  Promise.all([
                    fetch('/api/aluno/contas').then(r => r.json()),
                    fetch('/api/aluno/gerar-id').then(r => r.json()),
                  ]).then(([contas, idMap]) => {
                    setAlunoContas(Array.isArray(contas) ? contas : []);
                    if (idMap && typeof idMap === 'object') setStudentDisplayIds(idMap as Record<string, string>);
                    setLoadingContas(false);
                  }).catch(() => setLoadingContas(false));
                }
                if (tab.key === 'auditoria') {
                  setLoadingAudit(true); setAuditSearch('');
                  fetch('/api/admin/logs').then(r => r.json()).then(d => { setAuditLogs(Array.isArray(d) ? d : []); setLoadingAudit(false); }).catch(() => setLoadingAudit(false));
                }
                if (tab.key === 'eventos') {
                  setLoadingEventos(true); setEventoMsg('');
                  // Load events directly — always reliable
                  fetch('/api/eventos')
                    .then(r => r.json())
                    .then(d => { setEventos(Array.isArray(d) ? d : []); setLoadingEventos(false); })
                    .catch(() => setLoadingEventos(false));
                  // Auto-finalize runs in background, doesn't block display
                  fetch('/api/eventos/auto-finalize')
                    .then(r => r.json())
                    .then(af => {
                      if (af.applied > 0) {
                        setEventoMsg(`✓ ${af.applied} evento(s) finalizado(s) automaticamente: ${af.events.join(', ')}`);
                        fetch('/api/eventos').then(r => r.json()).then(d => { setEventos(Array.isArray(d) ? d : []); });
                      }
                    })
                    .catch(() => {});
                }
              }}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? `2px solid ${tab.activeColor}` : '2px solid transparent',
                marginBottom: -2,
                color: activeTab === tab.key ? tab.activeColor : 'var(--text-secondary)',
                fontWeight: activeTab === tab.key ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Documentos ACCBM — after tabs (admin always unlocked) ────── */}
        <DocumentsBar
          adminAlwaysUnlocked
          students={students.map(s => ({ id: s.id, nome_completo: s.nome_completo, telefone: s.telefone, nucleo: s.nucleo, email: s.email }))}
        />

        {/* ── Alerta de Aniversariantes ── */}
        <style>{`
          @keyframes sirenSpin { 0%{transform:rotate(-15deg)} 50%{transform:rotate(15deg)} 100%{transform:rotate(-15deg)} }
          @keyframes sirenFlash { 0%,100%{opacity:1} 50%{opacity:0.35} }
          @keyframes sirenGlow {
            0%,100%{box-shadow:0 0 18px 6px rgba(220,38,38,0.55),0 0 0 0 rgba(59,130,246,0.2)}
            50%{box-shadow:0 0 18px 6px rgba(59,130,246,0.55),0 0 0 0 rgba(220,38,38,0.2)}
          }
          @keyframes birthdayPulse {
            0%,100%{border-color:rgba(220,38,38,0.7);background:linear-gradient(135deg,rgba(220,38,38,0.08),rgba(59,130,246,0.06))}
            50%{border-color:rgba(59,130,246,0.7);background:linear-gradient(135deg,rgba(59,130,246,0.08),rgba(220,38,38,0.06))}
          }
        `}</style>
        {showBirthdayAlert && (() => {
          const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          const todayMD = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
          const aniversariantes = students.filter(s => {
            if (!s.data_nascimento) return false;
            const parts = s.data_nascimento.split('-');
            if (parts.length < 3) return false;
            return `${parts[1]}-${parts[2]}` === todayMD;
          }).filter(s => !nucleoFilter || s.nucleo === nucleoFilter);
          if (!aniversariantes.length) return null;
          return (
            <div style={{ margin: '16px 0', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 16, border: '2px solid rgba(220,38,38,0.7)', animation: 'birthdayPulse 1.6s ease-in-out infinite', position: 'relative', overflow: 'hidden' }}>
              {/* Sirene animada */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {/* Sirene SVG */}
                <div style={{ animation: 'sirenGlow 1.6s ease-in-out infinite', borderRadius: '50%', padding: 4 }}>
                  <svg width="48" height="48" viewBox="0 0 64 64" style={{ animation: 'sirenSpin 0.8s ease-in-out infinite', display: 'block' }}>
                    {/* Base da sirene */}
                    <rect x="18" y="36" width="28" height="8" rx="4" fill="#1e40af"/>
                    <rect x="14" y="42" width="36" height="6" rx="3" fill="#1e3a8a"/>
                    {/* Cúpula */}
                    <ellipse cx="32" cy="34" rx="16" ry="10" fill="#1d4ed8"/>
                    <ellipse cx="32" cy="32" rx="14" ry="10" fill="#2563eb"/>
                    {/* Luzes alternando azul/vermelho */}
                    <circle cx="22" cy="30" r="7" fill="#dc2626" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite' }}/>
                    <circle cx="42" cy="30" r="7" fill="#3b82f6" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite', animationDelay: '0.4s' }}/>
                    {/* Reflexo */}
                    <ellipse cx="24" cy="27" rx="3" ry="2" fill="rgba(255,255,255,0.5)" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite' }}/>
                    <ellipse cx="44" cy="27" rx="3" ry="2" fill="rgba(255,255,255,0.5)" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite', animationDelay: '0.4s' }}/>
                    {/* Raios */}
                    <line x1="32" y1="4" x2="32" y2="12" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite' }}/>
                    <line x1="10" y1="14" x2="16" y2="20" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite', animationDelay: '0.2s' }}/>
                    <line x1="54" y1="14" x2="48" y2="20" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite', animationDelay: '0.4s' }}/>
                    <line x1="4" y1="32" x2="12" y2="32" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite', animationDelay: '0.1s' }}/>
                    <line x1="60" y1="32" x2="52" y2="32" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" style={{ animation: 'sirenFlash 0.8s ease-in-out infinite', animationDelay: '0.5s' }}/>
                  </svg>
                </div>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🎂</span>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#dc2626', animation: 'sirenFlash 0.8s ease-in-out infinite' }}>🚨</span>
                  <span style={{ background: 'linear-gradient(90deg,#dc2626,#1d4ed8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {aniversariantes.length === 1 ? 'ANIVERSARIANTE' : 'ANIVERSARIANTES'} DE HOJE!
                  </span>
                  <span style={{ color: '#3b82f6', animation: 'sirenFlash 0.8s ease-in-out infinite', animationDelay: '0.4s' }}>🚨</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {aniversariantes.map(s => {
                    const age = now.getFullYear() - parseInt(s.data_nascimento.split('-')[0]);
                    const phone = (s.telefone || '').replace(/\D/g, '');
                    const br = phone.startsWith('55') ? phone : `55${phone}`;
                    const msg = encodeURIComponent(`🎉✨ *Feliz Aniversário, ${s.nome_completo}!* ✨🎉\n\nEm nome de toda a família da *Associação Cultural de Capoeira Barão de Mauá*, celebramos com muita alegria mais um ano da sua jornada!\n\nQue este dia seja repleto de saúde, paz e muita ginga de vida. Que a energia do axé ilumine cada passo seu, dentro e fora do treino.\n\n🥋 Continue evoluindo — a capoeira transforma!\n\n_Com carinho e respeito,_\n_Mestre e família ACCBM_ 🌟\n\n*Axé!* 🤸‍♂️`);
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 10, padding: '8px 12px' }}>
                        {s.foto_url
                          ? <img src={s.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #dc2626' }} />
                          : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(220,38,38,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid #dc2626' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                            </div>
                        }
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{s.nome_completo}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>🎉 {age} anos · {s.nucleo || '—'}</div>
                        </div>
                        {phone.length >= 10 && (
                          <a href={`https://api.whatsapp.com/send?phone=${br}&text=${msg}`} target="_blank" rel="noopener noreferrer"
                            style={{ marginLeft: 4, background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.4)', color: '#16a34a', borderRadius: 7, padding: '5px 10px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            🎁 Parabéns
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <button onClick={() => setShowBirthdayAlert(false)} style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '4px 8px', borderRadius: 6, flexShrink: 0, fontWeight: 700 }}>×</button>
            </div>
          );
        })()}

        {activeTab === 'alunos' && (
          <div>
          <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-value">{visibleStudents.length}</div>
            <div className="stat-label">{nucleoFilter ? `Alunos — ${nucleoFilter}` : 'Total de Alunos'}</div>
          </div>
          {nucleoFilter ? (
            // Responsável de núcleo: mostra apenas dados do seu núcleo
            <>
            {(() => {
              const ncColor = activeNucleo === 'edson-alves' ? '#dc2626' : activeNucleo === 'ipiranga' ? '#ea580c' : activeNucleo === 'saracuruna' ? '#16a34a' : activeNucleo === 'vila-urussai' ? '#9333ea' : activeNucleo === 'jayme-fichman' ? '#0891b2' : '#1d4ed8';
              const ncLabel = activeNucleo === 'saracuruna' ? 'CIEP 318 — Saracuruna' : nucleoFilter;
              return (
                <div className="stat-card" style={{ borderTop: `3px solid ${ncColor}` }}>
                  <div className="stat-value" style={{ color: ncColor }}>📍</div>
                  <div className="stat-label" style={{ fontWeight: 700 }}>{ncLabel}</div>
                </div>
              );
            })()}
            <div className="stat-card">
              <div className="stat-value">{visibleStudents.filter(s => s.menor_de_idade).length}</div>
              <div className="stat-label">Menores de Idade</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{visibleStudents.filter(s => !s.menor_de_idade).length}</div>
              <div className="stat-label">Maiores de Idade</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{visibleStudents.filter(s => s.assinatura_responsavel).length}</div>
              <div className="stat-label">Termos Assinados</div>
            </div>
            </>
          ) : (
            // Admin geral: mostra todos os núcleos
            <>
            {([
              ['CIEP 318 — Saracuruna',       'Saracuruna',                 '#16a34a'],
              ['Poliesportivo Edson Alves',     'Poliesportivo Edson Alves',  '#dc2626'],
              ['Poliesportivo do Ipiranga',     'Poliesportivo do Ipiranga',  '#ea580c'],
              ['Vila Urussaí',                  'Vila Urussaí',               '#9333ea'],
              ['Jayme Fichman',                 'Jayme Fichman',              '#0891b2'],
            ] as const).map(([label, nucleo, color]) => (
              <div key={nucleo} className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
                <div className="stat-value">{students.filter(s => s.nucleo === nucleo).length}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
            <div className="stat-card">
              <div className="stat-value">{menores}</div>
              <div className="stat-label">Menores de Idade</div>
            </div>
            </>
          )}
        </div>

        {/* ── Botões de manutenção — somente Admin Geral ── */}

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
                  <th>ID ACCBM</th>
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
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#6366f1', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {studentDisplayIds[student.id] || <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${student.nucleo === 'Saracuruna' ? 'badge-saracuruna' : (student.nucleo === 'Poliesportivo Edson Alves' || student.nucleo === 'Mauá') ? 'badge-maua' : student.nucleo === 'Poliesportivo do Ipiranga' ? 'badge-ipiranga' : student.nucleo === 'Vila Urussaí' ? 'badge-vila-urussai' : student.nucleo === 'Jayme Fichman' ? 'badge-jayme-fichman' : ''}`}>
                          {student.nucleo || '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', width: 40, height: 10, borderRadius: 5, overflow: 'hidden' }}>
                              {colors.map((c, i) => (
                                <div key={i} style={{ flex: 1, background: c }} />
                              ))}
                            </div>
                            <span style={{ fontSize: '0.85rem' }}>{student.graduacao}</span>
                          </div>
                          {nomenclaturaGraduacao[student.graduacao] && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.2)', alignSelf: 'flex-start' }}>
                              {nomenclaturaGraduacao[student.graduacao]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className={`badge ${student.menor_de_idade ? 'badge-minor' : 'badge-adult'}`}>
                            {student.menor_de_idade ? 'Menor' : 'Adulto'}
                          </span>
                          {student.menor_de_idade && (() => {
                            const assinado = student.assinatura_responsavel;
                            const enviado = termosEnviados[student.id];
                            if (assinado) return (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(22,163,74,0.15)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.3)' }}>
                                ✅ Termo assinado
                              </span>
                            );
                            if (enviado) return (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.3)' }}
                                title={`Enviado em ${new Date(enviado.sent_at).toLocaleString('pt-BR')}`}>
                                📨 Enviado {enviado.sent_count > 1 ? `(${enviado.sent_count}×)` : ''} — aguardando assinatura
                              </span>
                            );
                            return null;
                          })()}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(student.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => { setSelected(student); setShowCarteirinha(false); setShowHistGrad(false); setHistGradRecords([]); setHistGradMsg(''); }}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--accent)', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            {t('admin_view')}
                          </button>
                          <button
                            onClick={() => openEdit(student)}
                            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            {t('admin_edit')}
                          </button>
                          <button
                            onClick={() => { setChartStudent(student); fetchHistorico(); }}
                            style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            📊
                          </button>
                          {student.menor_de_idade && !student.assinatura_responsavel && (
                            <button
                              onClick={async () => {
                                const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inscri-o-capoeira-bar-o-de-mau.vercel.app';
                                const url = `${base}/termo?id=${student.id}`;
                                const phone = (student.telefone || '').replace(/\D/g, '');
                                const br = phone.startsWith('55') ? phone : `55${phone}`;
                                const msg = encodeURIComponent(
`📋 *Termo de Autorização — Capoeira Barão de Mauá*

Olá! Para concluir a inscrição de *${student.nome_completo}*, pedimos que o responsável legal assine o Termo de Autorização pelo link abaixo:

🔗 ${url}

Basta acessar o link, preencher os dados e assinar eletronicamente.

_Associação Cultural de Capoeira Barão de Mauá_`
                                );
                                window.open(`https://api.whatsapp.com/send?phone=${br}&text=${msg}`, '_blank');
                                // Registra o envio e atualiza badge
                                const record = await registrarTermoEnviado(student.id);
                                setTermosEnviados(prev => ({ ...prev, [student.id]: record }));
                              }}
                              title="Enviar termo pelo WhatsApp"
                              style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.35)', color: '#25d366', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
                            >
                              📋
                            </button>
                          )}
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
                <div className="stat-label">Presentes {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
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
                <div className="stat-label">Ausentes {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length > 0
                    ? Math.round((checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length /
                        students.filter(s => !filterPresencaNucleo || s.nucleo === filterPresencaNucleo).length) * 100)
                    : 0}%
                </div>
                <div className="stat-label">Frequência {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
              </div>
            </div>

            {/* Filtro + data + botão */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="date"
                className="search-input"
                style={{ width: 170 }}
                value={presencaDate}
                max={hoje()}
                onChange={e => {
                  const d = e.target.value;
                  setPresencaDate(d);
                  fetchPresencas(false, d);
                }}
              />
              <select className="search-input" style={{ width: 220 }} value={filterPresencaNucleo} onChange={e => setFilterPresencaNucleo(e.target.value)}>
                <option value="">Todos os núcleos</option>
                <option value="Saracuruna">Núcleo Saracuruna</option>
                <option value="Poliesportivo Edson Alves">Núcleo Poliesportivo Edson Alves</option>
                <option value="Poliesportivo do Ipiranga">Núcleo Poliesportivo do Ipiranga</option>
                <option value="Vila Urussaí">Núcleo Vila Urussaí</option>
                <option value="Jayme Fichman">Núcleo Jayme Fichman</option>
              </select>
              <button
                onClick={() => fetchPresencas(true)}
                disabled={refreshing}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: refreshing ? '#16a34a' : 'var(--text-secondary)', padding: '8px 14px', borderRadius: 8, cursor: refreshing ? 'default' : 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
              >
                <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
                {refreshing ? 'Atualizando...' : 'Atualizar'}
              </button>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              <Link href="/presenca" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
                + Registrar Presença
              </Link>
              <button
                onClick={() => setShowGpsMap(v => !v)}
                style={{ background: showGpsMap ? 'linear-gradient(135deg,#0ea5e9,#0284c7)' : 'var(--bg-input)', border: showGpsMap ? 'none' : '1px solid var(--border)', color: showGpsMap ? '#fff' : 'var(--text-secondary)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                🗺 {showGpsMap ? 'Ocultar Mapa' : 'Ver Mapa GPS'}
              </button>
            </div>

            {/* GPS Map */}
            {showGpsMap && (
              <GpsMap
                checkins={checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo)}
                containerRef={mapContainerRef}
                leafletMapRef={leafletMapRef}
              />
            )}

            {/* Undo toast */}
            {undoVisible && undoStack.length > 0 && (
              <div style={{ background: 'rgba(30,30,40,0.97)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>
                  Presença de <strong>{undoStack[undoStack.length-1].nome_completo}</strong> removida.
                </span>
                <button
                  onClick={() => handleUndoCheckin(undoStack[undoStack.length-1])}
                  style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)', color: '#a78bfa', padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}
                >
                  ↩ Desfazer
                </button>
                <button
                  onClick={() => setUndoVisible(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', marginLeft: 'auto' }}
                >×</button>
              </div>
            )}

            {/* Lista de presentes */}
            {loadingCheckins ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                Carregando presenças...
              </div>
            ) : checkinsError ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#f87171', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Erro ao carregar presenças</div>
                <div style={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>{checkinsError}</div>
                <button onClick={() => fetchPresencas()} style={{ marginTop: 14, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>Tentar novamente</button>
              </div>
            ) : checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length > 0 ? (
              <div>
                <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  ✓ Presentes {presencaDate === hoje() ? 'Hoje' : new Date(presencaDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} ({checkins.filter(c => !filterPresencaNucleo || c.nucleo === filterPresencaNucleo).length})
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
                          {/* Location display — always show GPS link when coords exist */}
                          {c.local_nome ? (
                            <div style={{ marginTop: 4 }}>
                              <a
                                href={c.lat && c.lng ? `https://maps.google.com/?q=${c.lat},${c.lng}` : (c.local_map_url || '#')}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}
                              >
                                📍 {c.local_nome}
                                {c.local_endereco && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>— {c.local_endereco}</span>}
                              </a>
                              {c.lat && c.lng && (
                                <a
                                  href={`https://maps.google.com/?q=${c.lat},${c.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'block', fontSize: '0.68rem', color: '#0ea5e9', marginTop: 2, textDecoration: 'none' }}
                                >
                                  📡 GPS: {c.lat.toFixed(5)}, {c.lng.toFixed(5)} · Ver exato →
                                </a>
                              )}
                            </div>
                          ) : c.lat && c.lng ? (
                            <a
                              href={`https://maps.google.com/?q=${c.lat},${c.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.74rem', color: '#0ea5e9', textDecoration: 'none', fontWeight: 600 }}
                            >
                              📡 Ver GPS no mapa ({c.lat.toFixed(4)}, {c.lng.toFixed(4)}) →
                            </a>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              📍 GPS não disponível
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.82rem', color: (c as any)._offline_pending ? '#f59e0b' : '#16a34a', fontWeight: 700 }}>{c.hora}</div>
                          {(c as any)._offline_pending
                            ? <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700, background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '1px 5px', marginTop: 2 }}>⏳ Pendente sync</div>
                            : <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>check-in</div>
                          }
                        </div>
                        {!(c as any)._offline_pending && (
                        <button
                          onClick={() => setRemoveConfirm(c)}
                          title="Remover presença"
                          style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}
                        >
                          🗑
                        </button>
                        )}
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
      {/* ===== ABA RANKING ===== */}
      {activeTab === 'ranking' && (() => {
        // Se for responsável de núcleo, força o filtro do seu núcleo (ignora o tab selecionado)
        const effectiveRankingTab = nucleoFilter ? activeNucleo! : rankingNucleoTab;
        const rankNucleoLabel = effectiveRankingTab === 'edson-alves' ? 'Poliesportivo Edson Alves'
          : effectiveRankingTab === 'ipiranga' ? 'Poliesportivo do Ipiranga'
          : effectiveRankingTab === 'saracuruna' ? 'Saracuruna'
          : effectiveRankingTab === 'vila-urussai' ? 'Vila Urussaí'
          : effectiveRankingTab === 'jayme-fichman' ? 'Jayme Fichman'
          : null;
        const rankStudents = rankNucleoLabel ? students.filter(s => s.nucleo === rankNucleoLabel) : students;

        const rankData = rankStudents.map(s => {
          const dias = relatorioHistorico[s.id] || [];
          return { student: s, presencas: dias.length, pct: Math.round((dias.length / Math.max(relDias, 1)) * 100) };
        });
        const topPresentes = [...rankData].sort((a,b) => b.presencas - a.presencas).slice(0, 15);
        const topFaltas = [...rankData].sort((a,b) => a.presencas - b.presencas).slice(0, 15);
        const medalColors = ['#fbbf24','#94a3b8','#b45309'];
        const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;

        const RankItem = ({ item, i, mode }: { item: typeof rankData[0]; i: number; mode: 'presenca' | 'falta' }) => (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
            background: mode === 'presenca' && i < 3 ? ['rgba(251,191,36,0.1)','rgba(148,163,184,0.1)','rgba(180,83,9,0.08)'][i] : 'var(--bg-input)',
            border: `1px solid ${mode === 'presenca' && i < 3 ? ['rgba(251,191,36,0.35)','rgba(148,163,184,0.3)','rgba(180,83,9,0.25)'][i] : 'var(--border)'}`,
          }}>
            <div style={{ fontSize: mode === 'presenca' && i < 3 ? '1.3rem' : '0.85rem', fontWeight: 700, minWidth: 30, textAlign: 'center', color: mode === 'presenca' && i < 3 ? medalColors[i] : 'var(--text-secondary)' }}>
              {mode === 'presenca' ? medal(i) : `${i+1}º`}
            </div>
            {item.student.foto_url
              ? <img src={item.student.foto_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                </div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.student.nome_completo}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {item.student.graduacao}
                {rankingNucleoTab === 'todos' && (() => {
                  const nc = item.student.nucleo;
                  const ncColor = (nc === 'Poliesportivo Edson Alves' || nc === 'Mauá') ? '#dc2626' : nc === 'Poliesportivo do Ipiranga' ? '#ea580c' : nc === 'Saracuruna' ? '#16a34a' : nc === 'Vila Urussaí' ? '#9333ea' : nc === 'Jayme Fichman' ? '#0891b2' : '#64748b';
                  return <span style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.62rem', fontWeight: 700, background: `${ncColor}18`, color: ncColor }}>{nc || '—'}</span>;
                })()}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: mode === 'presenca' ? '#16a34a' : '#dc2626' }}>
                {mode === 'presenca' ? item.presencas : relDias - item.presencas}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{mode === 'presenca' ? `${item.pct}%` : `${item.presencas} pres.`}</div>
            </div>
          </div>
        );

        return (
          <div>
            {/* Offline pending alert */}
            {offlinePending.length > 0 && (
              <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.45)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem' }}>☁️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#b45309' }}>
                    {offlinePending.length} presença(s) offline pendentes de validação
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Registradas sem internet pelos alunos. Clique em "Validar e Sincronizar" para computar no painel.
                  </div>
                  {syncOfflineResult && (
                    <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 700, color: syncOfflineResult.fail === 0 ? '#16a34a' : '#b45309' }}>
                      {syncOfflineResult.fail === 0 ? `✅ ${syncOfflineResult.ok} sincronizada(s) com sucesso!` : `⚠ ${syncOfflineResult.ok} ok, ${syncOfflineResult.fail} falhou.`}
                    </div>
                  )}
                </div>
                <button onClick={syncAllOfflineNow} disabled={syncingOffline}
                  style={{ padding: '9px 16px', background: '#b45309', border: 'none', color: '#fff', borderRadius: 8, cursor: syncingOffline ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: syncingOffline ? 0.7 : 1 }}>
                  {syncingOffline ? '⏳ Sincronizando...' : '✓ Validar e Sincronizar'}
                </button>
              </div>
            )}

            {/* Controls row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Núcleo tabs — só admin geral pode trocar */}
              {!nucleoFilter && (
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 10, padding: 3, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {([
                  ['todos',          '🌐 Todos',                      '#1d4ed8'],
                  ['edson-alves',    '🔴 Edson Alves',                '#dc2626'],
                  ['ipiranga',       '🟠 Ipiranga',                   '#ea580c'],
                  ['saracuruna',     '🟢 CIEP 318 — Saracuruna',      '#16a34a'],
                  ['vila-urussai',   '🟣 Vila Urussaí',               '#9333ea'],
                  ['jayme-fichman',  '🔵 Jayme Fichman',              '#0891b2'],
                ] as const).map(([key, label, color]) => (
                  <button key={key} onClick={() => setRankingNucleoTab(key)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: rankingNucleoTab === key ? 700 : 500,
                      background: rankingNucleoTab === key ? color : 'transparent',
                      color: rankingNucleoTab === key ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              )}
              {/* Period */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Período:</span>
                {[7, 15, 30, 60].map(d => (
                  <button key={d} onClick={() => { setRelDias(d); fetchRelatorio(d); }}
                    style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: relDias === d ? 700 : 500,
                      background: relDias === d ? 'var(--accent)' : 'var(--bg-input)',
                      border: relDias === d ? 'none' : '1px solid var(--border)',
                      color: relDias === d ? '#fff' : 'var(--text-secondary)' }}
                  >{d}d</button>
                ))}
                <button onClick={() => fetchRelatorio(relDias)} disabled={loadingRelatorio}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: loadingRelatorio ? '#16a34a' : 'var(--text-secondary)', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
                  <span style={{ display: 'inline-block', animation: loadingRelatorio ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
                </button>
              </div>
            </div>

            {loadingRelatorio ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Carregando ranking...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#16a34a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🏆 Mais Presentes — {relDias} dias
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>({rankStudents.length} alunos)</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {topPresentes.map((item, i) => <RankItem key={item.student.id} item={item} i={i} mode="presenca" />)}
                    {topPresentes.length === 0 && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Sem dados.</div>}
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#dc2626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ⚠ Mais Faltas — {relDias} dias
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>({rankStudents.length} alunos)</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {topFaltas.map((item, i) => <RankItem key={item.student.id} item={item} i={i} mode="falta" />)}
                    {topFaltas.length === 0 && <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Sem dados.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== ABA CERTIFICADO ===== */}
      {activeTab === 'certificado' && (() => {
        const profiles = getProfiles();
        const currentProf = profiles.find(p => p.nucleo === activeNucleo);
        const sig = certStudent
          ? (certStudent.nucleo === 'Mauá'
            ? { nome: 'Mestre Márcio da Silva Frazão', cargo: 'Presidente — ACCBM', img: '/assinatura-frazao.png' }
            : { nome: 'Mestre Elionaldo Pontes de Lima', cargo: 'Vice-Presidente — ACCBM', img: '/assinatura-naldo.png' })
          : null;

        const printCertificado = async () => {
          const el = certRef.current;
          if (!el || !certStudent) return;
          const pw = window.open('', '_blank');
          if (!pw) return;
          // Embed template image as base64 if needed
          let templateStyle = '';
          if (certTemplateUrl && certTemplateName?.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            try {
              const resp = await fetch(certTemplateUrl);
              const blob = await resp.blob();
              const b64 = await new Promise<string>(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              templateStyle = `background: url('${b64}') center/cover no-repeat !important;`;
            } catch {}
          }
          pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificado — ${certStudent.nome_completo}</title>
            <style>* { margin:0; padding:0; box-sizing:border-box; } @page { size: A4 landscape; margin: 0; } html,body { width:100%; height:100%; background:#fff; display:flex; justify-content:center; align-items:center; font-family:Georgia,serif; } .cert-wrap { ${templateStyle} }</style>
            </head><body><div class="cert-wrap">${el.innerHTML}</div><script>window.onload=()=>{window.print();setTimeout(()=>pw.close(),1500);}<\/script></body></html>`);
          pw.document.close();
        };

        const sendCertWhatsApp = () => {
          if (!certStudent) return;
          const phone = (certStudent.telefone || '').replace(/\D/g, '');
          const br = phone.startsWith('55') ? phone : `55${phone}`;
          const dataFmt = certData ? new Date(certData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
          const msg = encodeURIComponent(`🎓 *Certificado — Capoeira Barão de Mauá*\n\nOlá, *${certStudent.nome_completo}*!\n\nParabéns pela sua graduação em *${certGraduacao || certStudent.graduacao}*!\n\n📅 Data: ${dataFmt}\n📍 Local: ${certLocal || 'ACCBM'}\n🎉 Evento: ${certEvento || 'Batizado / Troca de Cordas'}\n\n_Associação Cultural de Capoeira Barão de Mauá_\nAxé! 🤸`);
          window.open(`https://api.whatsapp.com/send?phone=${br}&text=${msg}`, '_blank');
        };

        const sendCertEmail = () => {
          if (!certStudent) return;
          const dataFmt = certData ? new Date(certData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
          const subject = encodeURIComponent(`Certificado — ${certGraduacao || certStudent.graduacao} — Capoeira Barão de Mauá`);
          const body = encodeURIComponent(`Certificado de Graduação — Capoeira Barão de Mauá\n\nAluno(a): ${certStudent.nome_completo}\nGraduação: ${certGraduacao || certStudent.graduacao}\nEvento: ${certEvento || 'Batizado / Troca de Cordas'}\nData: ${dataFmt}\nLocal: ${certLocal || 'ACCBM'}\n\nParabéns pelo desempenho!\nAssociação Cultural de Capoeira Barão de Mauá\nAxé!`);
          window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
        };

        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>

              {/* Left: form */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>1. Selecionar Aluno</h3>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <input
                    placeholder="Buscar aluno por nome..."
                    value={certSearch}
                    onChange={e => {
                      const q = e.target.value;
                      setCertSearch(q);
                      if (!q.trim()) { setCertFilteredStudents([]); return; }
                      const lower = q.toLowerCase();
                      setCertFilteredStudents(students.filter(s => s.nome_completo.toLowerCase().includes(lower) || s.cpf.includes(q)).slice(0, 6));
                    }}
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: '0.9rem', outline: 'none', background: 'var(--bg-input)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                  {certFilteredStudents.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                      {certFilteredStudents.map(s => (
                        <button key={s.id} onClick={() => {
                          setCertStudent(s);
                          setCertGraduacao(s.graduacao);
                          setCertSearch(s.nome_completo);
                          setCertFilteredStudents([]);
                        }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          {s.foto_url
                            ? <img src={s.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                              </div>
                          }
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s.nome_completo}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.graduacao} · {s.nucleo}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {certStudent && (
                  <div style={{ background: 'rgba(29,78,216,0.07)', border: '1px solid rgba(29,78,216,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {certStudent.foto_url
                      ? <img src={certStudent.foto_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                        </div>
                    }
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{certStudent.nome_completo}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{certStudent.nucleo}</div>
                    </div>
                  </div>
                )}

                {/* Template import section */}
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>2. Modelo de Certificado (Opcional)</h3>
                <div style={{ background: 'var(--bg-input)', border: '1.5px dashed var(--border)', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
                  <input ref={certTemplateInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = URL.createObjectURL(file);
                      setCertTemplateUrl(url);
                      setCertTemplateName(file.name);
                    }}
                  />
                  {certTemplateUrl ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: '1.2rem' }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{certTemplateName}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Modelo carregado — será usado como fundo do certificado</div>
                        </div>
                        <button onClick={() => { setCertTemplateUrl(null); setCertTemplateName(null); if (certTemplateInputRef.current) certTemplateInputRef.current.value = ''; }}
                          style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                          Remover
                        </button>
                      </div>
                      {certTemplateUrl.startsWith('blob:') && (certTemplateName?.match(/\.(jpg|jpeg|png|webp|gif)$/i)) && (
                        <img src={certTemplateUrl} alt="Template" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)' }} />
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 6 }}>📂</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Importar modelo de certificado</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 10 }}>Imagem (JPG, PNG) ou PDF — será usado como fundo</div>
                      <button onClick={() => certTemplateInputRef.current?.click()}
                        style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                        Escolher Arquivo
                      </button>
                    </div>
                  )}
                  {/* Download blank template button */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Não tem um modelo?</span>
                    <button onClick={() => {
                      // Generate and download a blank A4 certificate template as SVG/HTML
                      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 1122 794">
                        <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fffef5"/><stop offset="100%" stop-color="#fefce8"/></linearGradient></defs>
                        <rect width="1122" height="794" fill="url(#bg)"/>
                        <rect x="0" y="0" width="1122" height="8" fill="#dc2626"/>
                        <rect x="374" y="0" width="374" height="8" fill="#1d4ed8"/>
                        <rect x="748" y="0" width="374" height="8" fill="#16a34a"/>
                        <rect x="0" y="786" width="1122" height="8" fill="#16a34a"/>
                        <rect x="374" y="786" width="374" height="8" fill="#1d4ed8"/>
                        <rect x="748" y="786" width="374" height="8" fill="#dc2626"/>
                        <rect x="30" y="20" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="1042" y="20" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="30" y="724" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="1042" y="724" width="50" height="50" fill="none" stroke="#b45309" stroke-width="3"/>
                        <rect x="50" y="50" width="1022" height="694" fill="none" stroke="#d6cfc3" stroke-width="1" stroke-dasharray="4,4"/>
                        <text x="561" y="130" text-anchor="middle" font-family="Georgia" font-size="11" font-weight="bold" fill="#92400e" letter-spacing="3">ASSOCIAÇÃO CULTURAL DE CAPOEIRA BARÃO DE MAUÁ</text>
                        <line x1="200" y1="155" x2="922" y2="155" stroke="#b45309" stroke-width="1"/>
                        <text x="561" y="220" text-anchor="middle" font-family="Georgia" font-size="54" font-weight="bold" fill="#78350f" letter-spacing="6">CERTIFICADO</text>
                        <text x="561" y="260" text-anchor="middle" font-family="Georgia" font-size="14" fill="#92400e" letter-spacing="3">EVENTO / NOME DO EVENTO AQUI</text>
                        <line x1="200" y1="285" x2="922" y2="285" stroke="#b45309" stroke-width="1"/>
                        <text x="561" y="330" text-anchor="middle" font-family="Georgia" font-size="14" fill="#78350f">Certificamos que</text>
                        <text x="561" y="390" text-anchor="middle" font-family="Georgia" font-size="32" font-weight="bold" fill="#1a1a1a">NOME DO ALUNO</text>
                        <text x="561" y="440" text-anchor="middle" font-family="Georgia" font-size="13" fill="#78350f">concluiu com êxito a graduação em Capoeira, recebendo a</text>
                        <rect x="461" y="460" width="200" height="36" rx="6" fill="none" stroke="#b45309" stroke-width="1.5"/>
                        <text x="561" y="483" text-anchor="middle" font-family="Georgia" font-size="14" font-weight="bold" fill="#78350f">GRADUAÇÃO / CORDA</text>
                        <text x="561" y="540" text-anchor="middle" font-family="Georgia" font-size="12" fill="#92400e">LOCAL — DATA DO EVENTO</text>
                        <line x1="361" y1="660" x2="561" y2="660" stroke="#1e3a8a" stroke-width="1.5"/>
                        <text x="461" y="680" text-anchor="middle" font-family="Georgia" font-size="10" font-weight="bold" fill="#1e3a8a">ASSINATURA DO MESTRE</text>
                        <text x="461" y="694" text-anchor="middle" font-family="Georgia" font-size="9" fill="#3b82f6">Presidente / Vice-Presidente — ACCBM</text>
                      </svg>`;
                      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'modelo-certificado-ACCBM.svg';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Baixar modelo em branco
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>3. Detalhes do Certificado</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Graduação (editável)</label>
                    <select value={certGraduacao} onChange={e => setCertGraduacao(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}>
                      <option value="">— Selecionar graduação —</option>
                      {graduacoes.map(g => <option key={g} value={g}>{g}{nomenclaturaGraduacao[g] ? ` — ${nomenclaturaGraduacao[g]}` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Evento</label>
                    <input value={certEvento} onChange={e => setCertEvento(e.target.value)} placeholder="ex: Batizado e Troca de Cordas 2025"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Local</label>
                    <input value={certLocal} onChange={e => setCertLocal(e.target.value)} placeholder="ex: Poliesportivo Edson Alves, Mauá"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Data do Evento</label>
                    <input type="date" value={certData} onChange={e => setCertData(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {certStudent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                    <button onClick={printCertificado}
                      style={{ padding: '12px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      Imprimir / Salvar PDF
                    </button>
                    <button onClick={sendCertWhatsApp}
                      style={{ padding: '12px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Enviar via WhatsApp
                    </button>
                    <button onClick={sendCertEmail}
                      style={{ padding: '12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.4)', color: '#3b82f6', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      Enviar por E-mail
                    </button>
                  </div>
                )}
              </div>

              {/* Right: preview */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>4. Pré-visualização</h3>
                <div ref={certRef} style={{
                  background: certTemplateUrl && certTemplateName?.match(/\.(jpg|jpeg|png|webp|gif)$/i)
                    ? `url("${certTemplateUrl}") center/cover no-repeat`
                    : 'linear-gradient(145deg, #fffef5 0%, #fefce8 100%)',
                  border: '3px solid #b45309',
                  borderRadius: 8,
                  padding: '32px 28px',
                  fontFamily: 'Georgia, serif',
                  minHeight: 360,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Corner ornaments */}
                  {['top-left','top-right','bottom-left','bottom-right'].map(pos => (
                    <div key={pos} style={{
                      position: 'absolute',
                      [pos.includes('top') ? 'top' : 'bottom']: 8,
                      [pos.includes('left') ? 'left' : 'right']: 8,
                      width: 32, height: 32,
                      borderTop: pos.includes('top') ? '3px solid #b45309' : 'none',
                      borderBottom: pos.includes('bottom') ? '3px solid #b45309' : 'none',
                      borderLeft: pos.includes('left') ? '3px solid #b45309' : 'none',
                      borderRight: pos.includes('right') ? '3px solid #b45309' : 'none',
                    }} />
                  ))}
                  {/* Tricolor top stripe */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, display: 'flex' }}>
                    <div style={{ flex: 1, background: '#dc2626' }} />
                    <div style={{ flex: 1, background: '#1d4ed8' }} />
                    <div style={{ flex: 1, background: '#16a34a' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {/* Logo + org name */}
                    <img src="/logo-maua.png" alt="ACCBM" style={{ width: 52, height: 52, objectFit: 'contain', marginBottom: 4 }} />
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#92400e' }}>
                      Associação Cultural de Capoeira Barão de Mauá
                    </div>
                    <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#b45309,transparent)', margin: '10px 0' }} />
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#78350f', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                      Certificado
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#92400e', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
                      {certEvento || 'Batizado e Troca de Cordas'}
                    </div>
                    <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#b45309,transparent)', margin: '10px 0' }} />
                    <div style={{ fontSize: '0.62rem', color: '#78350f', marginBottom: 6 }}>Certificamos que</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1a1a1a', fontFamily: 'Georgia, serif', marginBottom: 6, minHeight: 28 }}>
                      {certStudent ? certStudent.nome_completo : <span style={{ color: '#d4b896', fontStyle: 'italic' }}>Nome do Aluno</span>}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#78350f', marginBottom: 4 }}>
                      concluiu com êxito a graduação em Capoeira, recebendo a
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.3)', borderRadius: 6, padding: '5px 14px', marginBottom: 6 }}>
                      {certGraduacao && (() => {
                        const colors = getCordaColors(certGraduacao);
                        return (
                          <div style={{ display: 'flex', width: 28, height: 6, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                            {colors.map((c: string, i: number) => <div key={i} style={{ flex: 1, background: c === '#FFFFFF' ? '#e5e7eb' : c }} />)}
                          </div>
                        );
                      })()}
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#78350f' }}>
                        {certGraduacao || <span style={{ color: '#d4b896', fontStyle: 'italic' }}>graduação</span>}
                      </span>
                      {certGraduacao && nomenclaturaGraduacao[certGraduacao] && (
                        <span style={{ fontSize: '0.62rem', color: '#92400e' }}>— {nomenclaturaGraduacao[certGraduacao]}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: '#92400e', marginBottom: 10 }}>
                      {certLocal || <span style={{ color: '#d4b896', fontStyle: 'italic' }}>Local do evento</span>}
                      {certData && <span> · {new Date(certData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                    </div>
                    {sig && (
                      <div style={{ marginTop: 8 }}>
                        <img src={sig.img} alt="Assinatura" style={{ height: 36, maxWidth: 120, objectFit: 'contain' }} />
                        <div style={{ fontSize: '0.54rem', fontWeight: 700, color: '#1e3a8a' }}>{sig.nome}</div>
                        <div style={{ fontSize: '0.48rem', color: '#3b82f6' }}>{sig.cargo}</div>
                      </div>
                    )}
                  </div>
                  {/* Bottom stripe */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, display: 'flex' }}>
                    <div style={{ flex: 1, background: '#16a34a' }} />
                    <div style={{ flex: 1, background: '#1d4ed8' }} />
                    <div style={{ flex: 1, background: '#dc2626' }} />
                  </div>
                </div>
                {!certStudent && (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 10 }}>
                    Selecione um aluno para ver a pré-visualização
                  </p>
                )}

                {/* Action buttons below preview */}
                {certStudent && (
                  <div style={{ marginTop: 16, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      Ações do Certificado
                    </div>
                    <button onClick={printCertificado}
                      style={{ padding: '13px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      🖨 Imprimir / Salvar PDF
                    </button>
                    <button onClick={sendCertWhatsApp}
                      style={{ padding: '13px', background: 'linear-gradient(135deg,#25d366,#128c7e)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 14px rgba(37,211,102,0.35)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Enviar via WhatsApp
                    </button>
                    <button onClick={sendCertEmail}
                      style={{ padding: '13px', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      Enviar por E-mail
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== ABA RELATÓRIO ===== */}
      {activeTab === 'relatorio' && (
        <div>
          {/* Controles */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Período:</span>
            {[7, 15, 30, 60].map(d => (
              <button
                key={d}
                onClick={() => { setRelDias(d); fetchRelatorio(d); }}
                style={{
                  padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: relDias === d ? 700 : 500,
                  background: relDias === d ? 'linear-gradient(135deg,var(--accent),#b0452a)' : 'var(--bg-input)',
                  border: relDias === d ? 'none' : '1px solid var(--border)',
                  color: relDias === d ? '#fff' : 'var(--text-secondary)',
                }}
              >{d} dias</button>
            ))}
            <button
              onClick={() => fetchRelatorio(relDias)}
              disabled={loadingRelatorio}
              style={{ marginLeft: 'auto', background: 'var(--bg-input)', border: '1px solid var(--border)', color: loadingRelatorio ? '#16a34a' : 'var(--text-secondary)', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ display: 'inline-block', animation: loadingRelatorio ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
              {loadingRelatorio ? 'Carregando...' : 'Atualizar'}
            </button>
            <button
              onClick={() => window.print()}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              🖨 Imprimir
            </button>
            <button
              onClick={() => { setIndivChartOpen(true); setIndivStudent(null); setIndivSearch(''); setIndivHistorico([]); }}
              style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-4"/></svg>
              Gráfico Individual
            </button>
            <button
              onClick={async () => {
                const mesAtual = relAlunosMes;
                const nucleo = nucleoFilter || relAlunosNucleo;
                const mesStudents = (nucleoFilter ? students.filter(s => s.nucleo === nucleoFilter) : students)
                  .filter(s => !nucleo || s.nucleo === nucleo);
                // Garante contas carregadas para fallback de email
                let contas = alunoContas;
                if (contas.length === 0) {
                  try { const r = await fetch('/api/aluno/contas'); contas = await r.json(); setAlunoContas(Array.isArray(contas) ? contas : []); } catch { contas = []; }
                }
                const contaEmail = (sid: string) => contas.find((a: AlunoAccount) => a.student_id === sid)?.email || '';
                const list: RelAlunoItem[] = mesStudents.map(s => {
                  const dias = (relatorioHistorico[s.id] || []).filter((d: string) => d.startsWith(mesAtual)).length;
                  return { id: s.id, nome: s.nome_completo || '—', graduacao: s.graduacao || '—', dias, email: s.email || contaEmail(s.id), telefone: s.telefone || '' };
                });
                list.sort((a,b) => b.dias - a.dias);
                setRelAlunosList(list);
                setRelAlunosNucleo(nucleo || '');
                setRelAlunosOpen(true);
              }}
              style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              Relatório de Alunos
            </button>
          </div>

          {loadingRelatorio ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Carregando relatório...</div>
          ) : (
            <div>

              {/* ── Gráfico Mensal de Presenças e Faltas ── */}
              {(() => {
                // Collect all unique dates from historico
                const allDates = new Set<string>();
                Object.values(relatorioHistorico).forEach(dias => dias.forEach(d => allDates.add(d)));

                // Group check-in counts by YYYY-MM
                const monthMap: Record<string, number> = {};
                allDates.forEach(d => {
                  const ym = d.slice(0, 7);
                  monthMap[ym] = (monthMap[ym] || 0) + 1;
                });

                // Also calculate per-student monthly presence for avg%
                const months = Object.keys(monthMap).sort();
                if (months.length === 0) return null;

                // Per month: how many students had ≥1 check-in (unique student-days / total students)
                const monthStudentCount: Record<string, Set<string>> = {};
                Object.entries(relatorioHistorico).forEach(([sid, dias]) => {
                  dias.forEach(d => {
                    const ym = d.slice(0, 7);
                    if (!monthStudentCount[ym]) monthStudentCount[ym] = new Set();
                    monthStudentCount[ym].add(sid);
                  });
                });

                // Days in each month actually recorded (unique training days)
                const monthTrainingDays: Record<string, Set<string>> = {};
                allDates.forEach(d => {
                  const ym = d.slice(0, 7);
                  if (!monthTrainingDays[ym]) monthTrainingDays[ym] = new Set();
                  monthTrainingDays[ym].add(d);
                });

                const total = students.length || 1;
                const maxBar = 260;
                const barW = Math.max(28, Math.min(60, Math.floor((maxBar - months.length * 6) / months.length)));

                const monthLabel = (ym: string) => {
                  const [y, m] = ym.split('-');
                  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                  return `${names[parseInt(m)-1]}/${y.slice(2)}`;
                };

                const printGrafico = () => {
                  const pw = window.open('', '_blank');
                  if (!pw) return;
                  const svgEl = document.getElementById('grafico-mensal-svg');
                  const svgHtml = svgEl ? svgEl.outerHTML : '';
                  const now = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));
                  const dateStr = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
                  pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório Mensal — ACCBM</title>
                    <style>*{margin:0;padding:0;box-sizing:border-box;} @page{size:A4 landscape;margin:15mm} body{font-family:Arial,sans-serif;padding:20px;} h1{font-size:16px;color:#1e3a8a;margin-bottom:4px;} .sub{font-size:11px;color:#64748b;margin-bottom:16px;} svg{width:100%;}</style>
                    </head><body>
                    <h1>📊 Relatório Mensal de Presenças — Capoeira Barão de Mauá</h1>
                    <div class="sub">Gerado em ${dateStr} · ${total} alunos · Período: últimos ${relDias} dias</div>
                    ${svgHtml}
                    <script>window.onload=()=>{window.print();setTimeout(()=>pw.close(),1500);}<\/script>
                    </body></html>`);
                  pw.document.close();
                };

                const svgH = 320;
                const svgW = Math.max(500, months.length * (barW + 10) + 120);
                const chartBottom = svgH - 60;
                const chartTop = 40;
                const chartH = chartBottom - chartTop;

                return (
                  <div style={{ marginBottom: 28, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>📊 Gráfico Mensal de Presenças e Faltas</div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', marginTop: 2 }}>Presenças registradas por mês · {total} alunos no total</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={printGrafico}
                          style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                          Imprimir
                        </button>
                      </div>
                    </div>

                    {/* Legenda */}
                    <div style={{ display: 'flex', gap: 18, padding: '10px 18px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: '#16a34a' }} /> Presenças
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: '#dc2626' }} /> Faltas
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: '#3b82f6' }} /> Alunos presentes (únicos)
                      </div>
                    </div>

                    {/* SVG Chart */}
                    <div style={{ overflowX: 'auto', padding: '0 8px' }}>
                      <svg id="grafico-mensal-svg" width={svgW} height={svgH} style={{ display: 'block', minWidth: '100%' }}>
                        {/* Grid lines */}
                        {[0, 25, 50, 75, 100].map(pct => {
                          const y = chartBottom - (pct / 100) * chartH;
                          return (
                            <g key={pct}>
                              <line x1={60} y1={y} x2={svgW - 20} y2={y} stroke="var(--border)" strokeDasharray="4,3" strokeWidth={0.8} />
                              <text x={54} y={y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize={10}>{pct}%</text>
                            </g>
                          );
                        })}

                        {/* Bars per month */}
                        {months.map((ym, i) => {
                          const x0 = 70 + i * (barW * 2 + 18);
                          const trainDays = monthTrainingDays[ym]?.size || 1;
                          const presentStudents = monthStudentCount[ym]?.size || 0;
                          // presence% = students with ≥1 check-in that month / total
                          const presencePct = Math.min(100, Math.round((presentStudents / total) * 100));
                          const absencePct = 100 - presencePct;
                          const presH = (presencePct / 100) * chartH;
                          const absH = (absencePct / 100) * chartH;

                          return (
                            <g key={ym}>
                              {/* Presence bar */}
                              <rect x={x0} y={chartBottom - presH} width={barW} height={presH}
                                fill="#16a34a" rx={4} opacity={0.9} />
                              <text x={x0 + barW / 2} y={chartBottom - presH - 4} textAnchor="middle"
                                fill="#16a34a" fontSize={10} fontWeight="700">{presencePct}%</text>

                              {/* Absence bar */}
                              <rect x={x0 + barW + 4} y={chartBottom - absH} width={barW} height={absH}
                                fill="#dc2626" rx={4} opacity={0.85} />
                              <text x={x0 + barW + 4 + barW / 2} y={chartBottom - absH - 4} textAnchor="middle"
                                fill="#dc2626" fontSize={10} fontWeight="700">{absencePct}%</text>

                              {/* Month label */}
                              <text x={x0 + barW + 2} y={chartBottom + 16} textAnchor="middle"
                                fill="var(--text-secondary)" fontSize={10} fontWeight="600">{monthLabel(ym)}</text>

                              {/* Training days badge */}
                              <text x={x0 + barW + 2} y={chartBottom + 28} textAnchor="middle"
                                fill="var(--text-secondary)" fontSize={9}>{trainDays} treino{trainDays !== 1 ? 's' : ''}</text>

                              {/* Unique present students */}
                              <text x={x0 + barW + 2} y={chartBottom + 40} textAnchor="middle"
                                fill="#3b82f6" fontSize={9} fontWeight="600">{presentStudents} aluno{presentStudents !== 1 ? 's' : ''}</text>
                            </g>
                          );
                        })}

                        {/* Axis */}
                        <line x1={60} y1={chartTop} x2={60} y2={chartBottom} stroke="var(--border)" strokeWidth={1} />
                        <line x1={60} y1={chartBottom} x2={svgW - 20} y2={chartBottom} stroke="var(--border)" strokeWidth={1} />
                      </svg>
                    </div>

                    {/* Monthly summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
                      {months.map(ym => {
                        const presentStudents = monthStudentCount[ym]?.size || 0;
                        const trainDays = monthTrainingDays[ym]?.size || 0;
                        const totalCheckins = monthMap[ym] || 0;
                        const presencePct = Math.round((presentStudents / total) * 100);
                        const cor = presencePct >= 75 ? '#16a34a' : presencePct >= 50 ? '#d97706' : '#dc2626';
                        return (
                          <div key={ym} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', borderTop: `3px solid ${cor}` }}>
                            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 4 }}>{monthLabel(ym)}</div>
                            <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>✓ {presentStudents} alunos presentes</div>
                            <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>✗ {total - presentStudents} ausentes</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>{totalCheckins} check-ins · {trainDays} treino{trainDays !== 1 ? 's' : ''}</div>
                            <div style={{ marginTop: 6, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${presencePct}%`, background: cor, borderRadius: 3, transition: 'width 0.4s' }} />
                            </div>
                            <div style={{ fontSize: '0.68rem', color: cor, fontWeight: 700, marginTop: 2 }}>{presencePct}% frequência</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Sumário */}
              <div className="admin-stats" style={{ marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="stat-value">{students.length}</div>
                  <div className="stat-label">Total de Alunos</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: '#16a34a' }}>
                    {students.filter(s => (relatorioHistorico[s.id] || []).length > 0).length}
                  </div>
                  <div className="stat-label">Com Presença</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: '#dc2626' }}>
                    {students.filter(s => (relatorioHistorico[s.id] || []).length === 0).length}
                  </div>
                  <div className="stat-label">Sem Presença</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {students.length > 0
                      ? Math.round((Object.values(relatorioHistorico).reduce((sum, d) => sum + d.length, 0) / (students.length * relDias)) * 100)
                      : 0}%
                  </div>
                  <div className="stat-label">Média Geral</div>
                </div>
              </div>

              {/* Tabela */}
              <div className="table-responsive">
                <table className="student-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Foto</th>
                      <th>Nome</th>
                      <th>Núcleo</th>
                      <th>Graduação</th>
                      <th style={{ textAlign: 'center' }}>Presenças</th>
                      <th style={{ textAlign: 'center' }}>Faltas</th>
                      <th style={{ minWidth: 120 }}>Frequência</th>
                      <th>Última Presença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...students]
                      .sort((a, b) => {
                        const pa = (relatorioHistorico[a.id] || []).length;
                        const pb = (relatorioHistorico[b.id] || []).length;
                        return pb - pa;
                      })
                      .map(student => {
                        const dias = relatorioHistorico[student.id] || [];
                        const presencas = dias.length;
                        const pct = Math.round((presencas / relDias) * 100);
                        const cor = pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
                        const ultimaPresenca = dias.sort().reverse()[0];
                        return (
                          <tr key={student.id}>
                            <td>
                              {student.foto_url
                                ? <img src={student.foto_url} alt="" className="student-avatar" />
                                : <div className="student-avatar" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                                  </div>
                              }
                            </td>
                            <td style={{ fontWeight: 600 }}>{student.nome_completo}</td>
                            <td>
                              <span className={`badge ${student.nucleo === 'Saracuruna' ? 'badge-saracuruna' : (student.nucleo === 'Poliesportivo Edson Alves' || student.nucleo === 'Mauá') ? 'badge-maua' : student.nucleo === 'Poliesportivo do Ipiranga' ? 'badge-ipiranga' : student.nucleo === 'Vila Urussaí' ? 'badge-vila-urussai' : student.nucleo === 'Jayme Fichman' ? 'badge-jayme-fichman' : ''}`}>
                                {student.nucleo || '—'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>{student.graduacao}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{presencas}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{relDias - presencas}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: 6, height: 8, overflow: 'hidden', border: '1px solid var(--border)', minWidth: 60 }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 6, transition: 'width 0.5s' }} />
                                </div>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: cor, minWidth: 36 }}>{pct}%</span>
                              </div>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                              {ultimaPresenca
                                ? new Date(ultimaPresenca + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Legenda */}
              <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#16a34a' }} /> ≥ 75% — Ótima frequência
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#d97706' }} /> 50–74% — Regular
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#dc2626' }} /> &lt; 50% — Baixa frequência
                </div>
              </div>
            </div>
          )}

          {/* ── Relatório de Contas de Acesso Cadastradas ── */}
          <div style={{ marginTop: 40, borderTop: '2px solid var(--border)', paddingTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 4, height: 26, background: 'linear-gradient(180deg,#6366f1,#4f46e5)', borderRadius: 2 }} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>👤 Contas de Acesso Cadastradas</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  {nucleoFilter ? `Exibindo contas do núcleo: ${nucleoFilter}` : 'Todos os núcleos'}
                </p>
              </div>
              <button
                onClick={() => {
                  setLoadingContas(true);
                  Promise.all([fetch('/api/aluno/contas').then(r => r.json()), fetch('/api/aluno/gerar-id').then(r => r.json())])
                    .then(([contas, idMap]) => { setAlunoContas(Array.isArray(contas) ? contas : []); if (idMap && typeof idMap === 'object') setStudentDisplayIds(idMap as Record<string, string>); setLoadingContas(false); })
                    .catch(() => setLoadingContas(false));
                }}
                style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Atualizar
              </button>
            </div>

            {loadingContas ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '30px 0', fontSize: '0.85rem' }}>Carregando contas...</div>
            ) : (() => {
              // Filter by nucleo
              const visibleStudentIds = new Set(
                (nucleoFilter ? students.filter(s => s.nucleo === nucleoFilter) : students).map(s => s.id)
              );
              const relContas = alunoContas.filter(acc =>
                activeNucleo === 'geral' ? true : visibleStudentIds.has(acc.student_id)
              );

              if (relContas.length === 0) return (
                <div style={{ textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>👤</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {nucleoFilter ? `Nenhuma conta cadastrada para ${nucleoFilter}.` : 'Nenhuma conta de acesso cadastrada ainda.'}
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    Crie contas na aba 👤 Contas Alunos.
                  </div>
                </div>
              );

              return (
                <div>
                  <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-input)' }}>
                          {['ID ACCBM', 'Nome Completo do Aluno', 'E-mail', 'Login', 'Núcleo', 'Status'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.76rem', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {relContas.map((acc, idx) => {
                          const st = students.find(s => s.id === acc.student_id);
                          const displayId = acc.display_id || studentDisplayIds[acc.student_id] || '—';
                          return (
                            <tr key={acc.student_id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.02)' }}>
                              <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 900, color: '#6366f1', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{displayId}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 700, minWidth: 160 }}>
                                {st?.nome_completo || <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>—</span>}
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                {acc.email ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    {acc.email}
                                  </span>
                                ) : <span style={{ color: '#d97706', fontSize: '0.74rem' }}>não cadastrado</span>}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 9px', fontFamily: 'monospace', fontWeight: 800, color: '#1d4ed8', fontSize: '0.8rem' }}>{acc.username}</span>
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{st?.nucleo || '—'}</td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: acc.active ? '#dcfce7' : '#fef9c3', color: acc.active ? '#166534' : '#854d0e' }}>
                                  {acc.active ? '✅ Ativa' : '⏳ Pendente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 10, fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', gap: 16 }}>
                    <span>Total: <strong>{relContas.length}</strong> conta{relContas.length !== 1 ? 's' : ''}</span>
                    <span>✅ Ativas: <strong>{relContas.filter(a => a.active).length}</strong></span>
                    <span>⏳ Pendentes: <strong>{relContas.filter(a => !a.active).length}</strong></span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===== ABA FINANCEIRO ===== */}
      {activeTab === 'financeiro' && (
        <div>
          {/* Alert strip */}
          {finLoadingAlerts ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Verificando alertas financeiros...</div>
          ) : finAlerts.filter(a => !nucleoFilter || a.nucleo === nucleoFilter).length > 0 && (
            <div style={{ marginBottom: 20, background: 'rgba(22,163,74,0.05)', border: '2px solid rgba(22,163,74,0.25)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg,rgba(22,163,74,0.2),rgba(8,145,178,0.15))', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem', animation: 'sirenFlash 1.2s ease-in-out infinite' }}>🔔</span>
                  Notificações Financeiras — {finAlerts.filter(a => !nucleoFilter || a.nucleo === nucleoFilter).length} aluno{finAlerts.filter(a => !nucleoFilter || a.nucleo === nucleoFilter).length !== 1 ? 's' : ''}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Ações realizadas pelos alunos aguardando revisão</span>
              </div>
              {/* Alert rows */}
              {finAlerts.filter(a => !nucleoFilter || a.nucleo === nucleoFilter).map(a => (
                <div key={a.student_id} style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{a.nome_completo}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '1px 7px', borderRadius: 10 }}>{a.nucleo}</span>
                    {a.updated_at && <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      {new Date(a.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>}
                  </div>
                  {/* Badge tags */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {a.comprovante_pendente && <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 20, padding: '2px 9px', color: '#fbbf24', fontSize: '0.7rem', fontWeight: 700 }}>📎 Comprovante enviado</span>}
                    {a.uniforme_solicitado && <span style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 20, padding: '2px 9px', color: '#93c5fd', fontSize: '0.7rem', fontWeight: 700 }}>👕 Uniforme solicitado</span>}
                    {a.mensalidade_atrasada && <span style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 20, padding: '2px 9px', color: '#f87171', fontSize: '0.7rem', fontWeight: 700 }}>⚠ Pagamento atrasado</span>}
                    {a.batizado_modalidade_escolhida && <span style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 20, padding: '2px 9px', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 700 }}>🥋 Batizado registrado</span>}
                    {a.mensalidade_registrada && <span style={{ background: 'rgba(8,145,178,0.12)', border: '1px solid rgba(8,145,178,0.35)', borderRadius: 20, padding: '2px 9px', color: '#67e8f9', fontSize: '0.7rem', fontWeight: 700 }}>📅 Mensalidade registrada</span>}
                    {a.contribuicao_registrada && <span style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.35)', borderRadius: 20, padding: '2px 9px', color: '#4ade80', fontSize: '0.7rem', fontWeight: 700 }}>🤝 Contribuição registrada</span>}
                    {a.pagamento_registrado && <span style={{ background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)', borderRadius: 20, padding: '2px 9px', color: '#fbbf24', fontSize: '0.7rem', fontWeight: 700 }}>💳 Forma de pagamento</span>}
                  </div>
                  {/* Last actions log */}
                  {a.ultimas_acoes && a.ultimas_acoes.length > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '6px 10px', marginBottom: 6 }}>
                      {a.ultimas_acoes.slice(0, 3).map((acao, i) => (
                        <div key={i} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', padding: '1px 0', fontFamily: 'monospace' }}>{acao}</div>
                      ))}
                    </div>
                  )}
                  <button onClick={async () => {
                    const s = students.find(st => st.id === a.student_id);
                    if (!s) return;
                    setFinStudent(s); setFinLoading(true);
                    const res = await fetch(`/api/financeiro?student_id=${s.id}`);
                    const d = await res.json(); setFinFicha(d); setFinLoading(false);
                  }}
                    style={{ padding: '4px 14px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.35)', color: '#4ade80', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                    Abrir Ficha →
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Config de Valores ─────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => {
              setShowFinConfig(v => !v);
              if (!showFinConfig) fetch('/api/financeiro/config').then(r => r.json()).then(d => { if (d) setFinConfig(d); });
            }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
              ⚙ Configurar Valores Financeiros {showFinConfig ? '▲' : '▼'}
            </button>
            {showFinConfig && (
              <div style={{ marginTop: 10, background: 'var(--bg-card)', border: '2px solid rgba(22,163,74,0.25)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontWeight: 800, color: '#4ade80', marginBottom: 14, fontSize: '0.9rem' }}>⚙ Valores Vigentes — atualize e salve para refletir em todas as fichas</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                  {([
                    { key: 'mensalidade_valor', label: '📅 Mensalidade (R$)' },
                    { key: 'batizado_integral', label: '🥋 Batizado Integral (R$)' },
                    { key: 'batizado_parcela1', label: '🥋 Batizado Parcela 1 (R$)' },
                    { key: 'batizado_parcela2', label: '🥋 Batizado Parcela 2 (R$)' },
                    { key: 'batizado_parcela3', label: '🥋 Batizado Parcela 3 (R$)' },
                    { key: 'contribuicao_mensal', label: '🤝 Contribuição Mensal (R$)' },
                  ] as const).map(({ key, label }) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
                      <input type="number" min="0" step="0.01"
                        value={finConfig[key]}
                        onChange={e => setFinConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button onClick={async () => {
                    setFinConfigSaving(true); setFinConfigMsg('');
                    const res = await fetch('/api/financeiro/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finConfig) });
                    if (res.ok) { setFinConfigMsg('✓ Valores salvos com sucesso!'); } else { setFinConfigMsg('Erro ao salvar'); }
                    setFinConfigSaving(false); setTimeout(() => setFinConfigMsg(''), 3000);
                  }} disabled={finConfigSaving}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: finConfigSaving ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                    {finConfigSaving ? 'Salvando...' : '💾 Salvar Valores'}
                  </button>
                  {finConfigMsg && <span style={{ fontSize: '0.8rem', color: finConfigMsg.includes('Erro') ? '#f87171' : '#4ade80', fontWeight: 700 }}>{finConfigMsg}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Search bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <input
              type="text" placeholder="Buscar aluno por nome ou CPF..."
              value={finSearch} onChange={e => setFinSearch(e.target.value)}
              style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}
            />
            <button onClick={async () => {
              setFinLoadingAlerts(true);
              const d = await fetch('/api/financeiro/alertas').then(r => r.json()).catch(() => []);
              setFinAlerts(d); setFinLoadingAlerts(false);
            }}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
              ↻ Alertas
            </button>
          </div>

          {/* Student list */}
          {!finStudent && (() => {
            const q = finSearch.trim().toLowerCase();
            // Filtra por núcleo se for representante
            const baseList = nucleoFilter ? students.filter(s => s.nucleo === nucleoFilter) : students;
            const list = q.length >= 1
              ? baseList.filter(s => s.nome_completo.toLowerCase().includes(q) || s.cpf.replace(/\D/g,'').includes(q.replace(/\D/g,'')))
              : baseList;
            return (
              <div style={{ display: 'grid', gap: 8 }}>
                {list.slice(0, 40).map(s => {
                  const alert = finAlerts.find(a => a.student_id === s.id);
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: `1px solid ${alert ? 'rgba(251,191,36,0.4)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'border 0.2s' }}
                      onClick={async () => {
                        setFinStudent(s); setFinLoading(true);
                        const res = await fetch(`/api/financeiro?student_id=${s.id}`);
                        const d = await res.json();
                        if (d) { setFinFicha(d); }
                        else {
                          const now = new Date().toISOString().slice(0,10);
                          setFinFicha({ student_id: s.id, nome_completo: s.nome_completo, cpf: s.cpf, nucleo: s.nucleo || '', batizado: { modalidade: 'nao_definido', valor_total: 150, parcelas: [], status_geral: 'nao_definido' }, contribuicao: { ativa: false, valor_mensal: 30, historico: [] }, mensalidades: [], uniformes: [], alertas: { comprovante_pendente: false, uniforme_solicitado: false, mensalidade_atrasada: false }, updated_at: now });
                        }
                        setFinLoading(false);
                      }}>
                      {s.foto_url
                        ? <img src={s.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
                        : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                          </div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.nome_completo}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.graduacao} · {s.nucleo || '—'}</div>
                      </div>
                      {alert && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {alert.comprovante_pendente && <span title="Comprovante enviado" style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 12, padding: '2px 8px', color: '#fbbf24', fontSize: '0.65rem', fontWeight: 700 }}>📎</span>}
                          {alert.uniforme_solicitado && <span title="Uniforme solicitado" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 12, padding: '2px 8px', color: '#93c5fd', fontSize: '0.65rem', fontWeight: 700 }}>👕</span>}
                          {alert.mensalidade_atrasada && <span title="Pagamento atrasado" style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 12, padding: '2px 8px', color: '#f87171', fontSize: '0.65rem', fontWeight: 700 }}>⚠</span>}
                          {alert.batizado_modalidade_escolhida && <span title="Batizado registrado" style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 12, padding: '2px 8px', color: '#a78bfa', fontSize: '0.65rem', fontWeight: 700 }}>🥋</span>}
                          {alert.mensalidade_registrada && <span title="Mensalidade registrada" style={{ background: 'rgba(8,145,178,0.12)', border: '1px solid rgba(8,145,178,0.35)', borderRadius: 12, padding: '2px 8px', color: '#67e8f9', fontSize: '0.65rem', fontWeight: 700 }}>📅</span>}
                          {alert.contribuicao_registrada && <span title="Contribuição registrada" style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.35)', borderRadius: 12, padding: '2px 8px', color: '#4ade80', fontSize: '0.65rem', fontWeight: 700 }}>🤝</span>}
                          {alert.pagamento_registrado && <span title="Forma de pagamento selecionada" style={{ background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)', borderRadius: 12, padding: '2px 8px', color: '#fbbf24', fontSize: '0.65rem', fontWeight: 700 }}>💳</span>}
                        </div>
                      )}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                  );
                })}
                {list.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Nenhum aluno encontrado.</div>}
              </div>
            );
          })()}

          {/* Ficha detail */}
          {finStudent && finFicha && !finLoading && (() => {
            const f = finFicha;
            const METODOS = ['PIX', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro'];

            const adminSaveFicha = async (updated: any) => {
              setFinSaving(true);
              // _admin_save=true tells the API to clear action-notification flags (admin has seen them)
              const res = await fetch('/api/financeiro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...updated, _admin_save: true }) });
              if (res.ok) {
                const { data } = await res.json();
                if (data) setFinFicha(data);
                setFinMsg('Salvo!'); setTimeout(() => setFinMsg(''), 2500);
              } else { setFinMsg('Erro ao salvar'); }
              setFinSaving(false);
              // Refresh alerts
              fetch('/api/financeiro/alertas').then(r => r.json()).then(d => setFinAlerts(d)).catch(() => {});
            };

            const statusColor: Record<string, string> = { pago: '#16a34a', pendente: '#ca8a04', atrasado: '#dc2626', nao_definido: '#64748b' };
            const statusLabel: Record<string, string> = { pago: '✓ Pago', pendente: '⏳ Pendente', atrasado: '⚠ Atrasado', nao_definido: '— N/D' };

            return (
              <div>
                {/* Back */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <button onClick={() => { setFinStudent(null); setFinFicha(null); }}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    ← Voltar
                  </button>
                  {finStudent.foto_url
                    ? <img src={finStudent.foto_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                    : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{finStudent.nome_completo}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{finStudent.nucleo || '—'} {finStudent.telefone ? `· ${finStudent.telefone}` : ''}</div>
                  </div>
                  {/* WhatsApp button */}
                  {finStudent.telefone && (() => {
                    const tel = finStudent.telefone.replace(/\D/g, '');
                    const phone = tel.startsWith('55') ? tel : `55${tel}`;
                    const waMsg = encodeURIComponent(`Olá ${finStudent.nome_completo.split(' ')[0]}, segue informação da sua ficha financeira na Associação Cultural de Capoeira Barão de Mauá.`);
                    return (
                      <a href={`https://api.whatsapp.com/send?phone=${phone}&text=${waMsg}`} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        WhatsApp
                      </a>
                    );
                  })()}
                  {finMsg && <span style={{ background: finMsg.includes('Erro') ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.1)', border: '1px solid', borderColor: finMsg.includes('Erro') ? 'rgba(220,38,38,0.3)' : 'rgba(22,163,74,0.3)', color: finMsg.includes('Erro') ? '#f87171' : '#4ade80', borderRadius: 8, padding: '4px 12px', fontSize: '0.78rem', fontWeight: 700 }}>{finMsg}</span>}
                </div>

                {/* Section tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {([
                    { key: 'batizado', label: '🥋 Batizado', color: '#7c3aed' },
                    { key: 'mensalidades', label: '📅 Mensalidades', color: '#0891b2' },
                    { key: 'contribuicao', label: '🤝 Contribuição', color: '#16a34a' },
                    { key: 'uniformes', label: '👕 Uniformes', color: '#d97706' },
                  ] as const).map(s => (
                    <button key={s.key} onClick={() => setFinSection(s.key)}
                      style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, border: finSection === s.key ? 'none' : '1px solid var(--border)', background: finSection === s.key ? s.color : 'var(--bg-input)', color: finSection === s.key ? '#fff' : 'var(--text-secondary)' }}>
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* BATIZADO */}
                {finSection === 'batizado' && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', padding: '10px 16px' }}>
                      <div style={{ color: '#fff', fontWeight: 800 }}>🥋 Batizado — Valor: R$ {finConfig.batizado_integral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div style={{ padding: '16px' }}>
                      {f.batizado.modalidade === 'nao_definido' ? (
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 12 }}>Definir modalidade:</div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            {(['integral', 'parcelado'] as const).map(mod => (
                              <button key={mod} onClick={async () => {
                                const parcelas = mod === 'integral'
                                  ? [{ numero: 1, valor: 150, vencimento: '', status: 'pendente' }]
                                  : [1,2,3].map(n => ({ numero: n, valor: 50, vencimento: '', status: 'pendente' }));
                                const updated = { ...f, batizado: { ...f.batizado, modalidade: mod, parcelas, valor_total: 150 } };
                                setFinFicha(updated); await adminSaveFicha(updated);
                              }}
                                style={{ flex: 1, padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.85rem' }}>
                                {mod === 'integral' ? `💳 Integral (R$ ${finConfig.batizado_integral.toLocaleString('pt-BR', {minimumFractionDigits:2})})` : `📆 Parcelado 3× (${finConfig.batizado_parcela1}+${finConfig.batizado_parcela2}+${finConfig.batizado_parcela3})`}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              Modalidade: <strong>{f.batizado.modalidade === 'integral' ? 'Integral' : 'Parcelado 3×'}</strong>
                            </div>
                            <button onClick={async () => {
                              if (!confirm('Excluir agendamento de batizado? Isso vai apagar a modalidade e parcelas.')) return;
                              const updated = { ...f, batizado: { ...f.batizado, modalidade: 'nao_definido', parcelas: [], valor_total: 0 } };
                              setFinFicha(updated); await adminSaveFicha(updated);
                            }} style={{ padding: '3px 10px', borderRadius: 8, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                              🗑 Excluir agendamento
                            </button>
                          </div>
                          {f.batizado.parcelas.map((p: any) => (
                            <div key={p.numero} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Parcela {p.numero} — R$ {p.valor.toFixed(2)}</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  {(['pago', 'pendente', 'atrasado'] as const).map(st => (
                                    <button key={st} onClick={async () => {
                                      const updated = { ...f, batizado: { ...f.batizado, parcelas: f.batizado.parcelas.map((pp: any) => pp.numero === p.numero ? { ...pp, status: st, data_pagamento: st === 'pago' ? new Date().toISOString().slice(0,10) : pp.data_pagamento } : pp) } };
                                      setFinFicha(updated); await adminSaveFicha(updated);
                                    }}
                                      style={{ padding: '3px 10px', borderRadius: 16, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, border: 'none', background: p.status === st ? (st === 'pago' ? '#16a34a' : st === 'pendente' ? '#ca8a04' : '#dc2626') : 'var(--bg-card)', color: p.status === st ? '#fff' : 'var(--text-secondary)' }}>
                                      {statusLabel[st]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Metodo */}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                {METODOS.map(m => (
                                  <button key={m} onClick={async () => {
                                    const updated = { ...f, batizado: { ...f.batizado, parcelas: f.batizado.parcelas.map((pp: any) => pp.numero === p.numero ? { ...pp, metodo: m } : pp) } };
                                    setFinFicha(updated); await adminSaveFicha(updated);
                                  }}
                                    style={{ padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, background: p.metodo === m ? 'rgba(124,58,237,0.2)' : 'var(--bg-card)', border: `1px solid ${p.metodo === m ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`, color: p.metodo === m ? '#a78bfa' : 'var(--text-secondary)' }}>
                                    {m}
                                  </button>
                                ))}
                              </div>
                              {p.comprovante_url && (
                                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <a href={p.comprovante_url} target="_blank" rel="noreferrer" style={{ color: '#a78bfa', fontSize: '0.78rem', textDecoration: 'underline' }}>📎 Ver comprovante do aluno</a>
                                  {p.status !== 'pago' && (
                                    <button onClick={async () => {
                                      const updated = { ...f, batizado: { ...f.batizado, parcelas: f.batizado.parcelas.map((pp: any) => pp.numero === p.numero ? { ...pp, status: 'pago', admin_confirmado: true, data_pagamento: new Date().toISOString().slice(0,10) } : pp) } };
                                      setFinFicha(updated); await adminSaveFicha(updated);
                                    }}
                                      style={{ padding: '3px 10px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.4)', color: '#4ade80', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                                      ✓ Confirmar pagamento
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* MENSALIDADES */}
                {finSection === 'mensalidades' && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ background: 'linear-gradient(135deg,#0891b2,#0369a1)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ color: '#fff', fontWeight: 800 }}>📅 Mensalidades</div>
                      <button onClick={async () => {
                        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                        const mes = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                        if (f.mensalidades.find((m: any) => m.mes === mes)) { setFinMsg('Mês já registrado'); setTimeout(() => setFinMsg(''), 2000); return; }
                        const nova = { mes, valor: 80, status: 'pendente' };
                        const updated = { ...f, mensalidades: [...f.mensalidades, nova].sort((a: any, b: any) => b.mes.localeCompare(a.mes)) };
                        setFinFicha(updated); await adminSaveFicha(updated);
                      }}
                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                        + Adicionar mês
                      </button>
                    </div>
                    <div style={{ padding: '16px' }}>
                      {f.mensalidades.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0', fontSize: '0.85rem' }}>Nenhuma mensalidade registrada.</div>}
                      {f.mensalidades.map((m: any) => {
                        const [y, mo] = m.mes.split('-');
                        const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                        return (
                          <div key={m.mes} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{names[parseInt(mo)-1]}/{y} — R$ {m.valor.toFixed(2)}</span>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {(['pago', 'pendente', 'atrasado'] as const).map(st => (
                                  <button key={st} onClick={async () => {
                                    const updated = { ...f, mensalidades: f.mensalidades.map((mm: any) => mm.mes === m.mes ? { ...mm, status: st, admin_confirmado: st === 'pago', data_pagamento: st === 'pago' ? new Date().toISOString().slice(0,10) : mm.data_pagamento } : mm) };
                                    setFinFicha(updated); await adminSaveFicha(updated);
                                  }}
                                    style={{ padding: '3px 9px', borderRadius: 12, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, border: 'none', background: m.status === st ? (st === 'pago' ? '#16a34a' : st === 'pendente' ? '#ca8a04' : '#dc2626') : 'var(--bg-card)', color: m.status === st ? '#fff' : 'var(--text-secondary)' }}>
                                    {statusLabel[st]}
                                  </button>
                                ))}
                                <button onClick={async () => {
                                  if (!confirm(`Excluir mensalidade de ${names[parseInt(mo)-1]}/${y}?`)) return;
                                  const updated = { ...f, mensalidades: f.mensalidades.filter((mm: any) => mm.mes !== m.mes) };
                                  setFinFicha(updated); await adminSaveFicha(updated);
                                }} style={{ padding: '3px 8px', borderRadius: 8, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
                                  🗑
                                </button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                              {METODOS.map(mt => (
                                <button key={mt} onClick={async () => {
                                  const updated = { ...f, mensalidades: f.mensalidades.map((mm: any) => mm.mes === m.mes ? { ...mm, metodo: mt } : mm) };
                                  setFinFicha(updated); await adminSaveFicha(updated);
                                }}
                                  style={{ padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600, background: m.metodo === mt ? 'rgba(8,145,178,0.2)' : 'var(--bg-card)', border: `1px solid ${m.metodo === mt ? 'rgba(8,145,178,0.5)' : 'var(--border)'}`, color: m.metodo === mt ? '#67e8f9' : 'var(--text-secondary)' }}>
                                  {mt}
                                </button>
                              ))}
                            </div>
                            {m.comprovante_url && (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <a href={m.comprovante_url} target="_blank" rel="noreferrer" style={{ color: '#67e8f9', fontSize: '0.75rem', textDecoration: 'underline' }}>📎 Comprovante</a>
                                {m.comprovante_pendente && !m.admin_confirmado && (
                                  <button onClick={async () => {
                                    const updated = { ...f, mensalidades: f.mensalidades.map((mm: any) => mm.mes === m.mes ? { ...mm, status: 'pago', admin_confirmado: true, comprovante_pendente: false, data_pagamento: new Date().toISOString().slice(0,10) } : mm) };
                                    setFinFicha(updated); await adminSaveFicha(updated);
                                  }}
                                    style={{ padding: '3px 10px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.4)', color: '#4ade80', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                                    ✓ Confirmar pagamento
                                  </button>
                                )}
                                {m.admin_confirmado && <span style={{ color: '#4ade80', fontSize: '0.72rem' }}>✅ Confirmado</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* CONTRIBUICAO */}
                {finSection === 'contribuicao' && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', padding: '10px 16px' }}>
                      <div style={{ color: '#fff', fontWeight: 800 }}>🤝 Contribuição — Projeto Social</div>
                    </div>
                    <div style={{ padding: '16px' }}>
                      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Status:</span>
                        <span style={{ fontWeight: 700, color: f.contribuicao.ativa ? '#4ade80' : 'var(--text-secondary)', fontSize: '0.85rem' }}>{f.contribuicao.ativa ? '✓ Ativo' : '— Inativo'}</span>
                      </div>
                      {f.contribuicao.historico.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Nenhum registro de contribuição.</div>}
                      {f.contribuicao.historico.map((m: any) => {
                        const [y, mo] = m.mes.split('-');
                        const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                        return (
                          <div key={m.mes} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{names[parseInt(mo)-1]}/{y}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>R$ {m.valor.toFixed(2)}</span>
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
                              {(['pago', 'pendente', 'atrasado'] as const).map(st => (
                                <button key={st} onClick={async () => {
                                  const updated = { ...f, contribuicao: { ...f.contribuicao, historico: f.contribuicao.historico.map((c: any) => c.mes === m.mes ? { ...c, status: st, admin_confirmado: st === 'pago' } : c) } };
                                  setFinFicha(updated); await adminSaveFicha(updated);
                                }}
                                  style={{ padding: '2px 8px', borderRadius: 12, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, border: 'none', background: m.status === st ? (st === 'pago' ? '#16a34a' : st === 'pendente' ? '#ca8a04' : '#dc2626') : 'var(--bg-card)', color: m.status === st ? '#fff' : 'var(--text-secondary)' }}>
                                  {statusLabel[st]}
                                </button>
                              ))}
                              <button onClick={async () => {
                                if (!confirm(`Excluir contribuição de ${names[parseInt(mo)-1]}/${y}?`)) return;
                                const updated = { ...f, contribuicao: { ...f.contribuicao, historico: f.contribuicao.historico.filter((c: any) => c.mes !== m.mes) } };
                                setFinFicha(updated); await adminSaveFicha(updated);
                              }} style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>
                                🗑
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* UNIFORMES */}
                {finSection === 'uniformes' && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ background: 'linear-gradient(135deg,#d97706,#b45309)', padding: '10px 16px' }}>
                      <div style={{ color: '#fff', fontWeight: 800 }}>👕 Uniformes Solicitados</div>
                    </div>
                    <div style={{ padding: '16px' }}>
                      {f.uniformes.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>Nenhuma solicitação.</div>}
                      {f.uniformes.map((u: any) => (
                        <div key={u.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{u.descricao}{u.tamanho ? ` (${u.tamanho})` : ''}</span>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {(['solicitado', 'confirmado', 'entregue', 'cancelado'] as const).map(st => (
                                <button key={st} onClick={async () => {
                                  const updated = { ...f, uniformes: f.uniformes.map((uu: any) => uu.id === u.id ? { ...uu, status: st, data_entrega: st === 'entregue' ? new Date().toISOString().slice(0,10) : uu.data_entrega } : uu) };
                                  setFinFicha(updated); await adminSaveFicha(updated);
                                }}
                                  style={{ padding: '2px 7px', borderRadius: 10, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, border: 'none', background: u.status === st ? (st === 'entregue' ? '#16a34a' : st === 'confirmado' ? '#7c3aed' : st === 'cancelado' ? '#64748b' : '#3b82f6') : 'var(--bg-card)', color: u.status === st ? '#fff' : 'var(--text-secondary)' }}>
                                  {st}
                                </button>
                              ))}
                              <button onClick={async () => {
                                if (!confirm(`Excluir solicitação de "${u.descricao}"?`)) return;
                                const updated = { ...f, uniformes: f.uniformes.filter((uu: any) => uu.id !== u.id) };
                                setFinFicha(updated); await adminSaveFicha(updated);
                              }}
                                style={{ padding: '2px 7px', borderRadius: 10, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, border: 'none', background: 'rgba(220,38,38,0.15)', color: '#f87171', marginLeft: 4 }}
                                title="Excluir solicitação">
                                🗑
                              </button>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {u.quantidade}× R$ {u.valor_unitario.toFixed(2)} · Total: R$ {(u.quantidade * u.valor_unitario).toFixed(2)} · {new Date(u.data_solicitacao + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {finLoading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando ficha...</div>}
        </div>
      )}

      {/* ===== ABA DOAÇÕES ===== */}
      {activeTab === 'doacoes' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', background: 'linear-gradient(90deg,#8b5cf6,#6d28d9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🤲 Gestão de Doações</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>Pessoas Jurídicas e Pessoas Naturais</div>
            </div>
            <button onClick={() => { setShowDoacaoForm(true); setDoacaoEditId(null); setDoacaoForm({ tipo: 'pf', modalidade: 'unica', data: new Date().toISOString().slice(0,10) }); }}
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              + Nova Doação
            </button>
          </div>

          {/* Form modal */}
          {showDoacaoForm && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 14, color: '#a78bfa' }}>{doacaoEditId ? '✏ Editar Doação' : '+ Nova Doação'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 12 }}>
                {/* Tipo */}
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Tipo de Doador</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['pf','Pessoa Física'],['pj','Pessoa Jurídica']] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setDoacaoForm((p: any) => ({ ...p, tipo: v }))}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', background: doacaoForm.tipo === v ? 'rgba(139,92,246,0.25)' : 'var(--bg-input)', border: `1px solid ${doacaoForm.tipo === v ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`, color: doacaoForm.tipo === v ? '#c4b5fd' : 'var(--text-secondary)' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Nome do Doador</label>
                  <input value={doacaoForm.nome || ''} onChange={e => setDoacaoForm((p: any) => ({ ...p, nome: e.target.value }))} placeholder="Nome completo ou razão social"
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>{doacaoForm.tipo === 'pj' ? 'CNPJ' : 'CPF'}</label>
                  <input value={doacaoForm.documento || ''} onChange={e => setDoacaoForm((p: any) => ({ ...p, documento: e.target.value }))} placeholder={doacaoForm.tipo === 'pj' ? '00.000.000/0001-00' : '000.000.000-00'}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Valor (R$)</label>
                  <input type="number" min={0} step={0.01} value={doacaoForm.valor || ''} onChange={e => setDoacaoForm((p: any) => ({ ...p, valor: parseFloat(e.target.value) || 0 }))} placeholder="0,00"
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Local de Domicílio</label>
                  <input value={doacaoForm.domicilio || ''} onChange={e => setDoacaoForm((p: any) => ({ ...p, domicilio: e.target.value }))} placeholder="Cidade/Estado"
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Data</label>
                  <input type="date" value={doacaoForm.data || ''} onChange={e => setDoacaoForm((p: any) => ({ ...p, data: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Modalidade</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['unica','Única'],['mensal','Mensal']] as const).map(([v,l]) => (
                      <button key={v} onClick={() => setDoacaoForm((p: any) => ({ ...p, modalidade: v }))}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', background: doacaoForm.modalidade === v ? 'rgba(139,92,246,0.25)' : 'var(--bg-input)', border: `1px solid ${doacaoForm.modalidade === v ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`, color: doacaoForm.modalidade === v ? '#c4b5fd' : 'var(--text-secondary)' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Observações</label>
                  <input value={doacaoForm.observacoes || ''} onChange={e => setDoacaoForm((p: any) => ({ ...p, observacoes: e.target.value }))} placeholder="Opcional"
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={async () => {
                  if (!doacaoForm.nome?.trim() || !doacaoForm.valor) { alert('Preencha nome e valor.'); return; }
                  const body = doacaoEditId ? { ...doacaoForm, id: doacaoEditId } : doacaoForm;
                  await fetch('/api/doacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  const d = await fetch('/api/doacoes').then(r => r.json());
                  setDoacoes(d); setShowDoacaoForm(false); setDoacaoForm({});
                }}
                  style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  {doacaoEditId ? '💾 Salvar' : '+ Registrar Doação'}
                </button>
                <button onClick={() => { setShowDoacaoForm(false); setDoacaoForm({}); }}
                  style={{ padding: '10px 20px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Summary */}
          {doacoes.length > 0 && (() => {
            const total = doacoes.reduce((s, d) => s + (d.valor || 0), 0);
            const mensais = doacoes.filter(d => d.modalidade === 'mensal').length;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a78bfa' }}>{doacoes.length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Total de Doadores</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#4ade80' }}>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Total Arrecadado</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(8,145,178,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#67e8f9' }}>{mensais}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Doações Mensais</div>
                </div>
              </div>
            );
          })()}

          {/* List */}
          {loadingDoacoes ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
          ) : doacoes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Nenhuma doação registrada ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {doacoes.map(d => (
                <div key={d.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: d.tipo === 'pj' ? 'rgba(139,92,246,0.15)' : 'rgba(8,145,178,0.15)', border: `2px solid ${d.tipo === 'pj' ? 'rgba(139,92,246,0.4)' : 'rgba(8,145,178,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                    {d.tipo === 'pj' ? '🏢' : '👤'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{d.nome}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{d.tipo === 'pj' ? 'CNPJ' : 'CPF'}: {d.documento} · {d.domicilio}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')} · {d.modalidade === 'mensal' ? '🔄 Mensal' : '1× Única'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#4ade80' }}>R$ {(d.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <span style={{ fontSize: '0.68rem', background: d.tipo === 'pj' ? 'rgba(139,92,246,0.12)' : 'rgba(8,145,178,0.12)', border: `1px solid ${d.tipo === 'pj' ? 'rgba(139,92,246,0.3)' : 'rgba(8,145,178,0.3)'}`, borderRadius: 20, padding: '1px 8px', color: d.tipo === 'pj' ? '#c4b5fd' : '#67e8f9', fontWeight: 700 }}>
                      {d.tipo === 'pj' ? 'PJ' : 'PF'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button onClick={() => {
                      // Generate printable receipt
                      const pw = window.open('', '_blank');
                      if (!pw) return;
                      const dataFormatada = d.data ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
                      const valorFormatado = (d.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                      const modalidadeLabel = d.modalidade === 'mensal' ? 'Doação Mensal' : 'Doação Única';
                      const docLabel = d.tipo === 'pj' ? 'CNPJ' : 'CPF';
                      pw.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo de Doação</title>
                      <style>
                        * { margin:0; padding:0; box-sizing:border-box; }
                        body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 700px; margin: 0 auto; }
                        .header { text-align: center; border-bottom: 3px double #1a1a1a; padding-bottom: 20px; margin-bottom: 24px; }
                        .header h1 { font-size: 16px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
                        .header p { font-size: 12px; color: #444; margin: 2px 0; }
                        .title { text-align: center; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; margin: 20px 0; border: 2px solid #1a1a1a; padding: 10px; }
                        .row { display: flex; margin: 10px 0; font-size: 13px; }
                        .label { font-weight: bold; min-width: 180px; }
                        .value { flex: 1; border-bottom: 1px dotted #999; padding-bottom: 2px; }
                        .valor-box { margin: 24px 0; padding: 16px; border: 2px solid #1a1a1a; text-align: center; }
                        .valor-box .valor { font-size: 28px; font-weight: bold; }
                        .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; }
                        .ass-line { border-top: 1px solid #1a1a1a; padding-top: 6px; min-width: 220px; text-align: center; }
                        @media print { body { padding: 20px; } }
                      </style></head><body>
                      <div class="header">
                        <h1>Associação Cultural de Capoeira Barão de Mauá</h1>
                        <p>CNPJ: 58.860.408/0001-13</p>
                        <p>Recibo de Doação</p>
                      </div>
                      <div class="title">RECIBO DE DOAÇÃO Nº ${d.id?.slice(-6).toUpperCase()}</div>
                      <div class="row"><span class="label">Doador:</span><span class="value">${d.nome || '—'}</span></div>
                      <div class="row"><span class="label">${docLabel}:</span><span class="value">${d.documento || '—'}</span></div>
                      <div class="row"><span class="label">Domicílio:</span><span class="value">${d.domicilio || '—'}</span></div>
                      <div class="row"><span class="label">Tipo:</span><span class="value">${d.tipo === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}</span></div>
                      <div class="row"><span class="label">Modalidade:</span><span class="value">${modalidadeLabel}</span></div>
                      <div class="row"><span class="label">Data:</span><span class="value">${dataFormatada}</span></div>
                      <div class="valor-box">
                        <div style="font-size:13px;margin-bottom:6px;">Valor da Doação</div>
                        <div class="valor">${valorFormatado}</div>
                      </div>
                      <p style="font-size:12px;text-align:justify;margin-bottom:24px;">
                        A Associação Cultural de Capoeira Barão de Mauá, CNPJ 58.860.408/0001-13, declara ter recebido a doação acima
                        descrita, destinada ao desenvolvimento de atividades culturais, sociais e esportivas de capoeira junto às comunidades
                        atendidas pela associação.
                      </p>
                      <div class="footer">
                        <div class="ass-line">
                          <p>Duque de Caxias/RJ, ${new Date().toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div class="ass-line">
                          <p>Assinatura do Responsável</p>
                          <p style="margin-top:4px;font-size:11px;">Associação Cultural de Capoeira Barão de Mauá</p>
                        </div>
                      </div>
                      <script>window.onload=()=>{window.print();}<\/script>
                      </body></html>`);
                      pw.document.close();
                    }}
                      style={{ padding: '5px 10px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>🖨 Recibo</button>
                    <button onClick={() => { setDoacaoEditId(d.id); setDoacaoForm(d); setShowDoacaoForm(true); }}
                      style={{ padding: '5px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem' }}>✏</button>
                    <button onClick={async () => { if (!confirm('Excluir esta doação?')) return; await fetch('/api/doacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _delete: d.id }) }); setDoacoes(doacoes.filter(x => x.id !== d.id)); }}
                      style={{ padding: '5px 10px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== ABA EDITAIS ===== */}
      {activeTab === 'editais' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', background: 'linear-gradient(90deg,#0891b2,#0369a1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📜 Participação em Editais</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>Registro, valores e prestação de contas</div>
            </div>
            <button onClick={() => { setShowEditalForm(true); setEditalEditId(null); setEditalForm({ status: 'inscrito', prestacao_status: 'pendente', data_submissao: new Date().toISOString().slice(0,10) }); }}
              style={{ background: 'linear-gradient(135deg,#0891b2,#0369a1)', border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              + Novo Edital
            </button>
          </div>

          {/* Form */}
          {showEditalForm && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(8,145,178,0.4)', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 14, color: '#67e8f9' }}>{editalEditId ? '✏ Editar Edital' : '+ Novo Edital'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 12 }}>
                {[
                  { key: 'titulo', label: 'Título do Edital', placeholder: 'Ex: Edital de Cultura 2026' },
                  { key: 'orgao', label: 'Órgão/Entidade', placeholder: 'Ex: Secretaria de Cultura RJ' },
                  { key: 'numero', label: 'Número do Edital', placeholder: 'Ex: 001/2026' },
                  { key: 'valor_solicitado', label: 'Valor Solicitado (R$)', placeholder: '0,00', type: 'number' },
                  { key: 'valor_aprovado', label: 'Valor Aprovado (R$)', placeholder: '0,00', type: 'number' },
                  { key: 'data_submissao', label: 'Data de Submissão', type: 'date' },
                  { key: 'data_inicio', label: 'Data de Início', type: 'date' },
                  { key: 'data_fim', label: 'Data de Encerramento', type: 'date' },
                  { key: 'data_prestacao_contas', label: 'Data Prestação de Contas', type: 'date' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>{f.label}</label>
                    <input type={f.type || 'text'} value={editalForm[f.key] || ''} onChange={e => setEditalForm((p: any) => ({ ...p, [f.key]: f.type === 'number' ? parseFloat(e.target.value)||0 : e.target.value }))} placeholder={f.placeholder}
                      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                {/* Status */}
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Status</label>
                  <select value={editalForm.status || 'inscrito'} onChange={e => setEditalForm((p: any) => ({ ...p, status: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="inscrito">Inscrito</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="em_execucao">Em Execução</option>
                    <option value="concluido">Concluído</option>
                    <option value="reprovado">Reprovado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Prestação de Contas</label>
                  <select value={editalForm.prestacao_status || 'pendente'} onChange={e => setEditalForm((p: any) => ({ ...p, prestacao_status: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="pendente">Pendente</option>
                    <option value="enviada">Enviada</option>
                    <option value="aprovada">Aprovada</option>
                    <option value="reprovada">Reprovada</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Observações</label>
                  <input value={editalForm.observacoes || ''} onChange={e => setEditalForm((p: any) => ({ ...p, observacoes: e.target.value }))} placeholder="Opcional"
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={async () => {
                  if (!editalForm.titulo?.trim()) { alert('Informe o título do edital.'); return; }
                  const body = editalEditId ? { ...editalForm, id: editalEditId } : editalForm;
                  await fetch('/api/editais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  const d = await fetch('/api/editais').then(r => r.json());
                  setEditais(d); setShowEditalForm(false); setEditalForm({});
                }}
                  style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#0891b2,#0369a1)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  {editalEditId ? '💾 Salvar' : '+ Registrar Edital'}
                </button>
                <button onClick={() => { setShowEditalForm(false); setEditalForm({}); }}
                  style={{ padding: '10px 20px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Summary */}
          {editais.length > 0 && (() => {
            const aprovados = editais.filter(e => ['aprovado','em_execucao','concluido'].includes(e.status));
            const totalAprovado = aprovados.reduce((s, e) => s + (e.valor_aprovado || 0), 0);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(8,145,178,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#67e8f9' }}>{editais.length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Total de Editais</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#4ade80' }}>R$ {totalAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Total Aprovado</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f87171' }}>{editais.filter(e => e.prestacao_status === 'pendente' && e.status !== 'reprovado' && e.status !== 'cancelado').length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Prest. Pendentes</div>
                </div>
              </div>
            );
          })()}

          {/* Edital list */}
          {loadingEditais ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
          ) : editais.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Nenhum edital registrado ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {editais.map(e => {
                const statusColors: Record<string, string> = { inscrito: '#3b82f6', aprovado: '#16a34a', em_execucao: '#0891b2', concluido: '#64748b', reprovado: '#dc2626', cancelado: '#94a3b8' };
                const prestColors: Record<string, string> = { pendente: '#ca8a04', enviada: '#3b82f6', aprovada: '#16a34a', reprovada: '#dc2626' };
                const sc = statusColors[e.status] || '#64748b';
                const pc = prestColors[e.prestacao_status] || '#64748b';
                return (
                  <div key={e.id} style={{ background: 'var(--bg-card)', border: `1px solid ${sc}30`, borderLeft: `4px solid ${sc}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{e.titulo}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>{e.orgao} · Nº {e.numero || '—'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ background: `${sc}20`, border: `1px solid ${sc}50`, borderRadius: 20, padding: '2px 10px', color: sc, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {e.status === 'inscrito' ? '📋 Inscrito' : e.status === 'aprovado' ? '✅ Aprovado' : e.status === 'em_execucao' ? '⚙ Em Execução' : e.status === 'concluido' ? '✓ Concluído' : e.status === 'reprovado' ? '✕ Reprovado' : '— Cancelado'}
                        </span>
                        <button onClick={() => { setEditalEditId(e.id); setEditalForm(e); setShowEditalForm(true); }}
                          style={{ padding: '4px 9px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: '0.7rem' }}>✏</button>
                        <button onClick={async () => { if (!confirm('Excluir este edital?')) return; await fetch('/api/editais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _delete: e.id }) }); setEditais(editais.filter(x => x.id !== e.id)); }}
                          style={{ padding: '4px 9px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 6, cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <div>💰 Solicitado: <strong style={{ color: 'var(--text-primary)' }}>R$ {(e.valor_solicitado||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></div>
                      <div>✅ Aprovado: <strong style={{ color: '#4ade80' }}>R$ {(e.valor_aprovado||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></div>
                      <div>📅 Submissão: {e.data_submissao ? new Date(e.data_submissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                      {e.data_prestacao_contas && <div>📋 Prest. Contas: {new Date(e.data_prestacao_contas + 'T12:00:00').toLocaleDateString('pt-BR')}</div>}
                    </div>
                    {e.prestacao_status && (
                      <span style={{ background: `${pc}15`, border: `1px solid ${pc}40`, borderRadius: 20, padding: '2px 10px', color: pc, fontSize: '0.7rem', fontWeight: 700 }}>
                        Prestação: {e.prestacao_status === 'pendente' ? '⏳ Pendente' : e.prestacao_status === 'enviada' ? '📤 Enviada' : e.prestacao_status === 'aprovada' ? '✅ Aprovada' : '⚠ Reprovada'}
                      </span>
                    )}
                    {e.observacoes && <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>📝 {e.observacoes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== ABA MATERIAIS ===== */}
      {activeTab === 'materiais' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fb923c' }}>🛒 Compra de Materiais</div>
            <button onClick={() => { setShowMaterialForm(true); setMaterialEditId(null); setMaterialForm({}); }}
              style={{ background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
              + Registrar Compra
            </button>
          </div>

          {/* Summary */}
          {materiais.length > 0 && (() => {
            const total = materiais.reduce((s, m) => s + (m.valor_total || 0), 0);
            const qtd = materiais.reduce((s, m) => s + (m.quantidade || 0), 0);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(234,88,12,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fb923c' }}>{materiais.length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Compras Registradas</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(234,88,12,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fb923c' }}>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Total Gasto</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(234,88,12,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fb923c' }}>{qtd}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Itens</div>
                </div>
              </div>
            );
          })()}

          {/* Filter */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <select value={filterMatNucleo} onChange={e => setFilterMatNucleo(e.target.value)}
              style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
              <option value="">Todos os núcleos</option>
              <option value="Poliesportivo Edson Alves">Edson Alves</option>
              <option value="Poliesportivo do Ipiranga">Ipiranga</option>
              <option value="Saracuruna">Saracuruna</option>
              <option value="Vila Urussaí">Vila Urussaí</option>
              <option value="Jayme Fichman">Jayme Fichman</option>
              <option value="Geral">Geral</option>
            </select>
          </div>

          {/* Form */}
          {showMaterialForm && (
            <div style={{ background: 'var(--bg-card)', border: '2px solid rgba(234,88,12,0.3)', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 800, color: '#fb923c', marginBottom: 14 }}>{materialEditId ? '✏ Editar Compra' : '+ Nova Compra'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
                {[
                  { key: 'descricao', label: 'Produto / Descrição', placeholder: 'Ex: Pandeiro profissional', type: 'text' },
                  { key: 'categoria', label: 'Categoria', placeholder: '', type: 'select', opts: ['instrumento', 'uniforme', 'material de escritório', 'limpeza', 'informática', 'outros'] },
                  { key: 'quantidade', label: 'Quantidade', placeholder: '1', type: 'number' },
                  { key: 'valor_unitario', label: 'Valor Unitário (R$)', placeholder: '0,00', type: 'number' },
                  { key: 'modalidade', label: 'Modalidade', placeholder: '', type: 'select', opts: ['avista', 'parcelado'] },
                  { key: 'parcelas', label: 'Nº Parcelas (se parcelado)', placeholder: '', type: 'number' },
                  { key: 'metodo_pagamento', label: 'Forma de Pagamento', placeholder: '', type: 'select', opts: ['PIX', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro', 'Boleto'] },
                  { key: 'fornecedor', label: 'Fornecedor', placeholder: 'Opcional', type: 'text' },
                  { key: 'nucleo', label: 'Núcleo', placeholder: '', type: 'select', opts: ['Geral', 'Poliesportivo Edson Alves', 'Poliesportivo do Ipiranga', 'Saracuruna', 'Vila Urussaí', 'Jayme Fichman'] },
                  { key: 'data_compra', label: 'Data da Compra', placeholder: '', type: 'date' },
                  { key: 'notas', label: 'Observações', placeholder: 'Opcional', type: 'text' },
                ].map(({ key, label, placeholder, type, opts }) => (
                  <div key={key}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
                    {type === 'select'
                      ? <select value={materialForm[key] || ''} onChange={e => setMaterialForm((p: any) => ({ ...p, [key]: e.target.value }))}
                          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
                          <option value="">— selecione —</option>
                          {(opts || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      : <input type={type} value={materialForm[key] || ''} onChange={e => setMaterialForm((p: any) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder}
                          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                    }
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={async () => {
                  if (!materialForm.descricao?.trim()) { alert('Informe a descrição do produto.'); return; }
                  const qtd = parseFloat(materialForm.quantidade) || 1;
                  const vu = parseFloat(materialForm.valor_unitario) || 0;
                  const body = { ...materialForm, id: materialEditId || undefined, quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu };
                  await fetch('/api/materiais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  const d = await fetch('/api/materiais').then(r => r.json());
                  setMateriais(d); setShowMaterialForm(false); setMaterialForm({}); setMaterialEditId(null);
                }}
                  style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#ea580c,#c2410c)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  {materialEditId ? '💾 Salvar' : '+ Registrar Compra'}
                </button>
                <button onClick={() => { setShowMaterialForm(false); setMaterialForm({}); setMaterialEditId(null); }}
                  style={{ padding: '10px 20px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {loadingMateriais ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
          ) : materiais.filter(m => !filterMatNucleo || m.nucleo === filterMatNucleo).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Nenhuma compra registrada ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {materiais.filter(m => !filterMatNucleo || m.nucleo === filterMatNucleo).map(m => (
                <div key={m.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(234,88,12,0.2)', borderLeft: '4px solid #ea580c', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{m.descricao}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {m.categoria} · {m.nucleo || 'Geral'} · {m.data_compra ? new Date(m.data_compra + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#fb923c', fontSize: '1rem' }}>R$ {(m.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{m.quantidade}x R$ {(m.valor_unitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ background: 'rgba(234,88,12,0.12)', border: '1px solid rgba(234,88,12,0.3)', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', color: '#fb923c', fontWeight: 700 }}>
                      {m.modalidade === 'parcelado' ? `${m.parcelas}x` : 'À Vista'}
                    </span>
                    <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{m.metodo_pagamento}</span>
                    {m.fornecedor && <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>🏪 {m.fornecedor}</span>}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button onClick={() => { setMaterialEditId(m.id); setMaterialForm(m); setShowMaterialForm(true); }}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem' }}>✏ Editar</button>
                      <button onClick={async () => { if (!confirm('Excluir esta compra?')) return; await fetch('/api/materiais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _delete: m.id }) }); setMateriais(materiais.filter(x => x.id !== m.id)); }}
                        style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem' }}>🗑</button>
                    </div>
                  </div>
                  {m.notas && <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>📝 {m.notas}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== ABA PATRIMÔNIO ===== */}
      {activeTab === 'patrimonio' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#facc15' }}>🏛 Patrimônio da Associação</div>
            <button onClick={() => { setShowPatrimonioForm(true); setPatrimonioEditId(null); setPatrimonioForm({}); }}
              style={{ background: 'linear-gradient(135deg,#ca8a04,#a16207)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
              + Cadastrar Item
            </button>
          </div>

          {/* Summary */}
          {patrimonio.length > 0 && (() => {
            const total = patrimonio.reduce((s, p) => s + ((p.valor_estimado || 0) * (p.quantidade || 1)), 0);
            const nucleos = [...new Set(patrimonio.map((p: any) => p.nucleo).filter(Boolean))];
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(202,138,4,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#facc15' }}>{patrimonio.length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Itens Cadastrados</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(202,138,4,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#facc15' }}>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Valor Estimado Total</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(202,138,4,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#facc15' }}>{nucleos.length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Núcleos</div>
                </div>
              </div>
            );
          })()}

          {/* Filter */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <select value={filterPatNucleo} onChange={e => setFilterPatNucleo(e.target.value)}
              style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}>
              <option value="">Todos os núcleos</option>
              <option value="Poliesportivo Edson Alves">Edson Alves</option>
              <option value="Poliesportivo do Ipiranga">Ipiranga</option>
              <option value="Saracuruna">Saracuruna</option>
              <option value="Vila Urussaí">Vila Urussaí</option>
              <option value="Jayme Fichman">Jayme Fichman</option>
              <option value="Geral">Geral</option>
            </select>
          </div>

          {/* Form */}
          {showPatrimonioForm && (
            <div style={{ background: 'var(--bg-card)', border: '2px solid rgba(202,138,4,0.3)', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 800, color: '#facc15', marginBottom: 14 }}>{patrimonioEditId ? '✏ Editar Item' : '+ Cadastrar Patrimônio'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
                {[
                  { key: 'nome', label: 'Nome do Item', placeholder: 'Ex: Berimbau médio', type: 'text' },
                  { key: 'tipo', label: 'Tipo', placeholder: '', type: 'select', opts: ['instrumento', 'mobiliário', 'equipamento', 'uniforme', 'material pedagógico', 'outros'] },
                  { key: 'nucleo', label: 'Núcleo', placeholder: '', type: 'select', opts: ['Geral', 'Poliesportivo Edson Alves', 'Poliesportivo do Ipiranga', 'Saracuruna', 'Vila Urussaí', 'Jayme Fichman'] },
                  { key: 'quantidade', label: 'Quantidade', placeholder: '1', type: 'number' },
                  { key: 'valor_estimado', label: 'Valor Estimado (R$)', placeholder: '0,00', type: 'number' },
                  { key: 'estado', label: 'Estado de Conservação', placeholder: '', type: 'select', opts: ['otimo', 'bom', 'regular', 'ruim', 'descartado'] },
                  { key: 'numero_serie', label: 'Nº de Série / Tombamento', placeholder: 'Opcional', type: 'text' },
                  { key: 'data_aquisicao', label: 'Data de Aquisição', placeholder: '', type: 'date' },
                  { key: 'notas', label: 'Observações', placeholder: 'Opcional', type: 'text' },
                ].map(({ key, label, placeholder, type, opts }) => (
                  <div key={key}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
                    {type === 'select'
                      ? <select value={patrimonioForm[key] || ''} onChange={e => setPatrimonioForm((p: any) => ({ ...p, [key]: e.target.value }))}
                          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
                          <option value="">— selecione —</option>
                          {(opts || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      : <input type={type} value={patrimonioForm[key] || ''} onChange={e => setPatrimonioForm((p: any) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder}
                          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                    }
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={async () => {
                  if (!patrimonioForm.nome?.trim()) { alert('Informe o nome do item.'); return; }
                  const body = { ...patrimonioForm, id: patrimonioEditId || undefined, quantidade: parseFloat(patrimonioForm.quantidade) || 1, valor_estimado: patrimonioForm.valor_estimado ? parseFloat(patrimonioForm.valor_estimado) : undefined };
                  await fetch('/api/patrimonio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  const d = await fetch('/api/patrimonio').then(r => r.json());
                  setPatrimonio(d); setShowPatrimonioForm(false); setPatrimonioForm({}); setPatrimonioEditId(null);
                }}
                  style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#ca8a04,#a16207)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  {patrimonioEditId ? '💾 Salvar' : '+ Cadastrar Item'}
                </button>
                <button onClick={() => { setShowPatrimonioForm(false); setPatrimonioForm({}); setPatrimonioEditId(null); }}
                  style={{ padding: '10px 20px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {loadingPatrimonio ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
          ) : patrimonio.filter(p => !filterPatNucleo || p.nucleo === filterPatNucleo).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Nenhum item cadastrado ainda.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {patrimonio.filter(p => !filterPatNucleo || p.nucleo === filterPatNucleo).map(p => {
                const estadoCor: Record<string, string> = { otimo: '#16a34a', bom: '#22c55e', regular: '#ca8a04', ruim: '#dc2626', descartado: '#64748b' };
                const estadoLabel: Record<string, string> = { otimo: 'Ótimo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', descartado: 'Descartado' };
                const cor = estadoCor[p.estado] || '#64748b';
                return (
                  <div key={p.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(202,138,4,0.2)', borderLeft: `4px solid ${cor}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{p.nome}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {p.tipo} · {p.nucleo || 'Geral'} · Qtd: {p.quantidade}
                        </div>
                      </div>
                      {p.valor_estimado && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#facc15', fontSize: '0.95rem' }}>R$ {((p.valor_estimado || 0) * (p.quantidade || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>R$ {(p.valor_estimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / un</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ background: `${cor}1a`, border: `1px solid ${cor}50`, borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', color: cor, fontWeight: 700 }}>
                        {estadoLabel[p.estado] || p.estado}
                      </span>
                      {p.numero_serie && <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>🏷 {p.numero_serie}</span>}
                      {p.data_aquisicao && <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>📅 {new Date(p.data_aquisicao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => { setPatrimonioEditId(p.id); setPatrimonioForm(p); setShowPatrimonioForm(true); }}
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem' }}>✏ Editar</button>
                        <button onClick={async () => { if (!confirm('Excluir este item?')) return; await fetch('/api/patrimonio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _delete: p.id }) }); setPatrimonio(patrimonio.filter(x => x.id !== p.id)); }}
                          style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem' }}>🗑</button>
                      </div>
                    </div>
                    {p.notas && <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>📝 {p.notas}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== ABA RASCUNHOS ===== */}
      {activeTab === 'rascunhos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fbbf24' }}>📋 Cadastro de Responsável por Núcleo</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 2 }}>Gerencie responsáveis por núcleo e acompanhe cadastros incompletos</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => { setShowRascunhoNew(true); setNewRascunhoForm({ nucleo: nucleoFilter || '' }); }}
                style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>+ Novo Rascunho</button>
              <button onClick={() => { setLoadingRascunhos(true); fetch('/api/rascunhos').then(r => r.json()).then(d => { setRascunhos(d); setRascunhosCount(d.length); setLoadingRascunhos(false); }).catch(() => setLoadingRascunhos(false)); }}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>↻ Atualizar</button>
              {activeNucleo === 'geral' && (
                <button onClick={async () => {
                  if (!confirm('Renumerar matrículas de todos os alunos? O André será ACCBM-000001 e os demais seguirão a ordem de cadastro.')) return;
                  const res = await fetch('/api/fix-matriculas');
                  const d = await res.json();
                  if (d.ok) alert(`✅ ${d.updated || d.total} matrículas atualizadas! André = ACCBM-000001`);
                  else alert('Erro ao renumerar: ' + JSON.stringify(d));
                }}
                  style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                  🔢 Fixar Matrículas
                </button>
              )}
            </div>
          </div>

          {/* Responsáveis por Núcleo config — apenas admin geral pode gerenciar */}
          {activeNucleo === 'geral' && (() => {
            const nucleosList = [
              { key: 'edson-alves', label: 'Poliesportivo Edson Alves' },
              { key: 'ipiranga', label: 'Poliesportivo do Ipiranga' },
              { key: 'saracuruna', label: 'Saracuruna' },
              { key: 'vila-urussai', label: 'Vila Urussaí' },
              { key: 'jayme-fichman', label: 'Jayme Fichman' },
            ];
            return (
              <div style={{ background: 'var(--bg-card)', border: '2px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.9rem' }}>🔐 Responsáveis por Núcleo (login por CPF)</div>
                  {responsaveisUnlocked && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={async () => {
                        setLoadingResponsaveis(true);
                        const cfg = await fetch('/api/admin/responsaveis').then(r => r.json()).catch(() => ({ responsaveis: [] }));
                        setResponsaveis(cfg.responsaveis || []);
                        setLoadingResponsaveis(false);
                      }}
                        style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                        ↻ Recarregar
                      </button>
                      <button onClick={() => { setResponsaveisUnlocked(false); setResponsaveisLockCpf(''); setResponsaveisLockError(''); }}
                        style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                        🔒 Bloquear
                      </button>
                    </div>
                  )}
                </div>

                {/* Trava de segurança — exige senha do desenvolvedor */}
                {!responsaveisUnlocked && (
                  <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
                    <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.9rem', marginBottom: 4 }}>Acesso Exclusivo — Desenvolvedor</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: 16 }}>
                      O cadastro de responsáveis por núcleo é restrito ao desenvolvedor responsável.<br/>
                      Digite a senha de desenvolvedor para continuar.
                    </div>
                    <div style={{ display: 'flex', gap: 8, maxWidth: 340, margin: '0 auto' }}>
                      <input
                        type="password"
                        placeholder="Senha do desenvolvedor"
                        value={responsaveisLockCpf}
                        onChange={e => { setResponsaveisLockCpf(e.target.value); setResponsaveisLockError(''); }}
                        onKeyDown={async e => {
                          if (e.key !== 'Enter') return;
                          setDevLockLoading(true);
                          try {
                            const res = await fetch('/api/admin/dev-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: responsaveisLockCpf }) });
                            const json = await res.json();
                            if (json.ok) {
                              setResponsaveisUnlocked(true);
                              setResponsaveisLockError('');
                              setLoadingResponsaveis(true);
                              const resp = await fetch('/api/admin/responsaveis').then(r => r.json()).catch(() => ({ responsaveis: [] }));
                              setResponsaveis(resp.responsaveis || []);
                              setLoadingResponsaveis(false);
                            } else {
                              setResponsaveisLockError(json.error || 'Senha incorreta. Acesso negado.');
                            }
                          } catch { setResponsaveisLockError('Erro ao verificar. Tente novamente.'); }
                          setDevLockLoading(false);
                        }}
                        style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', border: `1px solid ${responsaveisLockError ? '#f87171' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                      />
                      <button
                        disabled={devLockLoading}
                        onClick={async () => {
                          setDevLockLoading(true);
                          try {
                            const res = await fetch('/api/admin/dev-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: responsaveisLockCpf }) });
                            const json = await res.json();
                            if (json.ok) {
                              setResponsaveisUnlocked(true);
                              setResponsaveisLockError('');
                              setLoadingResponsaveis(true);
                              const resp = await fetch('/api/admin/responsaveis').then(r => r.json()).catch(() => ({ responsaveis: [] }));
                              setResponsaveis(resp.responsaveis || []);
                              setLoadingResponsaveis(false);
                            } else {
                              setResponsaveisLockError(json.error || 'Senha incorreta. Acesso negado.');
                            }
                          } catch { setResponsaveisLockError('Erro ao verificar. Tente novamente.'); }
                          setDevLockLoading(false);
                        }}
                        style={{ background: devLockLoading ? '#94a3b8' : '#fbbf24', color: '#1a1a1a', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: devLockLoading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {devLockLoading ? '...' : '🔓 Confirmar'}
                      </button>
                    </div>
                    {responsaveisLockError && (
                      <div style={{ marginTop: 8, color: '#f87171', fontSize: '0.75rem', fontWeight: 700 }}>{responsaveisLockError}</div>
                    )}
                  </div>
                )}

                {/* Conteúdo só visível após desbloqueio */}
                {responsaveisUnlocked && <>
                {loadingResponsaveis ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Carregando...</div> : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {nucleosList.map(n => {
                      const resp = responsaveis.find(r => r.nucleo_key === n.key);
                      const has1 = resp?.nome?.trim() || resp?.cpf?.trim();
                      const has2 = (resp as any)?.nome2?.trim() || (resp as any)?.cpf2?.trim();
                      const hasAny = has1 || has2;
                      return (
                        <div key={n.key} style={{ background: hasAny ? 'rgba(22,163,74,0.05)' : 'var(--bg-input)', border: `1px solid ${hasAny ? 'rgba(22,163,74,0.2)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px' }}>
                          {/* Núcleo header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', flex: 1, color: 'var(--text-primary)' }}>{n.label}</span>
                          </div>

                          {/* Responsável 1 */}
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fbbf24', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10, padding: '1px 8px' }}>👤 Responsável 1</span>
                              {has1 && <span style={{ color: '#4ade80', fontSize: '0.68rem' }}>✓ cadastrado</span>}
                              {has1 && (
                                <button onClick={async () => {
                                  if (!confirm(`Remover Responsável 1 do ${n.label}?`)) return;
                                  const cfg = await fetch('/api/admin/responsaveis').then(r => r.json()).catch(() => ({ responsaveis: [] }));
                                  const currentList: typeof responsaveis = cfg.responsaveis || [];
                                  const updated = currentList.map((r: any) => r.nucleo_key === n.key ? { ...r, nome: '', cpf: '' } : r)
                                    .filter((r: any) => r.nome?.trim() || r.nome2?.trim());
                                  setResponsaveis(updated);
                                  const res = await fetch('/api/admin/responsaveis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsaveis: updated }) });
                                  if (res.ok) { setResponsaveisMsg('✓ Responsável 1 removido!'); } else { setResponsaveisMsg('Erro ao remover.'); }
                                  setTimeout(() => setResponsaveisMsg(''), 3000);
                                }}
                                  style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>
                                  🗑 Remover
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <input type="text" placeholder="Nome completo"
                                value={responsaveis.find(r => r.nucleo_key === n.key)?.nome || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setResponsaveis(prev => {
                                    const idx = prev.findIndex(r => r.nucleo_key === n.key);
                                    const existing = prev[idx] || { nucleo_key: n.key, nucleo_label: n.label, nome: '', cpf: '' };
                                    const item = { ...existing, nome: val };
                                    if (idx >= 0) { const c = [...prev]; c[idx] = item; return c; }
                                    return [...prev, item];
                                  });
                                }}
                                style={{ padding: '7px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }}
                              />
                              <input type="text" placeholder="CPF (senha de acesso)"
                                value={responsaveis.find(r => r.nucleo_key === n.key)?.cpf || ''}
                                onChange={e => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  setResponsaveis(prev => {
                                    const idx = prev.findIndex(r => r.nucleo_key === n.key);
                                    const existing = prev[idx] || { nucleo_key: n.key, nucleo_label: n.label, nome: '', cpf: '' };
                                    const item = { ...existing, cpf: val };
                                    if (idx >= 0) { const c = [...prev]; c[idx] = item; return c; }
                                    return [...prev, item];
                                  });
                                }}
                                style={{ padding: '7px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }}
                              />
                            </div>
                          </div>

                          {/* Responsável 2 */}
                          <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '1px 8px' }}>👤 Responsável 2 <span style={{ opacity: 0.6 }}>(opcional)</span></span>
                              {has2 && <span style={{ color: '#4ade80', fontSize: '0.68rem' }}>✓ cadastrado</span>}
                              {has2 && (
                                <button onClick={async () => {
                                  if (!confirm(`Remover Responsável 2 do ${n.label}?`)) return;
                                  const cfg = await fetch('/api/admin/responsaveis').then(r => r.json()).catch(() => ({ responsaveis: [] }));
                                  const currentList: typeof responsaveis = cfg.responsaveis || [];
                                  const updated = currentList.map((r: any) => r.nucleo_key === n.key ? { ...r, nome2: undefined, cpf2: undefined } : r);
                                  setResponsaveis(updated);
                                  const res = await fetch('/api/admin/responsaveis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsaveis: updated }) });
                                  if (res.ok) { setResponsaveisMsg('✓ Responsável 2 removido!'); } else { setResponsaveisMsg('Erro ao remover.'); }
                                  setTimeout(() => setResponsaveisMsg(''), 3000);
                                }}
                                  style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>
                                  🗑 Remover
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <input type="text" placeholder="Nome completo"
                                value={(responsaveis.find(r => r.nucleo_key === n.key) as any)?.nome2 || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setResponsaveis(prev => {
                                    const idx = prev.findIndex(r => r.nucleo_key === n.key);
                                    const existing = prev[idx] || { nucleo_key: n.key, nucleo_label: n.label, nome: '', cpf: '' };
                                    const item = { ...existing, nome2: val };
                                    if (idx >= 0) { const c = [...prev]; c[idx] = item; return c; }
                                    return [...prev, item];
                                  });
                                }}
                                style={{ padding: '7px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }}
                              />
                              <input type="text" placeholder="CPF (senha de acesso)"
                                value={(responsaveis.find(r => r.nucleo_key === n.key) as any)?.cpf2 || ''}
                                onChange={e => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  setResponsaveis(prev => {
                                    const idx = prev.findIndex(r => r.nucleo_key === n.key);
                                    const existing = prev[idx] || { nucleo_key: n.key, nucleo_label: n.label, nome: '', cpf: '' };
                                    const item = { ...existing, cpf2: val };
                                    if (idx >= 0) { const c = [...prev]; c[idx] = item; return c; }
                                    return [...prev, item];
                                  });
                                }}
                                style={{ padding: '7px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }}
                              />
                            </div>
                            {/* Mensagem de confirmação abaixo do Responsável 2 */}
                            {responsaveisSavedMsg[n.key] && (
                              <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 7, color: '#4ade80', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                {responsaveisSavedMsg[n.key]}
                              </div>
                            )}
                          </div>

                          {/* Botão salvar individual do núcleo */}
                          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={async () => {
                              setResponsaveisMsg('');
                              const cfg = await fetch('/api/admin/responsaveis').then(r => r.json()).catch(() => ({ responsaveis: [] }));
                              const currentList: any[] = cfg.responsaveis || [];
                              const thisEntry = responsaveis.find((r: any) => r.nucleo_key === n.key) as any;
                              const entry = {
                                nucleo_key: n.key,
                                nucleo_label: n.label,
                                nome: thisEntry?.nome?.trim() || '',
                                cpf: thisEntry?.cpf?.trim() || '',
                                nome2: thisEntry?.nome2?.trim() || undefined,
                                cpf2: thisEntry?.cpf2?.trim() ? thisEntry.cpf2.replace(/\D/g,'') : undefined,
                              };
                              const idx = currentList.findIndex((r: any) => r.nucleo_key === n.key);
                              const updated = idx >= 0
                                ? currentList.map((r: any) => r.nucleo_key === n.key ? entry : r)
                                : [...currentList, entry];
                              const res = await fetch('/api/admin/responsaveis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsaveis: updated }) });
                              if (res.ok) {
                                setResponsaveis(updated);
                                const savedNome2 = entry.nome2;
                                const msg = savedNome2
                                  ? `✓ ${n.label} salvo! Responsável 2: ${savedNome2}`
                                  : `✓ ${n.label} salvo com sucesso!`;
                                setResponsaveisSavedMsg(prev => ({ ...prev, [n.key]: msg }));
                                setTimeout(() => setResponsaveisSavedMsg(prev => { const c = {...prev}; delete c[n.key]; return c; }), 4000);
                              } else {
                                setResponsaveisMsg('Erro ao salvar.');
                                setTimeout(() => setResponsaveisMsg(''), 3000);
                              }
                            }}
                              style={{ background: '#fbbf24', color: '#1a1a1a', border: 'none', borderRadius: 7, padding: '7px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                              💾 Salvar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button onClick={async () => {
                        setResponsaveisMsg('');
                        const filtered = responsaveis
                          .map((r: any) => ({
                            ...r,
                            nome: r.nome?.trim() || '',
                            cpf: r.cpf?.trim() || '',
                            nome2: r.nome2?.trim() || undefined,
                            cpf2: r.cpf2?.trim() ? r.cpf2.replace(/\D/g,'') : undefined,
                          }))
                          .filter((r: any) => r.nome || r.cpf || r.nome2 || r.cpf2);
                        const res = await fetch('/api/admin/responsaveis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsaveis: filtered }) });
                        if (res.ok) { setResponsaveisMsg('✓ Todos os responsáveis salvos!'); } else { setResponsaveisMsg('Erro ao salvar'); }
                        setTimeout(() => setResponsaveisMsg(''), 3000);
                      }}
                        style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, padding: '9px 22px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                        💾 Salvar Todos
                      </button>
                      {responsaveisMsg && <span style={{ fontSize: '0.8rem', color: responsaveisMsg.includes('Erro') || responsaveisMsg.includes('Preencha') ? '#f87171' : '#4ade80', fontWeight: 700 }}>{responsaveisMsg}</span>}
                    </div>
                  </div>
                )}
                </>}
              </div>
            );
          })()}

          {/* Draft list */}
          {loadingRascunhos ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando cadastros incompletos...</div>
          ) : (() => {
            const filteredRascunhos = !nucleoFilter ? rascunhos : rascunhos.filter((r: any) => (r.nucleo || '') === nucleoFilter);
            const totalOk = filteredRascunhos.filter((r: any) => (r.dados_pendentes || []).length === 0).length;
            const totalPend = filteredRascunhos.filter((r: any) => (r.dados_pendentes || []).length > 0).length;
            return filteredRascunhos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>✅ Nenhum cadastro em rascunho{nucleoFilter ? ` para ${nucleoFilter}` : ''}.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {/* Summary bar */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, color: '#4ade80' }}>
                    ✅ {totalOk} completo{totalOk !== 1 ? 's' : ''} — prontos para finalizar
                  </div>
                  {totalPend > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24' }}>
                      ⚠️ {totalPend} com dados pendentes
                    </div>
                  )}
                </div>

                {filteredRascunhos.map((r: any) => {
                  const pendentes: string[] = r.dados_pendentes || [];
                  const isCompleto = pendentes.length === 0;
                  const borderColor = isCompleto ? '#22c55e' : '#f59e0b';
                  const bgAccent = isCompleto ? 'rgba(34,197,94,0.04)' : 'rgba(251,191,36,0.04)';

                  // Build WhatsApp link
                  const waPhone = (() => {
                    const tel = (r.telefone || '').replace(/\D/g, '');
                    return tel.startsWith('55') ? tel : `55${tel}`;
                  })();
                  const waNome = (r.nome_completo || 'Aluno').split(' ')[0];
                  const waMsg = isCompleto
                    ? encodeURIComponent(`Olá ${waNome}! Seu pré-cadastro na Associação Cultural de Capoeira Barão de Mauá está completo e pronto para ser finalizado pelo responsável do núcleo. Em breve você receberá a confirmação. 🥋`)
                    : encodeURIComponent(`Olá ${waNome}! Seu pré-cadastro na Associação Cultural de Capoeira Barão de Mauá precisa de atenção.\n\n📋 *Dados que ainda precisam ser preenchidos:*\n${pendentes.map((p: string) => `• ${p}`).join('\n')}\n\nAcesse o link do formulário, corrija as informações e salve novamente para completar seu cadastro. 🥋`);

                  return (
                    <div key={r.id} style={{ background: bgAccent as any, border: `2px solid ${borderColor}33`, borderLeft: `4px solid ${borderColor}`, borderRadius: 12, overflow: 'hidden' }}>
                      {/* Card header — click to expand */}
                      <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                        onClick={() => setRascunhoExpanded(rascunhoExpanded === r.id ? null : r.id)}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: isCompleto ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)', border: `2px solid ${borderColor}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                          {isCompleto ? '✅' : '📝'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.nome_completo || '(sem nome)'}</span>
                            {isCompleto ? (
                              <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: '0.68rem', fontWeight: 700 }}>
                                ✅ COMPLETO — PRONTO PARA FINALIZAR
                              </span>
                            ) : (
                              <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: '0.68rem', fontWeight: 700 }}>
                                ⚠️ {pendentes.length} DADO{pendentes.length !== 1 ? 'S' : ''} PENDENTE{pendentes.length !== 1 ? 'S' : ''}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <span>📍 {r.nucleo || '—'}</span>
                            <span>📞 {r.telefone || '—'}</span>
                            <span>🕐 {r.updated_at ? new Date(r.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ transform: rascunhoExpanded === r.id ? 'rotate(90deg)' : 'none', transition: '0.2s', flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                      </div>

                      {rascunhoExpanded === r.id && (
                        <div style={{ borderTop: `1px solid ${borderColor}33`, padding: '16px' }}>

                          {/* ── Status diagnosis ── */}
                          {isCompleto ? (
                            <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#4ade80', marginBottom: 4 }}>✅ Cadastro completo</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                Todos os dados obrigatórios foram preenchidos. Este rascunho está pronto para ser <strong style={{ color: '#4ade80' }}>finalizado</strong> — clique em "✅ Finalizar Cadastro" abaixo para incluir o aluno no sistema.
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, marginBottom: 10 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fbbf24', marginBottom: 8 }}>
                                  ⚠️ Por que está em rascunho? — Dados obrigatórios faltando:
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {pendentes.map((p: string) => (
                                    <span key={p} style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, padding: '3px 10px', fontSize: '0.73rem', fontWeight: 700 }}>
                                      ✗ {p}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {r.telefone ? (
                                <div style={{ padding: '9px 13px', background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 8, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                  💬 O aluno pode ser notificado via WhatsApp para preencher os dados que faltam. Use o botão abaixo.
                                </div>
                              ) : (
                                <div style={{ padding: '9px 13px', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, fontSize: '0.76rem', color: '#f87171' }}>
                                  📵 Telefone não cadastrado — não é possível notificar o aluno via WhatsApp.
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Data preview ── */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px,1fr))', gap: 7, marginBottom: 14, fontSize: '0.78rem' }}>
                            {[
                              ['Nome', r.nome_completo], ['CPF', r.cpf], ['Identidade', r.identidade],
                              ['Nascimento', r.data_nascimento], ['Telefone', r.telefone], ['E-mail', r.email],
                              ['Núcleo', r.nucleo], ['Graduação', r.graduacao], ['CEP', r.cep],
                              ['Endereço', r.endereco ? `${r.endereco}, ${r.numero}` : null],
                              ['Bairro', r.bairro], ['Cidade/UF', r.cidade ? `${r.cidade}/${r.estado}` : null],
                              ['Responsável', r.nome_responsavel], ['CPF Resp.', r.cpf_responsavel],
                            ].map(([l, v]) => (
                              <div key={l as string} style={{ background: v ? 'var(--bg-input)' : 'rgba(220,38,38,0.06)', border: `1px solid ${v ? 'var(--border)' : 'rgba(220,38,38,0.2)'}`, borderRadius: 7, padding: '7px 10px' }}>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.67rem', marginBottom: 2 }}>{l as string}</div>
                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: v ? 'var(--text-primary)' : '#f87171', fontStyle: v ? 'normal' : 'italic', fontSize: '0.8rem' }}>
                                  {(v as string) || '— pendente'}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* ── Actions ── */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button onClick={() => { setRascunhoEditId(r.id); setRascunhoEditForm({ ...r }); setRascunhoFotoFile(null); }}
                              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                              ✏ Editar
                            </button>

                            <button
                              onClick={async () => {
                                if (!isCompleto) {
                                  if (!confirm(`Este cadastro ainda tem ${pendentes.length} dado(s) pendente(s): ${pendentes.join(', ')}.\n\nDeseja finalizar mesmo assim?`)) return;
                                } else {
                                  if (!confirm(`Finalizar cadastro de ${r.nome_completo}?\n\nO rascunho será removido e o aluno incluído no sistema.`)) return;
                                }
                                setRascunhoSaving(true);
                                try {
                                  const payload: Record<string, any> = { ...r };
                                  delete payload.id; delete payload.updated_at; delete payload.dados_pendentes;
                                  delete payload.inscricao_numero; delete payload.ordem_inscricao;
                                  payload.created_at = new Date().toISOString();

                                  // Usa a API route server-side — trata NOT NULL constraints e colunas faltantes automaticamente
                                  const res = await fetch('/api/inscricao', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ payload }),
                                  });
                                  const result = await res.json();
                                  if (!res.ok) {
                                    alert('Erro ao inserir aluno: ' + (result.error || `HTTP ${res.status}`));
                                    setRascunhoSaving(false);
                                    return;
                                  }

                                  await fetch('/api/rascunhos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _delete: r.id }) });
                                  setRascunhos((prev: any[]) => prev.filter((x: any) => x.id !== r.id));
                                  setRascunhosCount(c => Math.max(0, c - 1));
                                  await fetchStudents();
                                  alert(`✅ ${r.nome_completo || 'Aluno'} cadastrado com sucesso! O número de matrícula foi atribuído automaticamente.`);
                                } catch (e: any) { alert('Erro: ' + e.message); }
                                setRascunhoSaving(false);
                              }}
                              disabled={rascunhoSaving}
                              style={{
                                background: isCompleto ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'rgba(22,163,74,0.1)',
                                border: isCompleto ? 'none' : '1px solid rgba(22,163,74,0.3)',
                                color: isCompleto ? '#fff' : '#4ade80',
                                borderRadius: 8, padding: '8px 16px', cursor: rascunhoSaving ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                boxShadow: isCompleto ? '0 2px 8px rgba(22,163,74,0.4)' : 'none',
                              }}>
                              {rascunhoSaving ? '⏳ Finalizando...' : isCompleto ? '✅ Finalizar Cadastro' : '⚠️ Finalizar com pendências'}
                            </button>

                            {/* WhatsApp notification */}
                            {r.telefone && (
                              <a
                                href={`https://api.whatsapp.com/send?phone=${waPhone}&text=${waMsg}`}
                                target="_blank" rel="noreferrer"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  background: isCompleto ? 'rgba(37,211,102,0.12)' : '#16a34a',
                                  color: isCompleto ? '#25d366' : '#fff',
                                  border: isCompleto ? '1px solid rgba(37,211,102,0.3)' : 'none',
                                  borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none'
                                }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                {isCompleto ? '💬 Avisar que está pronto' : '💬 Cobrar dados pendentes'}
                              </a>
                            )}

                            <button onClick={async () => {
                              if (!confirm('Excluir este rascunho permanentemente?')) return;
                              await fetch('/api/rascunhos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _delete: r.id }) });
                              setRascunhos((prev: any[]) => prev.filter((x: any) => x.id !== r.id));
                              setRascunhosCount(c => Math.max(0, c - 1));
                            }}
                              style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, marginLeft: 'auto' }}>
                              🗑 Excluir
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      </div>

      {/* ── Modal Relatório de Alunos ── */}
      {relAlunosOpen && (
        <div className="modal-overlay" onClick={() => setRelAlunosOpen(false)} style={{ zIndex: 1100 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 780, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)', borderRadius: '12px 12px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '-24px -24px 20px -24px' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>📋 Relatório de Alunos</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', marginTop: 2 }}>Presenças mensais por aluno</div>
              </div>
              <button onClick={() => setRelAlunosOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Mês de referência</span>
                <input type="month" value={relAlunosMes} onChange={e => {
                  setRelAlunosMes(e.target.value);
                  const mes = e.target.value;
                  const nucleo = relAlunosNucleo;
                  const base = (nucleoFilter ? students.filter(s => s.nucleo === nucleoFilter) : students)
                    .filter(s => !nucleo || s.nucleo === nucleo);
                  const contaEmailMes = (sid: string) => alunoContas.find((a: AlunoAccount) => a.student_id === sid)?.email || '';
                  const list: RelAlunoItem[] = base.map(s => ({
                    id: s.id, nome: s.nome_completo || '—', graduacao: s.graduacao || '—',
                    dias: (relatorioHistorico[s.id] || []).filter((d: string) => d.startsWith(mes)).length,
                    email: s.email || contaEmailMes(s.id), telefone: s.telefone || '',
                  }));
                  list.sort((a,b) => b.dias - a.dias);
                  const custom = relAlunosList.filter(x => x.custom);
                  setRelAlunosList([...list, ...custom]);
                }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
              </div>
              {!nucleoFilter && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Núcleo</span>
                  <select value={relAlunosNucleo} onChange={e => {
                    const nucleo = e.target.value;
                    setRelAlunosNucleo(nucleo);
                    const base = students.filter(s => !nucleo || s.nucleo === nucleo);
                    const contaEmailNuc = (sid: string) => alunoContas.find((a: AlunoAccount) => a.student_id === sid)?.email || '';
                    const list: RelAlunoItem[] = base.map(s => ({
                      id: s.id, nome: s.nome_completo || '—', graduacao: s.graduacao || '—',
                      dias: (relatorioHistorico[s.id] || []).filter((d: string) => d.startsWith(relAlunosMes)).length,
                      email: s.email || contaEmailNuc(s.id), telefone: s.telefone || '',
                    }));
                    list.sort((a,b) => b.dias - a.dias);
                    setRelAlunosList(list);
                  }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    <option value="">Todos os núcleos</option>
                    <option value="Saracuruna">Saracuruna</option>
                    <option value="Poliesportivo Edson Alves">Poliesportivo Edson Alves</option>
                    <option value="Poliesportivo do Ipiranga">Poliesportivo do Ipiranga</option>
                    <option value="Vila Urussaí">Vila Urussaí</option>
                    <option value="Jayme Fichman">Jayme Fichman</option>
                  </select>
                </div>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  const mesLabel = relAlunosMes ? new Date(relAlunosMes + '-01T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' }) : relAlunosMes;
                  const nucleoLabel = relAlunosNucleo || (nucleoFilter || 'Todos os Núcleos');
                  const origin = typeof window !== 'undefined' ? window.location.origin : '';
                  const rows = relAlunosList.map((al, i) => `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
                    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:0.82em;color:#1d4ed8;font-weight:700">${i+1}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700">${al.nome}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#b45309;font-weight:600">${al.graduacao}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:0.82em">${al.email || '—'}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:0.82em;white-space:nowrap">${al.telefone || '—'}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;color:${al.dias>0?'#15803d':'#94a3b8'}">${al.dias}</td>
                  </tr>`).join('');
                  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório de Alunos</title>
                  <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:24px 28px;color:#1e293b;font-size:11px}
                  .header{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:3px solid #0891b2;margin-bottom:14px}
                  .header img{height:72px;width:72px;object-fit:contain;flex-shrink:0}
                  .assoc{font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px}
                  .title{font-size:1.2rem;font-weight:800;color:#0891b2;margin:0 0 2px}
                  .sub{font-size:0.82rem;color:#64748b;margin-bottom:4px}
                  table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0}
                  thead tr{background:#0891b2;color:#fff}
                  thead td{padding:9px 12px;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
                  .footer{margin-top:20px;display:flex;justify-content:space-between;border-top:2px solid #e2e8f0;padding-top:12px;font-size:0.72rem;color:#64748b}
                  .sig{width:180px;text-align:center}.sig-line{border-top:1px solid #334155;margin:36px 0 4px}
                  @media print{body{padding:14px};@page{size:A4 landscape;margin:1cm}}</style></head>
                  <body>
                  <div class="header">
                    <img src="${origin}/logo-barao-maua.png" alt="ACCBM" onerror="this.src='${origin}/logo-accbm.jpeg'"/>
                    <div><div class="assoc">Associação Cultural de Capoeira Barão de Mauá</div>
                    <div class="title">📋 Relatório de Alunos</div>
                    <div class="sub">Núcleo: <strong>${nucleoLabel}</strong> &nbsp;|&nbsp; Mês: <strong>${mesLabel}</strong> &nbsp;|&nbsp; Total: <strong>${relAlunosList.length} alunos</strong></div></div>
                  </div>
                  <table><thead><tr><td>#</td><td>Nome Completo</td><td>Graduação Atual</td><td>E-mail</td><td>Telefone</td><td style="text-align:center">Dias Treinados</td></tr></thead>
                  <tbody>${rows}</tbody></table>
                  <div class="footer">
                    <div>Gerado em ${new Date().toLocaleString('pt-BR')}</div>
                    <div class="sig"><div class="sig-line"></div>Responsável / Mestre</div>
                  </div></body></html>`;
                  const w = window.open('', '_blank');
                  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                }} style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                  🖨 Imprimir / PDF
                </button>
              </div>
            </div>

            {/* Tabela de alunos */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(8,145,178,0.12)' }}>
                    <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>#</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Nome Completo</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Graduação</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>E-mail</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Telefone</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Dias</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {relAlunosList.map((al, i) => (
                    <tr key={al.id} style={{ borderTop: '1px solid var(--border)' }}>
                      {relAlunosEdit === al.id ? (
                        <>
                          <td style={{ padding: '6px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{i+1}</td>
                          <td style={{ padding: '6px 8px' }}><input value={relAlunosEditVal.nome} onChange={e => setRelAlunosEditVal(v => ({...v, nome: e.target.value}))} style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.82rem' }} /></td>
                          <td style={{ padding: '6px 8px' }}><input value={relAlunosEditVal.graduacao} onChange={e => setRelAlunosEditVal(v => ({...v, graduacao: e.target.value}))} style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.82rem' }} /></td>
                          <td style={{ padding: '6px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{al.email || '—'}</td>
                          <td style={{ padding: '6px 8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{al.telefone || '—'}</td>
                          <td style={{ padding: '6px 8px' }}><input type="number" min="0" value={relAlunosEditVal.dias} onChange={e => setRelAlunosEditVal(v => ({...v, dias: Number(e.target.value)}))} style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.82rem', textAlign: 'center' }} /></td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button onClick={() => { setRelAlunosList(list => list.map(x => x.id === al.id ? {...x, ...relAlunosEditVal} : x)); setRelAlunosEdit(null); }} style={{ background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem', marginRight: 4 }}>✓</button>
                            <button onClick={() => setRelAlunosEdit(null)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{i+1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: '0.88rem' }}>{al.nome}</td>
                          <td style={{ padding: '8px 12px', fontSize: '0.82rem', color: '#b45309' }}>{al.graduacao}</td>
                          <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{al.email || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>—</span>}</td>
                          <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{al.telefone || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>—</span>}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: al.dias > 0 ? '#16a34a' : 'var(--text-secondary)', fontSize: '0.95rem' }}>{al.dias}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button onClick={() => { setRelAlunosEdit(al.id); setRelAlunosEditVal({nome: al.nome, graduacao: al.graduacao, dias: al.dias}); }} style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem', marginRight: 4 }}>✏</button>
                            <button onClick={() => setRelAlunosList(list => list.filter(x => x.id !== al.id))} style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }}>🗑</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Adicionar aluno manual */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'rgba(8,145,178,0.04)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>➕ Adicionar aluno manualmente</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Nome</div>
                  <input value={relAlunosNewNome} onChange={e => setRelAlunosNewNome(e.target.value)} placeholder="Nome completo" style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Graduação</div>
                  <input value={relAlunosNewGrad} onChange={e => setRelAlunosNewGrad(e.target.value)} placeholder="Ex: Corda Crua" style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                </div>
                <div style={{ width: 80 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Dias</div>
                  <input type="number" min="0" value={relAlunosNewDias} onChange={e => setRelAlunosNewDias(e.target.value)} placeholder="0" style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.82rem', textAlign: 'center' }} />
                </div>
                <button onClick={() => {
                  if (!relAlunosNewNome.trim()) return;
                  setRelAlunosList(list => [...list, { id: `custom_${Date.now()}`, nome: relAlunosNewNome.trim(), graduacao: relAlunosNewGrad || '—', dias: Number(relAlunosNewDias) || 0, custom: true }]);
                  setRelAlunosNewNome(''); setRelAlunosNewGrad(''); setRelAlunosNewDias('');
                }} style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ✅ Incluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gráfico Individual por Aluno ── */}
      {indivChartOpen && (
        <div className="modal-overlay" onClick={() => setIndivChartOpen(false)} style={{ zIndex: 1100 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, width: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', borderRadius: '12px 12px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '-24px -24px 20px -24px' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>📊 Gráfico Individual de Presença</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.75rem', marginTop: 2 }}>Busque um aluno pelo nome ou CPF</div>
              </div>
              <button onClick={() => setIndivChartOpen(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Digite o nome ou CPF do aluno..."
                value={indivSearch}
                onChange={e => setIndivSearch(e.target.value)}
                autoFocus
                style={{ flex: 1, background: 'var(--bg-input)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.92rem', outline: 'none' }}
              />
            </div>

            {/* Dropdown results */}
            {indivSearch.trim().length >= 2 && !indivStudent && (() => {
              const q = indivSearch.trim().toLowerCase().replace(/\D/g,'');
              const results = students.filter(s => {
                const nameMatch = s.nome_completo.toLowerCase().includes(indivSearch.trim().toLowerCase());
                const cpfMatch = q.length >= 3 && s.cpf.replace(/\D/g,'').includes(q);
                return nameMatch || cpfMatch;
              }).slice(0, 8);
              if (results.length === 0) return (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  Nenhum aluno encontrado.
                </div>
              );
              return (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                  {results.map((s, i) => (
                    <div key={s.id}
                      onClick={async () => {
                        setIndivStudent(s);
                        setIndivLoading(true);
                        try {
                          const res = await fetch('/api/checkins/historico?days=365');
                          const data: Record<string, string[]> = await res.json();
                          setIndivHistorico(data[s.id] || []);
                        } catch { setIndivHistorico([]); }
                        setIndivLoading(false);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-input)', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.15s' }}
                    >
                      {s.foto_url
                        ? <img src={s.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }} />
                        : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-input)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                          </div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nome_completo}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.graduacao} · {s.nucleo || '—'}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Loading */}
            {indivLoading && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <div style={{ display: 'inline-block', animation: 'spin 0.7s linear infinite', fontSize: '1.5rem' }}>↻</div>
                <div style={{ marginTop: 8, fontSize: '0.88rem' }}>Carregando histórico...</div>
              </div>
            )}

            {/* Chart */}
            {indivStudent && !indivLoading && (() => {
              const dias = indivHistorico;
              // Group by YYYY-MM
              const monthMap: Record<string, number> = {};
              dias.forEach(d => {
                const ym = d.slice(0, 7);
                monthMap[ym] = (monthMap[ym] || 0) + 1;
              });
              const months = Object.keys(monthMap).sort();

              // Also include months with 0 check-ins from the last 12 months
              const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
              for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                if (!monthMap[ym]) monthMap[ym] = 0;
              }
              const allMonths = Object.keys(monthMap).sort().slice(-12);

              const totalDias = dias.length;
              const monthLabel = (ym: string) => {
                const [y, m] = ym.split('-');
                const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                return `${names[parseInt(m)-1]}/${y.slice(2)}`;
              };
              const maxCount = Math.max(...allMonths.map(m => monthMap[m] || 0), 1);
              const barW = Math.max(26, Math.min(52, Math.floor((580 - 80) / allMonths.length - 8)));
              const svgW = allMonths.length * (barW + 8) + 100;
              const svgH = 260;
              const chartBottom = svgH - 50;
              const chartTop = 30;
              const chartH = chartBottom - chartTop;

              const printIndiv = () => {
                const pw = window.open('', '_blank');
                if (!pw) return;
                const svgEl = document.getElementById('grafico-indiv-svg');
                const svgHtml = svgEl ? svgEl.outerHTML : '';
                const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Frequência — ${indivStudent!.nome_completo}</title>
                  <style>*{margin:0;padding:0;box-sizing:border-box;} @page{size:A4 landscape;margin:15mm} body{font-family:Arial,sans-serif;padding:20px;background:#fff;} h1{font-size:15px;color:#7c3aed;margin-bottom:2px;} .sub{font-size:10px;color:#64748b;margin-bottom:14px;} svg{width:100%;} .stat{display:inline-block;margin-right:20px;font-size:11px;} .stat strong{font-size:14px;display:block;}</style>
                  </head><body>
                  <h1>📊 Relatório Individual de Frequência — ${indivStudent!.nome_completo}</h1>
                  <div class="sub">Gerado em ${dateStr} · ${indivStudent!.nucleo || '—'} · ${indivStudent!.graduacao}</div>
                  <div style="margin-bottom:12px">
                    <span class="stat"><strong style="color:#7c3aed">${totalDias}</strong>Presenças (12 meses)</span>
                    <span class="stat"><strong style="color:#16a34a">${allMonths.length > 0 ? Math.round(totalDias / allMonths.length * 10) / 10 : 0}</strong>Média/mês</span>
                  </div>
                  ${svgHtml}
                  <script>window.onload=()=>{window.print();setTimeout(()=>pw.close(),1500);}<\/script>
                  </body></html>`);
                pw.document.close();
              };

              return (
                <div>
                  {/* Back + info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <button onClick={() => { setIndivStudent(null); setIndivHistorico([]); }}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      ← Trocar
                    </button>
                    {indivStudent.foto_url
                      ? <img src={indivStudent.foto_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #7c3aed', flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                        </div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{indivStudent.nome_completo}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{indivStudent.graduacao} · {indivStudent.nucleo || '—'}</div>
                    </div>
                    <button onClick={printIndiv}
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      Imprimir
                    </button>
                  </div>

                  {/* Summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                    {[
                      { label: 'Total de Presenças', value: totalDias, color: '#7c3aed' },
                      { label: 'Média por Mês', value: `${allMonths.length > 0 ? (totalDias / allMonths.length).toFixed(1) : 0}`, color: '#16a34a' },
                      { label: 'Mês mais frequente', value: allMonths.length > 0 ? monthLabel(allMonths.reduce((a, b) => (monthMap[a] || 0) >= (monthMap[b] || 0) ? a : b)) : '—', color: '#d97706' },
                    ].map(st => (
                      <div key={st.label} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: st.color }}>{st.value}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{st.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* SVG bar chart */}
                  <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 6px', overflowX: 'auto' }}>
                    <svg id="grafico-indiv-svg" width={svgW} height={svgH} style={{ display: 'block', minWidth: '100%' }}>
                      {/* Grid lines */}
                      {[0, 25, 50, 75, 100].map(pct => {
                        const count = Math.round((pct / 100) * maxCount);
                        const y = chartBottom - (pct / 100) * chartH;
                        return (
                          <g key={pct}>
                            <line x1={55} y1={y} x2={svgW - 10} y2={y} stroke="var(--border)" strokeDasharray="3,3" strokeWidth={0.7} />
                            <text x={50} y={y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize={9}>{count}</text>
                          </g>
                        );
                      })}
                      {/* Bars */}
                      {allMonths.map((ym, i) => {
                        const count = monthMap[ym] || 0;
                        const x = 60 + i * (barW + 8);
                        const barH = Math.max(2, (count / maxCount) * chartH);
                        const y = chartBottom - barH;
                        const color = count === 0 ? 'var(--border)' : count >= maxCount * 0.75 ? '#16a34a' : count >= maxCount * 0.4 ? '#d97706' : '#dc2626';
                        return (
                          <g key={ym}>
                            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={color} opacity={0.92} />
                            {count > 0 && <text x={x + barW / 2} y={y - 5} textAnchor="middle" fill={color} fontSize={9} fontWeight="700">{count}</text>}
                            <text x={x + barW / 2} y={chartBottom + 14} textAnchor="middle" fill="var(--text-secondary)" fontSize={9}>{monthLabel(ym)}</text>
                          </g>
                        );
                      })}
                      {/* Axis */}
                      <line x1={55} y1={chartTop} x2={55} y2={chartBottom} stroke="var(--border)" strokeWidth={1} />
                      <line x1={55} y1={chartBottom} x2={svgW - 10} y2={chartBottom} stroke="var(--border)" strokeWidth={1} />
                      {/* Y-axis label */}
                      <text x={12} y={chartTop + chartH / 2} textAnchor="middle" fill="var(--text-secondary)" fontSize={9} transform={`rotate(-90,12,${chartTop + chartH / 2})`}>Presenças</text>
                    </svg>
                  </div>

                  {/* Monthly cards */}
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 0 4px', scrollbarWidth: 'thin' }}>
                    {allMonths.map(ym => {
                      const count = monthMap[ym] || 0;
                      const color = count === 0 ? '#dc2626' : count >= maxCount * 0.75 ? '#16a34a' : count >= maxCount * 0.4 ? '#d97706' : '#dc2626';
                      return (
                        <div key={ym} style={{ flexShrink: 0, background: 'var(--bg-input)', border: `1px solid ${color}40`, borderRadius: 8, padding: '8px 12px', minWidth: 70, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{monthLabel(ym)}</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{count}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>treinos</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {[['#16a34a','Alta frequência'],['#d97706','Frequência regular'],['#dc2626','Baixa frequência']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 11, height: 11, borderRadius: 3, background: c }} /> {l}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setShowCarteirinha(false); setShowHistGrad(false); setHistGradRecords([]); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
            <h2>
              Detalhes do Aluno
              <button className="modal-close" onClick={() => { setSelected(null); setShowCarteirinha(false); setShowHistGrad(false); setHistGradRecords([]); }}>&times;</button>
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
                  {nomenclaturaGraduacao[selected.graduacao] && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(220,38,38,0.12)', color: '#f87171', border: '1px solid rgba(220,38,38,0.25)' }}>
                      {nomenclaturaGraduacao[selected.graduacao]}
                    </span>
                  )}
                  {selected.nucleo && (
                    <span className={`badge ${selected.nucleo === 'Saracuruna' ? 'badge-saracuruna' : (selected.nucleo === 'Poliesportivo Edson Alves' || selected.nucleo === 'Mauá') ? 'badge-maua' : selected.nucleo === 'Poliesportivo do Ipiranga' ? 'badge-ipiranga' : selected.nucleo === 'Vila Urussaí' ? 'badge-vila-urussai' : selected.nucleo === 'Jayme Fichman' ? 'badge-jayme-fichman' : ''}`}>{selected.nucleo}</span>
                  )}
                </div>
              </div>
            </div>

            {/* ACCBM ID */}
            {(studentDisplayIds[selected.id]) && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', borderRadius: 8, padding: '6px 16px', marginBottom: 16 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 600 }}>ID ACCBM</span>
                <span style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.06em' }}>{studentDisplayIds[selected.id]}</span>
              </div>
            )}

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
                <span className="detail-label">E-mail</span>
                <span className="detail-value" style={{ color: selected.email ? 'var(--text-primary)' : 'var(--text-secondary)', fontStyle: selected.email ? 'normal' : 'italic' }}>{selected.email || 'não cadastrado'}</span>
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

            {/* ── Botão Histórico de Graduações ── */}
            <button
              onClick={() => {
                if (!showHistGrad) {
                  setHistGradForm(EMPTY_GRAD_FORM);
                  setHistGradEditing(null);
                  setHistGradMsg('');
                  loadHistGrad(selected.id);
                }
                setShowHistGrad(v => !v);
              }}
              style={{ width: '100%', marginTop: 16, padding: '11px', background: showHistGrad ? 'rgba(251,191,36,0.18)' : 'rgba(251,191,36,0.08)', border: `2px solid ${showHistGrad ? '#fbbf24' : 'rgba(251,191,36,0.35)'}`, color: '#fbbf24', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              {showHistGrad ? 'Ocultar Histórico de Graduações' : '📚 Histórico de Graduações'}
            </button>

            {/* Painel Histórico de Graduações (inline) */}
            {showHistGrad && (
              <div style={{ marginTop: 10, background: 'var(--bg-card)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, padding: '16px' }}>
                <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.9rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  {selected.nome_completo}
                </div>
                {/* Formulário */}
                <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px', marginBottom: 14 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>
                    {histGradEditing ? '✏️ Editando registro — clique em Cancelar para novo' : '➕ Novo registro'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: 3 }}>Data da Graduação *</div>
                      <input type="date" value={histGradForm.data_graduacao}
                        onChange={e => setHistGradForm(p => ({ ...p, data_graduacao: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: 3 }}>Graduação Recebida *</div>
                      <select value={histGradForm.graduacao_recebida}
                        onChange={e => setHistGradForm(p => ({ ...p, graduacao_recebida: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }}>
                        <option value="">Selecione...</option>
                        <optgroup label="── Adulto ──">
                          {GRAD_OPCOES_ADULTO.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </optgroup>
                        <optgroup label="── Infantil ──">
                          {GRAD_OPCOES_INFANTIL.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: 3 }}>Evento / Batizado</div>
                      <input type="text" placeholder="Ex: Batizado 2024" value={histGradForm.evento}
                        onChange={e => setHistGradForm(p => ({ ...p, evento: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: 3 }}>Professor Responsável *</div>
                      <input type="text" placeholder="Nome do professor" value={histGradForm.professor_responsavel}
                        onChange={e => setHistGradForm(p => ({ ...p, professor_responsavel: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
                    </div>
                    <div style={{ gridColumn: '1/-1' }}>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: 3 }}>Observações</div>
                      <textarea rows={2} placeholder="Observações opcionais..." value={histGradForm.observacoes || ''}
                        onChange={e => setHistGradForm(p => ({ ...p, observacoes: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => saveHistGrad(selected.id, histGradForm, histGradEditing)} disabled={histGradSaving}
                      style={{ background: histGradSaving ? '#94a3b8' : '#fbbf24', color: '#1a1a1a', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: '0.82rem', cursor: histGradSaving ? 'not-allowed' : 'pointer' }}>
                      {histGradSaving ? 'Salvando...' : (histGradEditing ? '💾 Atualizar' : '💾 Salvar')}
                    </button>
                    {histGradEditing && (
                      <button onClick={() => deleteHistGrad(selected.id, histGradEditing.id)}
                        style={{ background: 'rgba(220,38,38,0.1)', border: '1.5px solid rgba(220,38,38,0.4)', color: '#f87171', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        🗑 Excluir
                      </button>
                    )}
                    {histGradEditing && (
                      <button onClick={() => { setHistGradEditing(null); setHistGradForm(EMPTY_GRAD_FORM); setHistGradMsg(''); }}
                        style={{ background: 'rgba(148,163,184,0.1)', border: '1.5px solid rgba(148,163,184,0.3)', color: '#94a3b8', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        ✕ Cancelar
                      </button>
                    )}
                    {histGradMsg && (
                      <span style={{ fontSize: '0.78rem', color: histGradMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontWeight: 700 }}>{histGradMsg}</span>
                    )}
                  </div>
                </div>
                {/* Ver Cadastro do Aluno */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <a
                    href={`/admin?aluno=${selected.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                    Ver Cadastro do Aluno
                  </a>
                </div>
                {/* Lista */}
                {histGradLoading ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px', fontSize: '0.82rem' }}>Carregando...</div>
                ) : histGradRecords.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '16px', fontSize: '0.82rem' }}>Nenhum registro ainda. Adicione o primeiro acima.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {histGradRecords.map(r => {
                      const [ano, mes, dia] = r.data_graduacao.split('-');
                      const dataFmt = dia && mes && ano ? `${dia}/${mes}/${ano}` : r.data_graduacao;
                      return (
                        <div key={r.id} style={{ background: 'var(--bg-input)', border: `1px solid ${histGradEditing?.id === r.id ? 'rgba(251,191,36,0.5)' : 'var(--border)'}`, borderRadius: 9, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.88rem' }}>{r.graduacao_recebida}</span>
                              <span style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: '1px 7px', fontSize: '0.72rem', color: '#fbbf24' }}>{dataFmt}</span>
                              {r.evento && <span style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, padding: '1px 7px', fontSize: '0.72rem', color: '#93c5fd' }}>{r.evento}</span>}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Prof.: </span>{r.professor_responsavel}
                            </div>
                            {r.observacoes && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3, fontStyle: 'italic' }}>{r.observacoes}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                            <button onClick={() => { setHistGradEditing(r); setHistGradForm({ data_graduacao: r.data_graduacao, graduacao_recebida: r.graduacao_recebida, evento: r.evento, professor_responsavel: r.professor_responsavel, observacoes: r.observacoes || '' }); setHistGradMsg(''); }}
                              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>✏️ Editar</button>
                            <button onClick={() => deleteHistGrad(selected.id, r.id)}
                              style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>🗑 Excluir</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Carteirinha toggle */}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={async () => {
                  const next = !showCarteirinha;
                  setShowCarteirinha(next);
                  if (next && !(selected as any).ordem_inscricao) {
                    try {
                      const r = await fetch('/api/fix-matriculas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: selected.id, cpf: selected.cpf }),
                      });
                      const d = await r.json();
                      setAdminMatriculaNum(d.matricula ?? null);
                    } catch { setAdminMatriculaNum(null); }
                  } else {
                    setAdminMatriculaNum((selected as any).ordem_inscricao ?? null);
                  }
                }}
                style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fbbf24', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                {showCarteirinha ? 'Ocultar Credencial' : 'Credencial do Aluno'}
              </button>
              {showCarteirinha && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div ref={adminCardRef}>
                    <Carteirinha data={{
                      nome: selected.nome_completo,
                      cpf: selected.cpf,
                      identidade: selected.identidade,
                      nucleo: selected.nucleo || '',
                      graduacao: selected.graduacao,
                      tipo_graduacao: selected.tipo_graduacao,
                      foto_url: selected.foto_url,
                      menor_de_idade: selected.menor_de_idade,
                      nome_pai: selected.nome_pai || '',
                      nome_mae: selected.nome_mae || '',
                      nome_responsavel: selected.nome_responsavel,
                      cpf_responsavel: selected.cpf_responsavel,
                      inscricao_numero: adminMatriculaNum ?? (selected as any).ordem_inscricao ?? (selected as any).inscricao_numero ?? null,
                      student_id: selected.id,
                      data_nascimento: (selected as any).data_nascimento ?? null,
                    }} />
                  </div>
                  <button
                    onClick={() => printAdminCard(selected.nome_completo)}
                    style={{ padding: '10px 28px', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', border: '1px solid rgba(220,38,38,0.4)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 7 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Imprimir / Salvar PDF
                  </button>
                  <button
                    onClick={() => {
                      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inscri-o-capoeira-bar-o-de-mau.vercel.app';
                      const cpfEnc = encodeURIComponent(selected.cpf || '');
                      const url = `${base}/carteirinha${cpfEnc ? `?cpf=${cpfEnc}` : ''}`;
                      const phone = (selected.telefone || '').replace(/\D/g, '');
                      const br = phone.startsWith('55') ? phone : `55${phone}`;
                      const msg = encodeURIComponent(
`🎖️ *Carteirinha ACCBM — Capoeira Barão de Mauá*\n\nOlá, *${selected.nome_completo}*! Sua carteirinha de associado está disponível. Toque no link abaixo para visualizar e imprimir:\n\n🔗 ${url}\n\n_Associação Cultural de Capoeira Barão de Mauá_`
                      );
                      window.open(phone.length >= 10 ? `https://api.whatsapp.com/send?phone=${br}&text=${msg}` : `https://api.whatsapp.com/send?text=${msg}`, '_blank');
                    }}
                    style={{ padding: '10px 20px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.4)', color: '#25d366', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 7 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </button>
                </div>
              )}
            </div>

            {/* Documents bar for this student — single-student context */}
            <DocumentsBar
              adminAlwaysUnlocked
              studentPhone={selected.telefone}
              studentName={selected.nome_completo.split(' ')[0]}
              students={[{ id: selected.id, nome_completo: selected.nome_completo, telefone: selected.telefone, nucleo: selected.nucleo, email: selected.email }]}
            />

            {/* Generate ID if missing */}
            {!studentDisplayIds[selected.id] && (
              <button
                onClick={async () => {
                  const res = await fetch('/api/aluno/gerar-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign', student_id: selected.id }) });
                  const d = await res.json();
                  if (d.display_id) setStudentDisplayIds(prev => ({ ...prev, [selected.id]: d.display_id }));
                }}
                style={{ width: '100%', marginTop: 10, padding: '9px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                🔢 Gerar ID ACCBM para este aluno
              </button>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
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
              <button className="modal-close" onClick={() => { setEditing(null); setEditFotoFile(null); }}>&times;</button>
            </h2>

            {/* Foto do aluno */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, padding: '12px 16px', background: 'var(--bg-input)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ flexShrink: 0 }}>
                {editFotoFile ? (
                  <img src={URL.createObjectURL(editFotoFile)} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)' }} />
                ) : editForm.foto_url ? (
                  <img src={editForm.foto_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(220,38,38,0.1)', border: '3px solid rgba(220,38,38,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0112 0v2"/></svg>
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8, color: 'var(--text-primary)' }}>Foto do Aluno</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => editFotoRef.current?.click()}
                    style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--accent)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                    📷 {editFotoFile || editForm.foto_url ? 'Trocar Foto' : 'Adicionar Foto'}
                  </button>
                  {(editFotoFile || editForm.foto_url) && (
                    <button type="button" onClick={() => { setEditFotoFile(null); setEditForm(p => ({ ...p, foto_url: null })); }}
                      style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#f87171', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                      🗑 Remover Foto
                    </button>
                  )}
                  <input ref={editFotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setEditFotoFile(f); e.target.value = ''; }} />
                </div>
                {editFotoFile && <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Nova foto selecionada: {editFotoFile.name}</div>}
              </div>
            </div>

            <div className="detail-grid" style={{ gap: 14 }}>
              <div className="detail-item detail-full">
                <span className="detail-label">Nome Completo</span>
                <input className="edit-input" name="nome_completo" value={editForm.nome_completo || ''} onChange={handleEditChange} />
              </div>
              <div className="detail-item">
                <span className="detail-label">Apelido</span>
                <input className="edit-input" name="apelido" value={(editForm as any).apelido || ''} onChange={handleEditChange} placeholder="Apelido (opcional)" />
              </div>
              <div className="detail-item">
                <span className="detail-label">Nome Social</span>
                <input className="edit-input" name="nome_social" value={(editForm as any).nome_social || ''} onChange={handleEditChange} placeholder="Nome social (opcional)" />
              </div>
              <div className="detail-item detail-full">
                <span className="detail-label">Sexo</span>
                <select className="edit-input" name="sexo" value={(editForm as any).sexo || ''} onChange={handleEditChange}>
                  <option value="">Não informado</option>
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                  <option value="nao-binario">Não Binário</option>
                  <option value="outros">Outros</option>
                  <option value="nao-informado">Prefiro não informar</option>
                </select>
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
                <span className="detail-label">E-mail</span>
                <input className="edit-input" type="email" name="email" value={(editForm as any).email || ''} onChange={handleEditChange} placeholder="email@exemplo.com" />
              </div>
              <div className="detail-item">
                <span className="detail-label">Núcleo</span>
                <select className="edit-input" name="nucleo" value={editForm.nucleo || ''} onChange={handleEditChange}>
                  <option value="">Selecione</option>
                  <option value="Saracuruna">Núcleo Saracuruna</option>
                  <option value="Poliesportivo Edson Alves">Núcleo Poliesportivo Edson Alves</option>
                  <option value="Poliesportivo do Ipiranga">Núcleo Poliesportivo do Ipiranga</option>
                  <option value="Vila Urussaí">Núcleo Vila Urussaí</option>
                  <option value="Jayme Fichman">Núcleo Jayme Fichman</option>
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
                  {graduacoes.map(g => <option key={g} value={g}>{g}{nomenclaturaGraduacao[g] ? ` — ${nomenclaturaGraduacao[g]}` : ''}</option>)}
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
                {saving ? t('admin_saving') : t('admin_save')}
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
                {t('admin_confirm_delete')}
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
              Tem certeza que deseja excluir o cadastro de
            </p>
            <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 24, color: '#f87171' }}>
              {deleteConfirm.nome_completo}?
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
              {t('admin_delete_warning')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
              >
                {t('admin_cancel')}
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

      {/* Remove Checkin Confirm Modal */}
      {removeConfirm && (
        <div className="modal-overlay" onClick={() => !removing && setRemoveConfirm(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              {removing ? (
                <div style={{ width: 56, height: 56, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 32, display: 'inline-block', animation: 'spin 0.7s linear infinite' }}>↻</span>
                </div>
              ) : (
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
              )}
              <h2 style={{ fontSize: '1.2rem', marginBottom: 0, display: 'block', WebkitTextFillColor: 'var(--text-primary)' }}>
                {removing ? 'Removendo...' : 'Remover Presença'}
              </h2>
            </div>
            {!removing && <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
                Tem certeza que deseja remover a presença de
              </p>
              <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4, color: '#f87171' }}>
                {removeConfirm.nome_completo}
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
                Registrada às {removeConfirm.hora} de hoje.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setRemoveConfirm(null)}
                  style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmRemoveCheckin}
                  style={{ flex: 1, padding: '10px', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#f87171', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}
                >
                  Sim, Remover
                </button>
              </div>
            </>}
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

      {/* ===== ABA DADOS FALTANTES ===== */}
      {activeTab === 'dados-faltantes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f87171' }}>⚠ Dados Faltantes de Cadastro</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 2 }}>
                Alunos com rascunho salvo que ainda possuem informações pendentes
              </div>
            </div>
            <button onClick={() => { setLoadingRascunhos(true); fetch('/api/rascunhos').then(r => r.json()).then(d => { setRascunhos(d); setRascunhosCount(d.length); setLoadingRascunhos(false); }).catch(() => setLoadingRascunhos(false)); }}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: '0.82rem' }}>
              ↻ Atualizar
            </button>
          </div>

          {loadingRascunhos ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '20px 0' }}>Carregando...</div>
          ) : (() => {
            const lista = (nucleoFilter ? rascunhos.filter((r: any) => (r.nucleo || '') === nucleoFilter) : rascunhos)
              .filter((r: any) => (r.dados_pendentes || []).length > 0);
            return lista.length === 0 ? (
              <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700, color: '#16a34a', fontSize: '0.9rem' }}>Nenhum cadastro com dados faltantes!</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 4 }}>Todos os rascunhos do seu núcleo estão completos.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lista.map((r: any) => {
                  const pendentes: string[] = r.dados_pendentes || [];
                  const tel = (r.telefone || '').replace(/\D/g, '');
                  const nome = (r.nome_completo || 'Aluno').split(' ')[0];
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://inscri-o-capoeira-bar-o-de-mau.vercel.app';
                  const msg = encodeURIComponent(
                    `Olá ${nome}! 👋\n\nIdentificamos que seu cadastro na *Associação Cultural de Capoeira Barão de Mauá* está incompleto.\n\n📋 *Dados que ainda faltam:*\n${pendentes.map((p: string) => `• ${p}`).join('\n')}\n\nPor favor, acesse o link abaixo para completar seu cadastro:\n${appUrl}\n\nQualquer dúvida, entre em contato com seu núcleo. 🥋`
                  );
                  return (
                    <div key={r.id} style={{ background: 'var(--bg-card)', border: '2px solid rgba(220,38,38,0.15)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{r.nome_completo || '(sem nome)'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            {r.nucleo || '—'}{r.telefone ? ` · ${r.telefone}` : ''}{r.email ? ` · ${r.email}` : ''}
                          </div>
                        </div>
                        {tel ? (
                          <a href={`https://api.whatsapp.com/send?phone=55${tel}&text=${msg}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#25d366,#128c7e)', color: '#fff', borderRadius: 8, padding: '8px 16px', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            Avisar pelo WhatsApp
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#f87171', fontStyle: 'italic' }}>Sem telefone cadastrado</span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>DADOS PENDENTES:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {pendentes.map((p: string, i: number) => (
                            <span key={i} style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 20, padding: '3px 12px', fontSize: '0.73rem', color: '#f87171', fontWeight: 600 }}>{p}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ===== ABA MANUAL DO ADMINISTRADOR ===== */}
      {activeTab === 'manual' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#a78bfa' }}>📖 Manual do Administrador do Sistema</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 2 }}>Documentos PDF disponíveis para todos os responsáveis de núcleo</div>
            </div>
            {activeNucleo === 'geral' && (
              <button onClick={() => manualFileRef.current?.click()}
                disabled={uploadingManual}
                style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: uploadingManual ? 0.7 : 1 }}>
                {uploadingManual ? '⏳ Enviando...' : '⬆ Subir PDF'}
              </button>
            )}
            <input ref={manualFileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return;
              setUploadingManual(true); setManualMsg('');
              try {
                const fd = new FormData(); fd.append('file', file);
                const res = await fetch('/api/admin/manual', { method: 'POST', body: fd });
                const json = await res.json();
                if (res.ok && json.ok) {
                  setManualMsg('✓ Manual enviado! Traduzindo para todos os idiomas...');
                  // Reload list
                  const d = await fetch('/api/admin/manual').then(r => r.json());
                  setManuais(d.files || []);
                  // Trigger translation in background
                  const newName = json.name;
                  setTranslatingManual(newName);
                  fetch('/api/admin/manual/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName }),
                  }).then(async r => {
                    const tj = await r.json();
                    if (tj.ok) {
                      setManualMsg('✓ Manual enviado e traduzido para todos os idiomas!');
                      // Load translations
                      const tr = await fetch(`/api/admin/manual/translate?name=${encodeURIComponent(newName)}`).then(r => r.json());
                      if (tr.translations) {
                        setManualTranslations(prev => ({ ...prev, [newName]: tr.translations }));
                        setManualViewLang(prev => ({ ...prev, [newName]: 'pt' }));
                      }
                    } else {
                      setManualMsg('✓ Manual enviado. Tradução parcial: ' + (tj.error || ''));
                    }
                    setTranslatingManual(null);
                  }).catch(() => { setTranslatingManual(null); });
                } else {
                  setManualMsg('Erro: ' + (json.error || 'falha'));
                }
              } catch (err: any) { setManualMsg('Erro: ' + err.message); }
              setUploadingManual(false);
              e.target.value = '';
            }} />
          </div>

          {manualMsg && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: manualMsg.startsWith('✓') ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)', border: `1px solid ${manualMsg.startsWith('✓') ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`, color: manualMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontWeight: 600, fontSize: '0.85rem' }}>
              {manualMsg}
            </div>
          )}

          {loadingManuais ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando manuais...</div>
          ) : manuais.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📄</div>
              <div style={{ fontWeight: 700 }}>Nenhum manual disponível ainda.</div>
              {activeNucleo === 'geral' && <div style={{ marginTop: 6, fontSize: '0.78rem' }}>Clique em "Subir PDF" para adicionar o primeiro manual.</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {manuais.map(m => {
                const hasTranslations = !!manualTranslations[m.name];
                const isTranslating = translatingManual === m.name;
                const currentLang = manualViewLang[m.name] || 'pt';
                const isOpen = manualViewOpen === m.name;
                const translatedText = manualTranslations[m.name]?.[currentLang] || '';

                return (
                  <div key={m.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Card header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: '1.8rem', flexShrink: 0 }}>📄</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name.replace(/^\d+_/, '')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {m.size ? `${(m.size / 1024).toFixed(0)} KB · ` : ''}
                          {m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : ''}
                          {isTranslating && (
                            <span style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700 }}>
                              ⏳ Traduzindo para 13 idiomas...
                            </span>
                          )}
                          {hasTranslations && !isTranslating && (
                            <span style={{ background: 'rgba(22,163,74,0.15)', color: '#4ade80', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700 }}>
                              ✓ 13 idiomas disponíveis
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {/* Translate button — if no translations yet and not translating */}
                        {activeNucleo === 'geral' && !hasTranslations && !isTranslating && (
                          <button onClick={async () => {
                            setTranslatingManual(m.name);
                            setManualMsg('Traduzindo manual para todos os idiomas...');
                            try {
                              const res = await fetch('/api/admin/manual/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: m.name }) });
                              const tj = await res.json();
                              if (tj.ok) {
                                setManualMsg('✓ Manual traduzido para todos os idiomas!');
                                const tr = await fetch(`/api/admin/manual/translate?name=${encodeURIComponent(m.name)}`).then(r => r.json());
                                if (tr.translations) {
                                  setManualTranslations(prev => ({ ...prev, [m.name]: tr.translations }));
                                  setManualViewLang(prev => ({ ...prev, [m.name]: 'pt' }));
                                }
                              } else {
                                setManualMsg('Erro na tradução: ' + tj.error);
                              }
                            } catch (err: any) { setManualMsg('Erro: ' + err.message); }
                            setTranslatingManual(null);
                          }}
                            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                            🌐 Traduzir
                          </button>
                        )}
                        {/* View translations button */}
                        {hasTranslations && (
                          <button onClick={() => setManualViewOpen(isOpen ? null : m.name)}
                            style={{ background: isOpen ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                            🌐 {isOpen ? 'Fechar' : 'Ver Traduções'}
                          </button>
                        )}
                        {m.url && (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" download
                            style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa', borderRadius: 8, padding: '7px 14px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            ⬇ PDF
                          </a>
                        )}
                        {activeNucleo === 'geral' && (
                          <button onClick={async () => {
                            if (!confirm('Excluir este manual?')) return;
                            const res = await fetch('/api/admin/manual', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: m.name }) });
                            if (res.ok) {
                              setManuais(prev => prev.filter(x => x.name !== m.name));
                              setManualTranslations(prev => { const n = { ...prev }; delete n[m.name]; return n; });
                              setManualMsg('Manual excluído.');
                              // Also delete translations
                              fetch('/api/admin/manual/translate', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: m.name }) }).catch(() => {});
                            } else { const j = await res.json(); setManualMsg('Erro: ' + j.error); }
                          }}
                            style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                            🗑
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Translation viewer — expandable */}
                    {isOpen && hasTranslations && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {/* Language tabs */}
                        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', borderBottom: '1px solid var(--border)', background: 'rgba(124,58,237,0.04)' }}>
                          {MANUAL_LANGS.filter(l => manualTranslations[m.name]?.[l.code]).map(l => (
                            <button key={l.code} onClick={() => setManualViewLang(prev => ({ ...prev, [m.name]: l.code }))}
                              style={{ padding: '8px 13px', background: 'none', border: 'none', borderBottom: currentLang === l.code ? '2px solid #a78bfa' : '2px solid transparent', marginBottom: -1, color: currentLang === l.code ? '#a78bfa' : 'var(--text-secondary)', fontWeight: currentLang === l.code ? 700 : 400, cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                              <span>{l.flag}</span>
                              <span>{l.label}</span>
                            </button>
                          ))}
                        </div>
                        {/* Content */}
                        <div style={{ padding: '16px 20px', maxHeight: 380, overflowY: 'auto' }}>
                          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.82rem', lineHeight: 1.7, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', margin: 0 }}>
                            {translatedText}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 24, padding: '14px 16px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 12, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>ℹ Como usar:</strong><br/>
            • Cada responsável de núcleo pode visualizar e baixar os manuais disponíveis.<br/>
            • Somente o Admin Geral pode subir ou excluir manuais.<br/>
            • Apenas arquivos PDF são aceitos.<br/>
            • Os links de download são válidos por 1 hora; recarregue a página para renovar.
          </div>
        </div>
      )}

      {/* ===== ABA LIXEIRA ===== */}
      {activeTab === 'lixeira' && (
        <div style={{ paddingTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>🗑️ Lixeira — Cadastros Excluídos</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {lixeira.length} registro(s) excluído(s) • apenas Admin Geral tem acesso
              </p>
            </div>
            <input
              className="search-input"
              placeholder="Buscar por nome, CPF, núcleo..."
              value={lixeiraSearch}
              onChange={e => setLixeiraSearch(e.target.value)}
              style={{ width: 260 }}
            />
          </div>

          {lixeiraMsg && (
            <div style={{ padding: '10px 16px', borderRadius: 10, marginBottom: 16, background: lixeiraMsg.startsWith('✅') ? '#052e16' : '#3b0808', color: lixeiraMsg.startsWith('✅') ? '#4ade80' : '#fca5a5', fontSize: '0.88rem', border: `1px solid ${lixeiraMsg.startsWith('✅') ? '#166534' : '#7f1d1d'}` }}>
              {lixeiraMsg}
            </div>
          )}

          {loadingLixeira ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
          ) : lixeira.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🗑️</div>
              Nenhum cadastro excluído ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lixeira
                .filter(entry => {
                  if (!lixeiraSearch.trim()) return true;
                  const q = lixeiraSearch.toLowerCase();
                  const s = entry.student;
                  return (
                    String(s.nome_completo || '').toLowerCase().includes(q) ||
                    String(s.cpf || '').includes(q) ||
                    String(s.nucleo || '').toLowerCase().includes(q) ||
                    String(entry.extras?.apelido || '').toLowerCase().includes(q)
                  );
                })
                .map(entry => {
                  const s = entry.student;
                  const isEditingThis = lixeiraEditing === entry.id;
                  return (
                    <div key={entry.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
                      {!isEditingThis ? (
                        /* ── Vista resumo ── */
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{String(s.nome_completo || '—')}</span>
                              {entry.extras?.apelido && <span style={{ fontSize: '0.78rem', color: '#a78bfa', background: 'rgba(124,58,237,0.12)', padding: '2px 8px', borderRadius: 99 }}>"{entry.extras.apelido}"</span>}
                              <span style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>Excluído</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginTop: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                              {s.cpf && <span>CPF: {String(s.cpf)}</span>}
                              {s.nucleo && <span>Núcleo: {String(s.nucleo)}</span>}
                              {s.graduacao && <span>Graduação: {String(s.graduacao)}</span>}
                              {entry.extras?.sexo && <span>Sexo: {entry.extras.sexo}</span>}
                              {entry.extras?.nome_social && <span>Nome social: {entry.extras.nome_social}</span>}
                            </div>
                            <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#6b7280' }}>
                              Excluído em {new Date(entry.deleted_at).toLocaleString('pt-BR')} por {entry.deleted_by}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                            {/* Restaurar */}
                            <button
                              onClick={async () => {
                                if (!confirm(`Restaurar o cadastro de "${s.nome_completo}"?`)) return;
                                setLixeiraMsg('');
                                const res = await fetch('/api/lixeira/restaurar', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: entry.id }),
                                });
                                const d = await res.json();
                                if (res.ok) {
                                  setLixeiraMsg(`✅ Cadastro de "${s.nome_completo}" restaurado com sucesso!`);
                                  setLixeira(prev => prev.filter(e => e.id !== entry.id));
                                  fetchStudents();
                                } else {
                                  setLixeiraMsg(`❌ Erro ao restaurar: ${d.error || 'Tente novamente.'}`);
                                }
                              }}
                              style={{ padding: '8px 16px', borderRadius: 8, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                            >
                              ♻️ Restaurar
                            </button>
                            {/* Editar */}
                            <button
                              onClick={() => {
                                setLixeiraEditing(entry.id);
                                setLixeiraEditForm({ ...entry.student });
                                setLixeiraEditExtras({ ...(entry.extras || {}) });
                              }}
                              style={{ padding: '8px 16px', borderRadius: 8, background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                            >
                              ✏️ Editar
                            </button>
                            {/* Excluir definitivamente */}
                            <button
                              onClick={async () => {
                                if (!confirm(`Excluir DEFINITIVAMENTE o cadastro de "${s.nome_completo}"? Esta ação não pode ser desfeita.`)) return;
                                setLixeiraMsg('');
                                const res = await fetch(`/api/lixeira?id=${entry.id}`, { method: 'DELETE' });
                                if (res.ok) {
                                  setLixeiraMsg(`✅ Cadastro de "${s.nome_completo}" excluído definitivamente.`);
                                  setLixeira(prev => prev.filter(e => e.id !== entry.id));
                                } else {
                                  setLixeiraMsg('❌ Erro ao excluir. Tente novamente.');
                                }
                              }}
                              style={{ padding: '8px 16px', borderRadius: 8, background: '#991b1b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                            >
                              🗑️ Excluir definitivo
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Formulário de edição ── */
                        <div>
                          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-primary)' }}>✏️ Editando: {String(lixeiraEditForm.nome_completo || '')}</h3>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                            {[
                              { label: 'Nome completo', key: 'nome_completo' },
                              { label: 'CPF', key: 'cpf' },
                              { label: 'RG', key: 'identidade' },
                              { label: 'Data nascimento', key: 'data_nascimento' },
                              { label: 'Telefone', key: 'telefone' },
                              { label: 'Graduação', key: 'graduacao' },
                              { label: 'Núcleo', key: 'nucleo' },
                              { label: 'E-mail', key: 'email' },
                              { label: 'CEP', key: 'cep' },
                              { label: 'Endereço', key: 'endereco' },
                              { label: 'Número', key: 'numero' },
                              { label: 'Bairro', key: 'bairro' },
                              { label: 'Cidade', key: 'cidade' },
                              { label: 'Estado', key: 'estado' },
                            ].map(({ label, key }) => (
                              <div key={key}>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
                                <input
                                  value={String(lixeiraEditForm[key] ?? '')}
                                  onChange={e => setLixeiraEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }}
                                />
                              </div>
                            ))}
                            {/* Extras */}
                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Apelido (capoeira)</label>
                              <input
                                value={lixeiraEditExtras.apelido || ''}
                                onChange={e => setLixeiraEditExtras(prev => ({ ...prev, apelido: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Nome social</label>
                              <input
                                value={lixeiraEditExtras.nome_social || ''}
                                onChange={e => setLixeiraEditExtras(prev => ({ ...prev, nome_social: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Gênero/Sexo</label>
                              <select
                                value={lixeiraEditExtras.sexo || ''}
                                onChange={e => setLixeiraEditExtras(prev => ({ ...prev, sexo: e.target.value }))}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }}
                              >
                                <option value="">—</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                                <option value="Não-binário">Não-binário</option>
                                <option value="Prefiro não informar">Prefiro não informar</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                            <button
                              onClick={async () => {
                                setLixeiraMsg('');
                                const res = await fetch('/api/lixeira', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: entry.id, student: lixeiraEditForm, extras: lixeiraEditExtras }),
                                });
                                if (res.ok) {
                                  setLixeiraMsg('✅ Dados atualizados na lixeira.');
                                  setLixeira(prev => prev.map(e => e.id === entry.id ? { ...e, student: { ...e.student, ...lixeiraEditForm }, extras: lixeiraEditExtras } : e));
                                  setLixeiraEditing(null);
                                } else {
                                  setLixeiraMsg('❌ Erro ao salvar. Tente novamente.');
                                }
                              }}
                              style={{ padding: '9px 22px', borderRadius: 8, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
                            >
                              💾 Salvar alterações
                            </button>
                            <button
                              onClick={() => setLixeiraEditing(null)}
                              style={{ padding: '9px 22px', borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.88rem' }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ===== ABA EVENTOS ===== */}
      {activeTab === 'eventos' && (() => {
        const nucleoFilter = activeNucleo !== 'geral' ? (
          activeNucleo === 'edson-alves' ? 'Poliesportivo Edson Alves' :
          activeNucleo === 'ipiranga' ? 'Poliesportivo do Ipiranga' :
          activeNucleo === 'saracuruna' ? 'Saracuruna' :
          activeNucleo === 'vila-urussai' ? 'Vila Urussaí' :
          activeNucleo === 'jayme-fichman' ? 'Jayme Fichman' : ''
        ) : '';
        // Admin geral vê TODOS os eventos
        // Responsável de núcleo vê APENAS eventos do seu núcleo OU sem núcleo definido
        const eventosFiltrados = nucleoFilter
          ? eventos.filter(e => !e.nucleo || e.nucleo === nucleoFilter)
          : eventos;

        return (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0ea5e9' }}>{t('admin_event_title')}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 2 }}>{t('admin_event_subtitle')}</div>
              </div>
              <button
                onClick={() => {
                  setEventoEditId(null);
                  setEventoForm({ tipo: 'batizado', nome: '', data: '', hora: '09:00', local: '', nucleo: nucleoFilter || '', participantes: [] });
                  setShowEventoForm(true);
                  setEventoMsg('');
                  setEventoParticipantSearch('');
                  setEventoParticipantStaging(null);
                }}
                style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                {t('admin_new_event')}
              </button>
            </div>

            {eventoMsg && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: eventoMsg.startsWith('✓') ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)', border: `1px solid ${eventoMsg.startsWith('✓') ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`, color: eventoMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontWeight: 600, fontSize: '0.85rem' }}>
                {eventoMsg}
              </div>
            )}

            {loadingEventos && eventosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>{t('common_loading')}</div>
            ) : eventosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📅</div>
                <div style={{ fontWeight: 700 }}>{t('admin_event_none')}</div>
                <div style={{ marginTop: 6, fontSize: '0.78rem' }}>{t('admin_event_none_hint')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {eventosFiltrados.sort((a, b) => (b.data || '').localeCompare(a.data || '')).map((ev: any) => (
                  <div key={ev.id} style={{ background: 'var(--bg-card)', border: `1px solid ${ev.finalizado ? 'rgba(22,163,74,0.4)' : 'rgba(14,165,233,0.3)'}`, borderRadius: 14, overflow: 'hidden' }}>
                    {/* Event header */}
                    <div style={{ background: ev.finalizado ? 'linear-gradient(135deg,#166534,#15803d)' : 'linear-gradient(135deg,#0c4a6e,#0ea5e9)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>
                          {ev.tipo === 'batizado' ? '🥋' : '🎓'} {ev.nome || (ev.tipo === 'batizado' ? 'Batizado' : 'Troca de Graduação')}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', marginTop: 2 }}>
                          {ev.tipo === 'batizado' ? t('admin_event_batizado') : t('admin_event_troca')}
                          {ev.data && ` · ${new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                          {ev.hora && ` às ${ev.hora}`}
                          {ev.local && ` · ${ev.local}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: ev.finalizado ? 'rgba(22,163,74,0.35)' : 'rgba(245,158,11,0.3)', color: ev.finalizado ? '#4ade80' : '#fcd34d', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                          {ev.finalizado ? t('admin_event_finalized') : t('admin_event_pending')}
                        </span>
                        <span style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                          {(ev.participantes || []).length} {t('admin_students_count')}
                        </span>
                      </div>
                    </div>

                    {/* Participants list */}
                    {(ev.participantes || []).length > 0 && (
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('admin_event_participants')}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                          {ev.participantes.map((p: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', background: 'var(--bg)', borderRadius: 8, fontSize: '0.8rem' }}>
                              <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-primary)' }}>{p.nome_completo}</span>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{p.nucleo}</span>
                              <span style={{ color: '#f59e0b', fontSize: '0.72rem' }}>{p.graduacao_atual}</span>
                              {p.nova_graduacao && p.nova_graduacao !== p.graduacao_atual && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>→</span>
                                  <span style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 700 }}>{p.nova_graduacao}</span>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                      {!ev.finalizado && (
                        <button onClick={() => {
                          setEventoEditId(ev.id);
                          setEventoForm({ ...ev });
                          setShowEventoForm(true);
                          setEventoMsg('');
                          setEventoParticipantSearch('');
                          setEventoParticipantStaging(null);
                        }} style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                          ✏ {t('admin_edit')}
                        </button>
                      )}

                      {/* Auto-finalize info */}
                      {!ev.finalizado && ev.data && ev.hora && (() => {
                        const evDt = new Date(`${ev.data}T${ev.hora}:00`);
                        const now = new Date();
                        const isReady = now >= evDt;
                        return isReady ? (
                          <button
                            disabled={eventoFinalizing === ev.id}
                            onClick={async () => {
                              if (!confirm(`Aplicar graduações do evento "${ev.nome}"? Isso atualizará ${(ev.participantes || []).length} aluno(s).`)) return;
                              setEventoFinalizing(ev.id); setEventoMsg('');
                              const res = await fetch('/api/eventos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _finalize: ev.id }) });
                              const json = await res.json();
                              setEventoFinalizing(null);
                              if (json.ok) {
                                setEventoMsg(`✓ ${json.applied || 0} graduação(ões) atualizada(s)!`);
                                const d = await fetch('/api/eventos').then(r => r.json());
                                setEventos(d);
                              } else {
                                setEventoMsg('Erro: ' + (json.errors || []).join(', '));
                              }
                            }}
                            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, opacity: eventoFinalizing === ev.id ? 0.6 : 1, boxShadow: '0 2px 8px rgba(22,163,74,0.4)' }}>
                            {eventoFinalizing === ev.id ? '⏳ Aplicando...' : '✅ Aplicar Graduações'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 7, padding: '5px 10px' }}>
                            🕐 Graduações aplicadas automaticamente em {new Date(`${ev.data}T${ev.hora}:00`).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                          </span>
                        );
                      })()}

                      {/* Imprimir PDF — sempre visível */}
                      <button
                        onClick={() => {
                          const origin = typeof window !== 'undefined' ? window.location.origin : '';
                          const dataFmt = ev.data ? new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                          const rows = (ev.participantes || []).map((p: any, i: number) => {
                            const mat = p.inscricao_numero ? `ACCBM-${String(p.inscricao_numero).padStart(6,'0')}` : '—';
                            const dn = p.data_nascimento ? new Date(p.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                            const mudou = p.nova_graduacao && p.nova_graduacao !== p.graduacao_atual;
                            return `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:0.75em;color:#1d4ed8;font-weight:700">${mat}</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:0.88em">${p.nome_completo}</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:0.78em">${p.cpf || '—'}</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:0.78em">${dn}</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:0.78em">${p.nucleo || '—'}</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#b45309;font-weight:700;font-size:0.78em">${p.graduacao_atual}</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:0.75em">→</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:${mudou?'#15803d':'#94a3b8'};font-weight:${mudou?'800':'400'};font-size:0.78em">${p.nova_graduacao || p.graduacao_atual}</td>
                              <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:0.75em;color:#94a3b8;border-left:1px dashed #e2e8f0"></td>
                            </tr>`;
                          }).join('');
                          const semParticipantes = (ev.participantes || []).length === 0
                            ? `<tr><td colspan="9" style="padding:20px;text-align:center;color:#94a3b8;font-style:italic">Nenhum participante registrado</td></tr>`
                            : '';
                          const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${ev.nome}</title>
                          <style>
                            *{box-sizing:border-box}
                            body{font-family:Arial,sans-serif;margin:0;padding:24px 28px;color:#1e293b;font-size:12px;background:#fff}
                            .header{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:3px solid #1e3a8a;margin-bottom:14px}
                            .header img{height:72px;width:72px;object-fit:contain;flex-shrink:0}
                            .header-text{flex:1}
                            .assoc-name{font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px}
                            .event-title{font-size:1.25rem;font-weight:800;color:#1e3a8a;margin:0 0 2px;line-height:1.2}
                            .badge{display:inline-block;background:#1e3a8a;color:#fff;border-radius:4px;padding:2px 10px;font-size:0.68rem;font-weight:700;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em}
                            .info-bar{display:flex;gap:0;margin:0 0 16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc}
                            .info-item{flex:1;padding:8px 12px;border-right:1px solid #e2e8f0;text-align:center}
                            .info-item:last-child{border-right:none}
                            .info-label{font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px}
                            .info-value{font-size:0.82rem;font-weight:700;color:#1e293b}
                            .status-ok{color:#15803d}.status-pending{color:#b45309}
                            table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;overflow:hidden;font-size:0.82rem}
                            thead tr{background:#1e3a8a;color:#fff}
                            thead td{padding:9px 10px;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
                            .footer{margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;border-top:2px solid #e2e8f0;padding-top:14px}
                            .sig-box{width:200px;text-align:center}
                            .sig-line{border-top:1px solid #334155;margin-bottom:4px;margin-top:40px}
                            .sig-label{font-size:0.68rem;color:#64748b}
                            .gen-info{font-size:0.65rem;color:#94a3b8;text-align:center}
                            @media print{body{padding:14px 16px};@page{size:landscape;margin:1cm}}
                          </style></head>
                          <body>
                          <div class="header">
                            <img src="${origin}/logo-accbm.jpeg" alt="ACCBM" onerror="this.src='${origin}/logo-maua.png'"/>
                            <div class="header-text">
                              <div class="assoc-name">Associação Cultural de Capoeira Barão de Mauá</div>
                              <div class="badge">${ev.tipo === 'batizado' ? 'Batizado' : 'Troca de Graduação'}</div>
                              <div class="event-title">${ev.nome}</div>
                            </div>
                          </div>
                          <div class="info-bar">
                            <div class="info-item"><div class="info-label">Data</div><div class="info-value">${dataFmt}</div></div>
                            <div class="info-item"><div class="info-label">Horário</div><div class="info-value">${ev.hora || '—'}</div></div>
                            ${ev.local ? `<div class="info-item"><div class="info-label">Local</div><div class="info-value">${ev.local}</div></div>` : ''}
                            ${ev.nucleo ? `<div class="info-item"><div class="info-label">Núcleo</div><div class="info-value">${ev.nucleo}</div></div>` : ''}
                            <div class="info-item"><div class="info-label">Participantes</div><div class="info-value">${(ev.participantes||[]).length}</div></div>
                            <div class="info-item"><div class="info-label">Status</div><div class="info-value ${ev.finalizado?'status-ok':'status-pending'}">${ev.finalizado?'✓ Aplicado':'⏳ Pendente'}</div></div>
                          </div>
                          <table>
                            <thead><tr>
                              <td>Matrícula</td><td>Nome Completo</td><td>CPF</td><td>Nascimento</td><td>Núcleo</td><td>Graduação Atual</td><td></td><td>Nova Graduação</td><td>Assinatura</td>
                            </tr></thead>
                            <tbody>${rows || semParticipantes}</tbody>
                          </table>
                          <div class="footer">
                            <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Responsável / Mestre</div></div>
                            <div class="gen-info">
                              <div>Relatório gerado em ${new Date().toLocaleString('pt-BR')}</div>
                              <div style="margin-top:2px;font-weight:700;color:#475569">Associação Cultural de Capoeira Barão de Mauá — ACCBM</div>
                            </div>
                            <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Secretário(a)</div></div>
                          </div>
                          </body></html>`;
                          const w = window.open('', '_blank');
                          if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                        }}
                        style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                        🖨 Imprimir PDF
                      </button>

                      {/* Excluir */}
                      <button onClick={async () => {
                        if (!confirm(`Excluir o evento "${ev.nome}"? Esta ação não pode ser desfeita.`)) return;
                        const res = await fetch('/api/eventos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _delete: ev.id }) });
                        if (res.ok) {
                          setEventos(prev => prev.filter((x: any) => x.id !== ev.id));
                          setEventoMsg(t('admin_event_deleted'));
                        }
                      }} style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, marginLeft: 'auto' }}>
                        🗑 {t('admin_delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Lista Geral de Participantes ── */}
            {eventosFiltrados.length > 0 && (() => {
              // Build flat list of all participants across all events
              const listaGeral: Array<any> = [];
              for (const ev of [...eventosFiltrados].sort((a, b) => (b.data || '').localeCompare(a.data || ''))) {
                for (const p of (ev.participantes || [])) {
                  listaGeral.push({ ...p, _evento_nome: ev.nome, _evento_data: ev.data, _evento_hora: ev.hora, _evento_tipo: ev.tipo, _evento_local: ev.local, _evento_finalizado: ev.finalizado, _evento_id: ev.id });
                }
              }
              if (listaGeral.length === 0) return null;
              const totalParticipantes = listaGeral.length;
              const comGraducaoNova = listaGeral.filter(p => p.nova_graduacao && p.nova_graduacao !== p.graduacao_atual).length;

              const printListaGeral = () => {
                const rows = listaGeral.map((p, i) => {
                  const mat = p.inscricao_numero ? `ACCBM-${String(p.inscricao_numero).padStart(6,'0')}` : '—';
                  const dn = p.data_nascimento ? new Date(p.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                  const ev_data = p._evento_data ? new Date(p._evento_data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                  const mudou = p.nova_graduacao && p.nova_graduacao !== p.graduacao_atual;
                  return `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.8em;color:#64748b">${mat}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:0.85em">${p.nome_completo}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.78em;color:#64748b">${p.cpf || '—'}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.78em;color:#64748b">${dn}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.78em;color:#64748b">${p.nucleo || '—'}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.78em;color:#d97706;font-weight:600">${p.graduacao_atual}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:0.75em;color:#94a3b8">→</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.78em;color:${mudou?'#16a34a':'#94a3b8'};font-weight:${mudou?'700':'400'}">${p.nova_graduacao || p.graduacao_atual}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.75em;color:#64748b">${p._evento_nome}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.75em;color:#64748b">${ev_data}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:0.75em">${p._evento_finalizado ? '<span style="color:#16a34a;font-weight:700">✓ Aplicado</span>' : '<span style="color:#d97706">Pendente</span>'}</td>
                  </tr>`;
                }).join('');
                const filtroLabel = nucleoFilter ? ` — ${nucleoFilter}` : ' — Todos os Núcleos';
                const glOrigin = typeof window !== 'undefined' ? window.location.origin : '';
                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lista Geral de Participantes${filtroLabel}</title>
                <style>
                  *{box-sizing:border-box}
                  body{font-family:Arial,sans-serif;margin:0;padding:24px 28px;color:#1e293b;font-size:12px;background:#fff}
                  .header{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:3px solid #1e3a8a;margin-bottom:16px}
                  .header img{height:72px;width:72px;object-fit:contain;flex-shrink:0}
                  .assoc-name{font-size:0.68rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px}
                  h1{font-size:1.1rem;margin:0 0 2px;color:#1e3a8a;font-weight:800}
                  .sub{color:#64748b;font-size:0.78rem;margin:0}
                  .stats{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
                  .stat{background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px 16px;font-size:0.78rem;text-align:center}
                  .stat strong{display:block;font-size:1rem;color:#0284c7;font-weight:800}
                  table{width:100%;border-collapse:collapse;font-size:0.78rem;border:1px solid #e2e8f0}
                  thead tr{background:#1e3a8a;color:#fff}
                  thead td{padding:8px 10px;font-weight:700;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em}
                  .footer{margin-top:20px;border-top:2px solid #e2e8f0;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:0.65rem;color:#94a3b8}
                  .footer strong{color:#475569}
                  @media print{body{padding:12px 14px};@page{size:landscape;margin:1cm}}
                </style></head><body>
                <div class="header">
                  <img src="${glOrigin}/logo-accbm.jpeg" alt="ACCBM" onerror="this.src='${glOrigin}/logo-maua.png'"/>
                  <div>
                    <div class="assoc-name">Associação Cultural de Capoeira Barão de Mauá</div>
                    <h1>📋 Lista Geral de Participantes${filtroLabel}</h1>
                    <p class="sub">Batizados e Trocas de Graduação · Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <div class="stats">
                  <div class="stat"><strong>${totalParticipantes}</strong>Participantes</div>
                  <div class="stat"><strong>${comGraducaoNova}</strong>Com nova graduação</div>
                  <div class="stat"><strong>${eventosFiltrados.length}</strong>Evento(s)</div>
                  <div class="stat"><strong>${new Date().toLocaleDateString('pt-BR')}</strong>Emissão</div>
                </div>
                <table>
                  <thead><tr>
                    <td>Matrícula</td><td>Nome</td><td>CPF</td><td>Nascimento</td><td>Núcleo</td>
                    <td>Grad. Atual</td><td></td><td>Nova Grad.</td><td>Evento</td><td>Data</td><td>Status</td>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
                <div class="footer">
                  <div>Gerado em ${new Date().toLocaleString('pt-BR')}</div>
                  <div><strong>Associação Cultural de Capoeira Barão de Mauá — ACCBM</strong></div>
                </div>
                </body></html>`;
                const w = window.open('', '_blank');
                if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 500); }
              };

              return (
                <div style={{ marginTop: 28 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        📋 Lista Geral de Participantes
                        <span style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                          {totalParticipantes} participante{totalParticipantes !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                        Todos os lançamentos registrados{nucleoFilter ? ` — ${nucleoFilter}` : ''} · {comGraducaoNova} com nova graduação
                      </div>
                    </div>
                    <button
                      onClick={printListaGeral}
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 2px 10px rgba(124,58,237,0.4)' }}>
                      🖨 Imprimir Lista Geral
                    </button>
                  </div>

                  {/* Table */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px 90px 130px 110px 20px 110px 140px', gap: 0, background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)', padding: '8px 12px' }}>
                      {['Matrícula','Nome','CPF','Nascimento','Núcleo','Grad. Atual','','Nova Grad.','Evento'].map((h, i) => (
                        <div key={i} style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>{h}</div>
                      ))}
                    </div>
                    {/* Rows */}
                    <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                      {listaGeral.map((p, i) => {
                        const mat = p.inscricao_numero ? `ACCBM-${String(p.inscricao_numero).padStart(6,'0')}` : '—';
                        const dn = p.data_nascimento ? new Date(p.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                        const mudou = p.nova_graduacao && p.nova_graduacao !== p.graduacao_atual;
                        const ev_data = p._evento_data ? new Date(p._evento_data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
                        return (
                          <div key={`${p.student_id}-${p._evento_id}`}
                            style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px 90px 130px 110px 20px 110px 140px', gap: 0, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'rgba(255,255,255,0.02)', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 700, padding: '0 4px' }}>{mat}</div>
                            <div style={{ padding: '0 4px', minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome_completo}</div>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0 4px' }}>{p.cpf || '—'}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0 4px' }}>{dn}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nucleo || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, padding: '0 4px' }}>{p.graduacao_atual}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center' }}>→</div>
                            <div style={{ fontSize: '0.75rem', color: mudou ? '#4ade80' : 'var(--text-secondary)', fontWeight: mudou ? 700 : 400, padding: '0 4px' }}>{p.nova_graduacao || p.graduacao_atual}</div>
                            <div style={{ padding: '0 4px', minWidth: 0 }}>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p._evento_nome}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{ev_data}</span>
                                {p._evento_finalizado
                                  ? <span style={{ fontSize: '0.6rem', color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, padding: '1px 5px', fontWeight: 700 }}>✓</span>
                                  : <span style={{ fontSize: '0.6rem', color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10, padding: '1px 5px', fontWeight: 700 }}>⏳</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Modal Criar/Editar Evento ── */}
      {showEventoForm && (
        <div className="modal-overlay" onClick={() => setShowEventoForm(false)} style={{ zIndex: 1300 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, width: '97vw', maxHeight: '95vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#0c4a6e,#0ea5e9)', borderRadius: '12px 12px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '-24px -24px 20px -24px' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>
                  {eventoEditId ? t('admin_event_edit_title') : t('admin_event_new_title')}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', marginTop: 2 }}>
                  {eventoForm.tipo === 'batizado' ? t('admin_event_batizado') : t('admin_event_troca')}
                </div>
              </div>
              <button onClick={() => setShowEventoForm(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Tipo selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('admin_event_type_label')}</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ v: 'batizado', label: `🥋 ${t('admin_event_batizado')}` }, { v: 'troca', label: `🎓 ${t('admin_event_troca')}` }].map(opt => (
                  <button key={opt.v} onClick={() => setEventoForm((f: any) => ({ ...f, tipo: opt.v }))}
                    style={{ flex: 1, padding: '9px 14px', border: `2px solid ${eventoForm.tipo === opt.v ? '#0ea5e9' : 'var(--border)'}`, borderRadius: 10, background: eventoForm.tipo === opt.v ? 'rgba(14,165,233,0.12)' : 'var(--bg)', color: eventoForm.tipo === opt.v ? '#38bdf8' : 'var(--text-secondary)', fontWeight: eventoForm.tipo === opt.v ? 700 : 500, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.15s' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 16 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('admin_event_name_label')} *</label>
                <input value={eventoForm.nome || ''} onChange={e => setEventoForm((f: any) => ({ ...f, nome: e.target.value }))}
                  placeholder={eventoForm.tipo === 'batizado' ? 'Ex: Batizado 2025 — ACCBM' : 'Ex: Troca de Cordas — Março 2025'}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>📅 {t('admin_event_date_label')} *</label>
                <input type="date" value={eventoForm.data || ''} onChange={e => setEventoForm((f: any) => ({ ...f, data: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>🕐 {t('admin_event_time_label')} *</label>
                <input type="time" value={eventoForm.hora || ''} onChange={e => setEventoForm((f: any) => ({ ...f, hora: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>📍 {t('admin_event_local_label')}</label>
                <input value={eventoForm.local || ''} onChange={e => setEventoForm((f: any) => ({ ...f, local: e.target.value }))}
                  placeholder="Ex: Poliesportivo Edson Alves"
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('admin_event_nucleo_label')}</label>
                <select value={eventoForm.nucleo || ''} onChange={e => setEventoForm((f: any) => ({ ...f, nucleo: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }}>
                  <option value="">{t('admin_event_all_nucleos')}</option>
                  <option>Poliesportivo Edson Alves</option>
                  <option>Poliesportivo do Ipiranga</option>
                  <option>Saracuruna</option>
                  <option>Vila Urussaí</option>
                  <option>Jayme Fichman</option>
                </select>
              </div>
            </div>

            {/* Participants section */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                👥 {t('admin_event_participants')}
                {(eventoForm.participantes || []).length > 0 && (
                  <span style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {(eventoForm.participantes || []).length} inserido{(eventoForm.participantes || []).length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Step 1 — Search (hidden while staging) */}
              {!eventoParticipantStaging && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
                    <input
                      value={eventoParticipantSearch}
                      onChange={e => setEventoParticipantSearch(e.target.value)}
                      placeholder="Pesquisar aluno por nome ou CPF para adicionar..."
                      style={{ width: '100%', padding: '10px 12px 10px 34px', background: 'var(--bg)', border: '1.5px solid rgba(14,165,233,0.4)', borderRadius: 9, color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  {eventoParticipantSearch.trim().length >= 2 && (() => {
                    const q = eventoParticipantSearch.toLowerCase().replace(/\D/g, '') || eventoParticipantSearch.toLowerCase();
                    const alreadyIds = new Set((eventoForm.participantes || []).map((p: any) => p.student_id));
                    const results = students.filter(s =>
                      !alreadyIds.has(s.id) &&
                      (s.nome_completo.toLowerCase().includes(eventoParticipantSearch.toLowerCase()) ||
                       (s.cpf || '').replace(/\D/g, '').includes(q))
                    ).slice(0, 10);
                    if (!results.length) return (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6, padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 9 }}>
                        Nenhum aluno encontrado
                      </div>
                    );
                    return (
                      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 10, marginTop: 4, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                        {results.map(s => (
                          <button key={s.id}
                            onClick={() => {
                              setEventoParticipantStaging({
                                student_id: s.id,
                                nome_completo: s.nome_completo,
                                nucleo: s.nucleo || '',
                                graduacao_atual: s.graduacao,
                                nova_graduacao: s.graduacao,
                                tipo_graduacao: s.tipo_graduacao || 'adulta',
                                cpf: s.cpf || null,
                                inscricao_numero: s.ordem_inscricao ?? null,
                                data_nascimento: s.data_nascimento || null,
                              });
                              setEventoParticipantSearch('');
                            }}
                            style={{ width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(14,165,233,0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome_completo}</div>
                              {s.cpf && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 1 }}>CPF: {s.cpf}</div>}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 6 }}>
                              <div style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>{s.graduacao}</div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>{s.nucleo || '—'}</div>
                            </div>
                            <div style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.4)', color: '#38bdf8', borderRadius: 7, padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                              Selecionar →
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Step 2 — Staging card: set graduações then click Inserir */}
              {eventoParticipantStaging && (
                <div style={{ marginBottom: 14, background: 'rgba(14,165,233,0.06)', border: '2px solid rgba(14,165,233,0.45)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    ✏ Definir graduações — depois clique em Inserir
                  </div>
                  {/* Student info row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eventoParticipantStaging.nome_completo}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {eventoParticipantStaging.nucleo || '—'}
                        {eventoParticipantStaging.cpf ? ` · ${eventoParticipantStaging.cpf}` : ''}
                      </div>
                    </div>
                  </div>
                  {/* Graduation selectors */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Graduação Atual
                      </label>
                      <select
                        value={eventoParticipantStaging.graduacao_atual}
                        onChange={e => setEventoParticipantStaging((s: any) => ({ ...s, graduacao_atual: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '2px solid rgba(245,158,11,0.5)', borderRadius: 8, color: '#f59e0b', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', boxSizing: 'border-box' }}>
                        {graduacoes.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#4ade80', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Nova Graduação
                      </label>
                      <select
                        value={eventoParticipantStaging.nova_graduacao}
                        onChange={e => setEventoParticipantStaging((s: any) => ({ ...s, nova_graduacao: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '2px solid rgba(74,222,128,0.5)', borderRadius: 8, color: '#4ade80', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', boxSizing: 'border-box' }}>
                        {graduacoes.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        setEventoForm((f: any) => ({ ...f, participantes: [...(f.participantes || []), eventoParticipantStaging] }));
                        setEventoParticipantStaging(null);
                        setEventoParticipantSearch('');
                      }}
                      style={{ flex: 1, padding: '10px 0', background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', border: 'none', color: '#fff', borderRadius: 9, cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem', boxShadow: '0 2px 10px rgba(14,165,233,0.4)' }}>
                      ✅ Inserir na Lista
                    </button>
                    <button
                      onClick={() => { setEventoParticipantStaging(null); setEventoParticipantSearch(''); }}
                      style={{ padding: '10px 18px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 9, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Participants list */}
              {(eventoForm.participantes || []).length > 0 && (
                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', background: 'linear-gradient(135deg,rgba(14,165,233,0.12),rgba(14,165,233,0.05))', borderBottom: '1px solid var(--border)', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 140px 140px', gap: 6, flex: 1 }}>
                      <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>#</div>
                      <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aluno</div>
                      <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grad. Atual</div>
                      <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nova Grad.</div>
                    </div>
                    <button onClick={() => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : '';
                      const dataFmt = eventoForm.data ? new Date(eventoForm.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                      const rows = (eventoForm.participantes || []).map((p: any, i: number) => {
                        const mudou = p.nova_graduacao && p.nova_graduacao !== p.graduacao_atual;
                        return `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
                          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:0.75em;color:#1d4ed8;font-weight:700">${i+1}</td>
                          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">${p.nome_completo}</td>
                          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">${p.nucleo||'—'}</td>
                          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#b45309;font-weight:700">${p.graduacao_atual}</td>
                          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#94a3b8">→</td>
                          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:${mudou?'#15803d':'#94a3b8'};font-weight:${mudou?'800':'400'}">${p.nova_graduacao||p.graduacao_atual}</td>
                          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;border-left:1px dashed #e2e8f0"></td>
                        </tr>`;
                      }).join('');
                      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${eventoForm.nome||'Evento'}</title>
                      <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:24px 28px;color:#1e293b;font-size:12px}
                      .header{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:3px solid #1e3a8a;margin-bottom:14px}
                      .header img{height:72px;width:72px;object-fit:contain;flex-shrink:0}
                      .assoc{font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px}
                      .title{font-size:1.2rem;font-weight:800;color:#1e3a8a;margin:0 0 2px}
                      table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0}
                      thead tr{background:#1e3a8a;color:#fff}
                      thead td{padding:9px 10px;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
                      .footer{margin-top:20px;display:flex;justify-content:space-between;border-top:2px solid #e2e8f0;padding-top:12px}
                      .sig{width:190px;text-align:center}.sig-line{border-top:1px solid #334155;margin:36px 0 4px;font-size:0.68rem;color:#64748b}
                      @media print{body{padding:14px};@page{size:landscape;margin:1cm}}</style></head>
                      <body>
                      <div class="header">
                        <img src="${origin}/logo-barao-maua.png" alt="ACCBM" onerror="this.src='${origin}/logo-accbm.jpeg'"/>
                        <div><div class="assoc">Associação Cultural de Capoeira Barão de Mauá</div>
                        <div class="title">${eventoForm.tipo==='batizado'?'Batizado':'Troca de Graduação'}: ${eventoForm.nome||'—'}</div>
                        <div style="font-size:0.82rem;color:#64748b">Data: <strong>${dataFmt}</strong>${eventoForm.hora?` &nbsp;|&nbsp; Horário: <strong>${eventoForm.hora}</strong>`:''}${eventoForm.local?` &nbsp;|&nbsp; Local: <strong>${eventoForm.local}</strong>`:''} &nbsp;|&nbsp; Participantes: <strong>${(eventoForm.participantes||[]).length}</strong></div></div>
                      </div>
                      <table><thead><tr><td>#</td><td>Nome Completo</td><td>Núcleo</td><td>Graduação Atual</td><td></td><td>Nova Graduação</td><td>Assinatura</td></tr></thead>
                      <tbody>${rows}</tbody></table>
                      <div class="footer">
                        <div class="sig"><div class="sig-line">Responsável / Mestre</div></div>
                        <div style="text-align:center;font-size:0.65rem;color:#94a3b8">Gerado em ${new Date().toLocaleString('pt-BR')}<br/><strong>ACCBM — Associação Cultural de Capoeira Barão de Mauá</strong></div>
                        <div class="sig"><div class="sig-line">Secretário(a)</div></div>
                      </div></body></html>`;
                      const w = window.open('', '_blank');
                      if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                    }} style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      🖨 PDF
                    </button>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {eventoForm.participantes.map((p: any, idx: number) => (
                      <div key={p.student_id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 140px 140px 36px', alignItems: 'center', gap: 6, padding: '8px 10px', background: idx % 2 === 0 ? 'var(--bg)' : 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', paddingRight: 46 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>{idx + 1}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome_completo}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 1 }}>{p.nucleo || '—'}</div>
                        </div>
                        <select
                          value={p.graduacao_atual}
                          onChange={e => {
                            const updated = eventoForm.participantes.map((pp: any, i: number) =>
                              i === idx ? { ...pp, graduacao_atual: e.target.value } : pp
                            );
                            setEventoForm((f: any) => ({ ...f, participantes: updated }));
                          }}
                          style={{ padding: '5px 6px', background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 7, color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                          {graduacoes.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select
                          value={p.nova_graduacao}
                          onChange={e => {
                            const updated = eventoForm.participantes.map((pp: any, i: number) =>
                              i === idx ? { ...pp, nova_graduacao: e.target.value } : pp
                            );
                            setEventoForm((f: any) => ({ ...f, participantes: updated }));
                          }}
                          style={{ padding: '5px 6px', background: 'var(--bg-card)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 7, color: '#4ade80', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                          {graduacoes.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button
                          onClick={() => setEventoForm((f: any) => ({ ...f, participantes: f.participantes.filter((_: any, i: number) => i !== idx) }))}
                          style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Save button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowEventoForm(false)} style={{ padding: '9px 18px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                {t('admin_cancel')}
              </button>
              <button
                disabled={eventoSaving}
                onClick={async () => {
                  if (!eventoForm.nome?.trim()) { setEventoMsg(t('admin_event_name_required')); return; }
                  if (!eventoForm.data) { setEventoMsg(t('admin_event_date_required')); return; }
                  setEventoSaving(true); setEventoMsg('');
                  const payload = eventoEditId ? { ...eventoForm, id: eventoEditId } : eventoForm;
                  const res = await fetch('/api/eventos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  const json = await res.json();
                  setEventoSaving(false);
                  if (json.ok) {
                    setShowEventoForm(false);
                    setEventoParticipantStaging(null);
                    setEventoParticipantSearch('');
                    // Reload events and ensure we're on the eventos tab
                    try {
                      const d = await fetch('/api/eventos').then(r => r.json());
                      setEventos(Array.isArray(d) ? d : []);
                    } catch {}
                    setEventoMsg('✓ Evento salvo com sucesso!');
                    setActiveTab('eventos');
                  } else {
                    setEventoMsg('Erro ao salvar evento. Tente novamente.');
                  }
                }}
                style={{ padding: '9px 22px', background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, opacity: eventoSaving ? 0.7 : 1 }}>
                {eventoSaving ? t('admin_saving') : t('admin_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Rascunho ── */}
      {rascunhoEditId && (
        <div className="modal-overlay" onClick={() => setRascunhoEditId(null)} style={{ zIndex: 1200 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, width: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: '12px 12px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '-24px -24px 20px -24px' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>✏ Editar Rascunho</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', marginTop: 2 }}>{rascunhoEditForm.nome_completo || 'Novo cadastro'}</div>
              </div>
              <button onClick={() => setRascunhoEditId(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Foto */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {rascunhoEditForm.foto_url || rascunhoFotoFile ? (
                  <img src={rascunhoFotoFile ? URL.createObjectURL(rascunhoFotoFile) : rascunhoEditForm.foto_url}
                    alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid #f59e0b' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', border: '3px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>👤</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => rascunhoFotoRef.current?.click()}
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                  📷 Alterar Foto
                </button>
                {(rascunhoEditForm.foto_url || rascunhoFotoFile) && (
                  <button type="button" onClick={() => { setRascunhoEditForm((p: any) => ({ ...p, foto_url: null })); setRascunhoFotoFile(null); }}
                    style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                    🗑 Remover Foto
                  </button>
                )}
                <input ref={rascunhoFotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setRascunhoFotoFile(f); }} />
              </div>
            </div>

            <div className="detail-grid" style={{ gap: 12 }}>
              {[
                ['Nome Completo', 'nome_completo', 'text', 'detail-full'],
                ['CPF', 'cpf', 'text', ''],
                ['Identidade (RG)', 'identidade', 'text', ''],
                ['Data de Nascimento', 'data_nascimento', 'date', ''],
                ['Telefone', 'telefone', 'text', ''],
                ['E-mail', 'email', 'email', ''],
              ].map(([label, name, type, cls]) => (
                <div key={name as string} className={`detail-item ${cls}`}>
                  <span className="detail-label">{label as string}</span>
                  <input className="edit-input" type={type as string} name={name as string} value={rascunhoEditForm[name as string] || ''} onChange={e => setRascunhoEditForm((p: any) => ({ ...p, [name as string]: e.target.value }))} />
                </div>
              ))}
              <div className="detail-item">
                <span className="detail-label">Núcleo</span>
                <select className="edit-input" value={rascunhoEditForm.nucleo || ''} onChange={e => setRascunhoEditForm((p: any) => ({ ...p, nucleo: e.target.value }))}>
                  <option value="">Selecione</option>
                  <option value="Saracuruna">Núcleo Saracuruna</option>
                  <option value="Poliesportivo Edson Alves">Poliesportivo Edson Alves</option>
                  <option value="Poliesportivo do Ipiranga">Poliesportivo do Ipiranga</option>
                  <option value="Vila Urussaí">Vila Urussaí</option>
                  <option value="Jayme Fichman">Jayme Fichman</option>
                </select>
              </div>
              <div className="detail-item">
                <span className="detail-label">Graduação</span>
                <select className="edit-input" value={rascunhoEditForm.graduacao || ''} onChange={e => setRascunhoEditForm((p: any) => ({ ...p, graduacao: e.target.value }))}>
                  <option value="">Selecione</option>
                  {graduacoes.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="detail-full" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <span className="detail-label" style={{ marginBottom: 6 }}>Endereço</span>
              </div>
              {[
                ['CEP', 'cep', ''], ['Estado', 'estado', ''], ['Endereço', 'endereco', 'detail-full'],
                ['Número', 'numero', ''], ['Bairro', 'bairro', ''], ['Cidade', 'cidade', ''],
              ].map(([label, name, cls]) => (
                <div key={name as string} className={`detail-item ${cls}`}>
                  <span className="detail-label">{label as string}</span>
                  <input className="edit-input" name={name as string} value={rascunhoEditForm[name as string] || ''} onChange={e => setRascunhoEditForm((p: any) => ({ ...p, [name as string]: e.target.value }))} />
                </div>
              ))}
              {[
                ['Nome do Pai', 'nome_pai'], ['Nome da Mãe', 'nome_mae'], ['Nome do Responsável', 'nome_responsavel'], ['CPF do Responsável', 'cpf_responsavel'],
              ].map(([label, name]) => (
                <div key={name as string} className="detail-item">
                  <span className="detail-label">{label as string}</span>
                  <input className="edit-input" name={name as string} value={rascunhoEditForm[name as string] || ''} onChange={e => setRascunhoEditForm((p: any) => ({ ...p, [name as string]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setRascunhoEditId(null)}
                style={{ flex: 1, padding: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button disabled={rascunhoSaving} onClick={async () => {
                setRascunhoSaving(true);
                try {
                  let foto_url = rascunhoEditForm.foto_url || null;
                  if (rascunhoFotoFile) {
                    // Upload photo to Supabase storage
                    const ext = rascunhoFotoFile.name.split('.').pop() || 'jpg';
                    const path = `rascunho-fotos/${rascunhoEditId}_${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, rascunhoFotoFile, { upsert: true });
                    if (!upErr) { const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(path); foto_url = pubData.publicUrl; }
                  }
                  const updated = { ...rascunhoEditForm, foto_url, updated_at: new Date().toISOString() };
                  await fetch('/api/rascunhos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                  setRascunhos(prev => prev.map((x: any) => x.id === rascunhoEditId ? updated : x));
                  setRascunhoEditId(null);
                  setRascunhoFotoFile(null);
                } catch (err: any) { alert('Erro: ' + err.message); }
                setRascunhoSaving(false);
              }}
                style={{ flex: 2, padding: 10, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', color: '#fff', borderRadius: 10, cursor: rascunhoSaving ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: rascunhoSaving ? 0.7 : 1 }}>
                {rascunhoSaving ? '⏳ Salvando...' : '💾 Salvar Rascunho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Novo Rascunho ── */}
      {showRascunhoNew && (
        <div className="modal-overlay" onClick={() => setShowRascunhoNew(false)} style={{ zIndex: 1200 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, width: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: '12px 12px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '-24px -24px 20px -24px' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>➕ Novo Rascunho de Cadastro</div>
              <button onClick={() => setShowRascunhoNew(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div className="detail-grid" style={{ gap: 12 }}>
              {[
                ['Nome Completo', 'nome_completo', 'text', 'detail-full'],
                ['CPF', 'cpf', 'text', ''], ['Identidade', 'identidade', 'text', ''],
                ['Nascimento', 'data_nascimento', 'date', ''], ['Telefone', 'telefone', 'text', ''],
                ['E-mail', 'email', 'email', ''],
              ].map(([label, name, type, cls]) => (
                <div key={name as string} className={`detail-item ${cls}`}>
                  <span className="detail-label">{label as string}</span>
                  <input className="edit-input" type={type as string} value={newRascunhoForm[name as string] || ''} onChange={e => setNewRascunhoForm((p: any) => ({ ...p, [name as string]: e.target.value }))} />
                </div>
              ))}
              <div className="detail-item">
                <span className="detail-label">Núcleo</span>
                <select className="edit-input" value={newRascunhoForm.nucleo || ''} onChange={e => setNewRascunhoForm((p: any) => ({ ...p, nucleo: e.target.value }))}>
                  <option value="">Selecione</option>
                  <option value="Saracuruna">Saracuruna</option>
                  <option value="Poliesportivo Edson Alves">Poliesportivo Edson Alves</option>
                  <option value="Poliesportivo do Ipiranga">Poliesportivo do Ipiranga</option>
                  <option value="Vila Urussaí">Vila Urussaí</option>
                  <option value="Jayme Fichman">Jayme Fichman</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowRascunhoNew(false)}
                style={{ flex: 1, padding: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={async () => {
                setRascunhoSaving(true);
                try {
                  const id = `r_${Date.now()}`;
                  const payload = { ...newRascunhoForm, id, updated_at: new Date().toISOString() };
                  await fetch('/api/rascunhos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  setRascunhos(prev => [payload, ...prev]);
                  setRascunhosCount(c => c + 1);
                  setShowRascunhoNew(false);
                  setNewRascunhoForm({});
                } catch (err: any) { alert('Erro: ' + err.message); }
                setRascunhoSaving(false);
              }}
                disabled={rascunhoSaving}
                style={{ flex: 2, padding: 10, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                {rascunhoSaving ? '⏳ Salvando...' : '💾 Criar Rascunho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ABA JUSTIFICATIVAS ===== */}
      {activeTab === 'justificativas' && (
        <div style={{ paddingTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>📝 Justificativas de Falta</h2>
            <button
              onClick={() => {
                setLoadingJustificativas(true);
                const url = nucleoFilter ? `/api/aluno/justificativas?admin=true&nucleo=${encodeURIComponent(nucleoFilter)}` : '/api/aluno/justificativas?admin=true';
                fetch(url).then(r => r.json()).then(d => { setJustificativas(Array.isArray(d) ? d : []); setLoadingJustificativas(false); }).catch(() => setLoadingJustificativas(false));
              }}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
            >
              🔄 Atualizar
            </button>
          </div>
          {justMsg && <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 16, background: justMsg.includes('✅') ? '#f0fdf4' : '#fef2f2', color: justMsg.includes('✅') ? '#166534' : '#991b1b', border: `1px solid ${justMsg.includes('✅') ? '#bbf7d0' : '#fecaca'}`, fontSize: '0.85rem' }}>{justMsg}</div>}
          {loadingJustificativas ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>Carregando...</div>
          ) : justificativas.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>Nenhuma justificativa encontrada.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(['pendente', 'aprovado', 'recusado'] as const).map(status => {
                const filtered = justificativas.filter(j => j.status === status && (!nucleoFilter || j.nucleo === nucleoFilter));
                if (filtered.length === 0) return null;
                return (
                  <div key={status}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: status === 'pendente' ? '#b45309' : status === 'aprovado' ? '#15803d' : '#b91c1c', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {status === 'pendente' ? '⏳ Pendentes' : status === 'aprovado' ? '✅ Aprovadas' : '❌ Recusadas'} ({filtered.length})
                    </h3>
                    {filtered.map(j => (
                      <div key={j.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{j.student_name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{j.nucleo} • {new Date(j.data_falta + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: 6 }}>{j.motivo}</div>
                            {j.resposta_mestre && <div style={{ fontSize: '0.8rem', color: '#2563eb', marginTop: 4 }}>Resposta: {j.resposta_mestre}</div>}
                          </div>
                          {j.status === 'pendente' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
                              <input
                                type="text"
                                placeholder="Resposta (opcional)"
                                value={justRespostaMap[j.id] || ''}
                                onChange={e => setJustRespostaMap(prev => ({ ...prev, [j.id]: e.target.value }))}
                                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.8rem', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                              />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={async () => {
                                    const res = await fetch('/api/aluno/justificativas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review', id: j.id, status: 'aprovado', resposta_mestre: justRespostaMap[j.id] || '' }) });
                                    if (res.ok) { setJustificativas(prev => prev.map(x => x.id === j.id ? { ...x, status: 'aprovado' as const, resposta_mestre: justRespostaMap[j.id] || '' } : x)); setJustMsg('✅ Justificativa aprovada.'); }
                                  }}
                                  style={{ flex: 1, padding: '6px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}
                                >✅ Aprovar</button>
                                <button
                                  onClick={async () => {
                                    const res = await fetch('/api/aluno/justificativas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review', id: j.id, status: 'recusado', resposta_mestre: justRespostaMap[j.id] || '' }) });
                                    if (res.ok) { setJustificativas(prev => prev.map(x => x.id === j.id ? { ...x, status: 'recusado' as const, resposta_mestre: justRespostaMap[j.id] || '' } : x)); setJustMsg('❌ Justificativa recusada.'); }
                                  }}
                                  style={{ flex: 1, padding: '6px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}
                                >❌ Recusar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== ABA CONTAS ALUNOS ===== */}
      {activeTab === 'contas' && (
        <div style={{ paddingTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>👤 Contas de Alunos</h2>
            <button
              onClick={async () => {
                setContasMsg('');
                const res = await fetch('/api/aluno/gerar-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk-assign' }) });
                const d = await res.json();
                setContasMsg(`✅ ${d.assigned} IDs gerados! Total: ${d.total} alunos.`);
                // Reload id map
                fetch('/api/aluno/gerar-id').then(r => r.json()).then(d2 => { if (d2 && typeof d2 === 'object') setStudentDisplayIds(d2 as Record<string, string>); }).catch(() => {});
                fetch('/api/aluno/contas').then(r => r.json()).then(d2 => setAlunoContas(Array.isArray(d2) ? d2 : [])).catch(() => {});
              }}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
            >
              🔢 Gerar IDs p/ Alunos Existentes
            </button>
          </div>

          {contasMsg && <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 16, background: contasMsg.includes('✅') ? '#f0fdf4' : '#fef2f2', color: contasMsg.includes('✅') ? '#166534' : '#991b1b', border: `1px solid ${contasMsg.includes('✅') ? '#bbf7d0' : '#fecaca'}`, fontSize: '0.85rem' }}>{contasMsg}</div>}

          {/* Create account */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>➕ Criar conta para aluno</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Login gerado automaticamente: nome + ID sequencial ACCBM. Senha informada aqui é a senha inicial do aluno.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Nome Completo do Aluno *</label>
                <select
                  value={novaContaForm.student_id}
                  onChange={e => {
                    const sid = e.target.value;
                    const st = (nucleoFilter ? students.filter(s => s.nucleo === nucleoFilter) : students).find(s => s.id === sid);
                    setNovaContaForm(prev => ({ ...prev, student_id: sid, email: (st as any)?.email || '' }));
                  }}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                >
                  <option value="">— Selecione o aluno —</option>
                  {(nucleoFilter ? students.filter(s => s.nucleo === nucleoFilter) : students)
                    .filter(s => !alunoContas.find(a => a.student_id === s.id))
                    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nome_completo}{studentDisplayIds[s.id] ? ` — ${studentDisplayIds[s.id]}` : ''}
                      </option>
                    ))}
                </select>
                {novaContaForm.student_id && (() => {
                  const existingAcc = alunoContas.find(a => a.student_id === novaContaForm.student_id);
                  if (existingAcc) return <div style={{ marginTop: 4, fontSize: '0.74rem', color: '#b45309' }}>⚠ Este aluno já possui conta: <strong>{existingAcc.username}</strong></div>;
                  return null;
                })()}
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Email (para recuperar senha)</label>
                <input
                  type="email"
                  value={novaContaForm.email}
                  onChange={e => setNovaContaForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Senha inicial *</label>
                <input
                  type="password"
                  value={novaContaForm.password}
                  onChange={e => setNovaContaForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Mín. 6 caracteres"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Confirmar senha *</label>
                <input
                  type="password"
                  value={novaContaForm.confirm_password}
                  onChange={e => setNovaContaForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                  placeholder="Repita a senha"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box', borderColor: novaContaForm.confirm_password && novaContaForm.confirm_password !== novaContaForm.password ? '#dc2626' : '' }}
                />
                {novaContaForm.confirm_password && novaContaForm.confirm_password !== novaContaForm.password && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 2 }}>As senhas não coincidem</div>
                )}
              </div>
            </div>
            <button
              onClick={async () => {
                setContasMsg('');
                if (!novaContaForm.student_id) { setContasMsg('❌ Selecione um aluno.'); return; }
                if (!novaContaForm.password || novaContaForm.password.length < 6) { setContasMsg('❌ Senha deve ter pelo menos 6 caracteres.'); return; }
                if (novaContaForm.password !== novaContaForm.confirm_password) { setContasMsg('❌ As senhas não coincidem.'); return; }
                const nucleo_filter = activeNucleo !== 'geral' ? nucleoFilter : undefined;
                const st = students.find(s => s.id === novaContaForm.student_id);
                const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'admin-create-auto', student_id: novaContaForm.student_id, password: novaContaForm.password, phone: (st as any)?.telefone || '', email: novaContaForm.email, nucleo_filter, nome_completo: st?.nome_completo || '', nucleo: st?.nucleo || '', telefone: (st as any)?.telefone || '' }) });
                const d = await res.json();
                if (!res.ok) { setContasMsg(`❌ ${d.error}`); return; }
                setContasMsg(`✅ Conta criada! Login: ${d.username} | ID: ${d.display_id || studentDisplayIds[novaContaForm.student_id] || '—'}`);
                setNovaContaForm({ student_id: '', password: '', confirm_password: '', email: '' });
                fetch('/api/aluno/contas').then(r => r.json()).then(d2 => setAlunoContas(Array.isArray(d2) ? d2 : [])).catch(() => {});
              }}
              style={{ padding: '9px 24px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
            >
              ➕ Criar Conta de Acesso
            </button>
          </div>

          {/* Reset password */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>🔑 Resetar / Alterar senha de aluno</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Use para redefinir a senha de acesso de um aluno já cadastrado.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Aluno</label>
                <select
                  value={resetPassForm.student_id}
                  onChange={e => setResetPassForm(prev => ({ ...prev, student_id: e.target.value }))}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                >
                  <option value="">— Selecione o aluno —</option>
                  {alunoContas
                    .filter(acc => {
                      if (activeNucleo === 'geral') return true;
                      const st = students.find(s => s.id === acc.student_id);
                      return st?.nucleo === nucleoFilter;
                    })
                    .map(acc => {
                      const st = students.find(s => s.id === acc.student_id);
                      return (
                        <option key={acc.student_id} value={acc.student_id}>
                          {st?.nome_completo || acc.student_id.slice(0, 8)} — {acc.username}{acc.display_id ? ` (${acc.display_id})` : ''}
                        </option>
                      );
                    })}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Nova senha *</label>
                <input type="password" value={resetPassForm.new_password} onChange={e => setResetPassForm(prev => ({ ...prev, new_password: e.target.value }))} placeholder="Mín. 6 caracteres" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Confirmar nova senha *</label>
                <input type="password" value={resetPassForm.confirm_new_password} onChange={e => setResetPassForm(prev => ({ ...prev, confirm_new_password: e.target.value }))} placeholder="Repita a senha" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
              </div>
            </div>
            <button
              onClick={async () => {
                setContasMsg('');
                if (!resetPassForm.student_id) { setContasMsg('❌ Selecione um aluno.'); return; }
                if (!resetPassForm.new_password || resetPassForm.new_password.length < 6) { setContasMsg('❌ Senha deve ter mínimo 6 caracteres.'); return; }
                if (resetPassForm.new_password !== resetPassForm.confirm_new_password) { setContasMsg('❌ As senhas não coincidem.'); return; }
                const res = await fetch('/api/aluno/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'admin-reset-password', student_id: resetPassForm.student_id, new_password: resetPassForm.new_password }) });
                const d = await res.json();
                setContasMsg(res.ok ? '✅ Senha redefinida com sucesso!' : `❌ ${d.error}`);
                if (res.ok) setResetPassForm({ student_id: '', new_password: '', confirm_new_password: '' });
              }}
              style={{ padding: '9px 24px', borderRadius: 8, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
            >🔑 Redefinir Senha</button>
          </div>

          {/* Accounts report — filtered by nucleo for responsáveis */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  📋 Contas cadastradas
                  {nucleoFilter && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, marginLeft: 8 }}>— {nucleoFilter}</span>}
                </h3>
                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  {activeNucleo === 'geral' ? 'Todos os núcleos visíveis' : `Exibindo apenas ${nucleoFilter}`}
                </p>
              </div>
              <button onClick={() => {
                setLoadingContas(true);
                Promise.all([
                  fetch('/api/aluno/contas').then(r => r.json()),
                  fetch('/api/aluno/gerar-id').then(r => r.json()),
                ]).then(([contas, idMap]) => {
                  setAlunoContas(Array.isArray(contas) ? contas : []);
                  if (idMap && typeof idMap === 'object') setStudentDisplayIds(idMap as Record<string, string>);
                  setLoadingContas(false);
                }).catch(() => setLoadingContas(false));
              }} style={{ padding: '6px 14px', borderRadius: 6, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>🔄 Atualizar</button>
            </div>

            {loadingContas ? <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>Carregando...</div>
            : (() => {
                // Filter by nucleo for non-geral profiles
                const visibleStudents = nucleoFilter
                  ? students.filter(s => s.nucleo === nucleoFilter)
                  : students;
                const visibleIds = new Set(visibleStudents.map(s => s.id));
                const filteredContas = activeNucleo === 'geral'
                  ? alunoContas
                  : alunoContas.filter(acc => visibleIds.has(acc.student_id));

                // Students without accounts
                const withAccounts = new Set(filteredContas.map(a => a.student_id));
                const withoutAccount = visibleStudents.filter(s => !withAccounts.has(s.id));

                return (
                  <>
                    {withoutAccount.length > 0 && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                          ⚠ {withoutAccount.length} aluno{withoutAccount.length !== 1 ? 's' : ''} sem conta de acesso
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {withoutAccount.slice(0, 10).map(s => (
                            <span key={s.id} style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px', fontSize: '0.76rem', color: '#78350f' }}>
                              {s.nome_completo.split(' ')[0]} {s.nome_completo.split(' ').slice(-1)[0]}{studentDisplayIds[s.id] ? ` (${studentDisplayIds[s.id]})` : ''}
                            </span>
                          ))}
                          {withoutAccount.length > 10 && <span style={{ fontSize: '0.76rem', color: '#92400e' }}>+{withoutAccount.length - 10} mais...</span>}
                        </div>
                      </div>
                    )}

                    {filteredContas.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20, fontSize: '0.85rem' }}>
                        {nucleoFilter ? `Nenhuma conta cadastrada para ${nucleoFilter}.` : 'Nenhuma conta cadastrada.'}
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-input)' }}>
                              {['ID ACCBM', 'Nome Completo do Aluno', 'Login (Usuário)', 'E-mail', 'WhatsApp', 'Núcleo', 'Status', 'Criado em', 'Último acesso'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '9px 10px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredContas.map(acc => {
                              const st = students.find(s => s.id === acc.student_id);
                              const displayId = acc.display_id || studentDisplayIds[acc.student_id] || '—';
                              return (
                                <tr key={acc.student_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 800, color: '#6366f1', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{displayId}</td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontWeight: 600, minWidth: 160 }}>{st?.nome_completo || '—'}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', fontSize: '0.82rem' }}>{acc.username}</span>
                                  </td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{acc.email || '—'}</td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{acc.phone || '—'}</td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st?.nucleo || '—'}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700, background: acc.active ? '#dcfce7' : '#fef9c3', color: acc.active ? '#166534' : '#854d0e' }}>
                                      {acc.active ? '✅ Ativa' : '⏳ Pendente'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{acc.created_at ? new Date(acc.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{acc.last_login ? new Date(acc.last_login).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : <span style={{ color: '#d97706', fontSize: '0.74rem' }}>Nunca acessou</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Total: <strong>{filteredContas.length}</strong> conta{filteredContas.length !== 1 ? 's' : ''} {nucleoFilter ? `em ${nucleoFilter}` : 'no sistema'}
                          {' · '}{filteredContas.filter(a => a.active).length} ativas{' · '}{filteredContas.filter(a => !a.active).length} pendentes
                        </div>
                      </div>
                    )}
                  </>
                );
              })()
            }
          </div>
        </div>
      )}

      {/* ===== ABA AUDITORIA (geral only) ===== */}
      {activeTab === 'auditoria' && activeNucleo === 'geral' && (
        <div style={{ paddingTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: '0 0 2px', fontSize: '1.15rem', color: 'var(--text-primary)' }}>🔍 Auditoria do Sistema</h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Registro de ações administrativas — últimas 200 entradas</p>
            </div>
            <button
              onClick={() => { setLoadingAudit(true); fetch('/api/admin/logs').then(r => r.json()).then(d => { setAuditLogs(Array.isArray(d) ? d : []); setLoadingAudit(false); }).catch(() => setLoadingAudit(false)); }}
              style={{ padding: '7px 16px', borderRadius: 8, background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
            >🔄 Atualizar</button>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 14 }}>
            <input
              type="text"
              placeholder="Buscar por ação, usuário, núcleo..."
              value={auditSearch}
              onChange={e => setAuditSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          {loadingAudit ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>Carregando logs...</div>
          ) : (() => {
            const q = auditSearch.toLowerCase();
            const filtered = q
              ? auditLogs.filter(e => e.action.toLowerCase().includes(q) || e.user.toLowerCase().includes(q) || e.nucleo.toLowerCase().includes(q) || (e.details || '').toLowerCase().includes(q))
              : auditLogs;

            if (filtered.length === 0) return (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40, fontSize: '0.85rem' }}>
                {auditSearch ? 'Nenhum resultado para esta busca.' : 'Nenhum log de auditoria encontrado.'}
              </div>
            );

            const actionColors: Record<string, { bg: string; color: string }> = {
              login:          { bg: '#dcfce7', color: '#166534' },
              login_cpf:      { bg: '#dbeafe', color: '#1e40af' },
              logout:         { bg: '#fef3c7', color: '#92400e' },
              delete:         { bg: '#fee2e2', color: '#991b1b' },
              edit:           { bg: '#ede9fe', color: '#5b21b6' },
              create:         { bg: '#d1fae5', color: '#065f46' },
              export:         { bg: '#e0f2fe', color: '#0369a1' },
              background:     { bg: '#f0fdf4', color: '#166534' },
              'bulk-action':  { bg: '#fef9c3', color: '#854d0e' },
            };
            const getActionStyle = (action: string) => {
              for (const [key, style] of Object.entries(actionColors)) {
                if (action.toLowerCase().includes(key)) return style;
              }
              return { bg: '#f1f5f9', color: '#475569' };
            };

            return (
              <div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)', borderBottom: '2px solid var(--border)' }}>
                        {['Data/Hora', 'Ação', 'Usuário', 'Núcleo', 'Detalhes'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '9px 12px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(entry => {
                        const aStyle = getActionStyle(entry.action);
                        return (
                          <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>
                              {new Date(entry.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td style={{ padding: '7px 12px' }}>
                              <span style={{ background: aStyle.bg, color: aStyle.color, padding: '2px 8px', borderRadius: 8, fontWeight: 700, fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                                {entry.action}
                              </span>
                            </td>
                            <td style={{ padding: '7px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{entry.user}</td>
                            <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{entry.nucleo}</td>
                            <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', fontSize: '0.78rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.details}>
                              {entry.details || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 10, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  Exibindo {filtered.length} de {auditLogs.length} registros
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ===== ABA RESPONSÁVEIS DE NÚCLEO (geral only) ===== */}
      {activeTab === 'responsaveis' && activeNucleo === 'geral' && (
        <div style={{ paddingTop: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem', color: 'var(--text-primary)' }}>👥 Responsáveis de Núcleo</h2>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Crie logins de acesso para responsáveis de cada núcleo. Cada responsável acessa apenas o seu núcleo.
            </p>
          </div>

          {/* Auth gate */}
          {!respAdminAuthed ? (
            <div style={{ maxWidth: 420, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>🔐</div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>Confirme sua identidade</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Digite sua senha de Admin Geral para gerenciar responsáveis</div>
              </div>
              <input
                type="password"
                placeholder="Sua senha atual de Admin Geral"
                value={respAdminPass}
                onChange={e => { setRespAdminPass(e.target.value); setRespAuthMsg(''); }}
                onKeyDown={async e => { if (e.key === 'Enter') {
                  if (!respAdminPass) { setRespAuthMsg('Digite sua senha.'); return; }
                  setRespLoading(true);
                  const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list-users', admin_username: 'admin', admin_password: respAdminPass }) });
                  const d = await res.json();
                  if (res.ok) { setRespUsers(d.filter((u: any) => u.nucleo !== 'geral')); setRespAdminAuthed(true); setRespAuthMsg(''); }
                  else setRespAuthMsg(d.error || 'Senha incorreta.');
                  setRespLoading(false);
                }}}
                style={{ padding: '10px 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
              />
              {respAuthMsg && <div style={{ color: '#ef4444', fontSize: '0.78rem', fontWeight: 600 }}>⚠ {respAuthMsg}</div>}
              <button disabled={respLoading} onClick={async () => {
                if (!respAdminPass) { setRespAuthMsg('Digite sua senha.'); return; }
                setRespLoading(true);
                const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list-users', admin_username: 'admin', admin_password: respAdminPass }) });
                const d = await res.json();
                if (res.ok) { setRespUsers(d.filter((u: any) => u.nucleo !== 'geral')); setRespAdminAuthed(true); setRespAuthMsg(''); }
                else setRespAuthMsg(d.error || 'Senha incorreta.');
                setRespLoading(false);
              }} style={{ padding: '10px', borderRadius: 9, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', border: 'none', color: '#fff', fontWeight: 700, cursor: respLoading ? 'wait' : 'pointer', opacity: respLoading ? 0.7 : 1, fontSize: '0.95rem' }}>
                {respLoading ? '⏳ Verificando...' : '🔓 Acessar Gerenciamento'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

              {/* Lista de responsáveis existentes */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 800 }}>Responsáveis cadastrados ({respUsers.length})</h3>
                  <button onClick={async () => {
                    setRespLoading(true);
                    const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list-users', admin_username: 'admin', admin_password: respAdminPass }) });
                    const d = await res.json();
                    if (res.ok) setRespUsers(d.filter((u: any) => u.nucleo !== 'geral'));
                    setRespLoading(false);
                  }} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    🔄 Atualizar lista
                  </button>
                </div>
                {respUsers.length === 0 ? (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    Nenhum responsável cadastrado ainda. Use o formulário abaixo para criar o primeiro.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {respUsers.map(u => (
                      <div key={u.username} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: u.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{u.label}</div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Login: <strong style={{ color: 'var(--text-primary)' }}>{u.username}</strong></div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => { setRespResetTarget(u.username); setRespResetPass(''); setRespResetMsg(''); }} style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#ca8a04', borderRadius: 8, padding: '5px 12px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                            🔑 Resetar Senha
                          </button>
                          <button onClick={() => { setRespDeleteTarget(u.username); setRespDeleteMsg(''); }} style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#ef4444', borderRadius: 8, padding: '5px 12px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                            🗑 Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reset senha inline */}
              {respResetTarget && (
                <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 12 }}>🔑 Resetar senha de <span style={{ color: '#ca8a04' }}>{respResetTarget}</span></div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="password" placeholder="Nova senha (mín. 6 caracteres)" value={respResetPass} onChange={e => { setRespResetPass(e.target.value); setRespResetMsg(''); }}
                      style={{ flex: 1, minWidth: 200, padding: '9px 13px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }} />
                    <button disabled={respResetting} onClick={async () => {
                      if (!respResetPass || respResetPass.length < 6) { setRespResetMsg('Senha deve ter mínimo 6 caracteres.'); return; }
                      setRespResetting(true);
                      const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-password', admin_username: 'admin', admin_password: respAdminPass, target_username: respResetTarget, new_password: respResetPass }) });
                      const d = await res.json();
                      setRespResetMsg(res.ok ? '✓ Senha redefinida com sucesso!' : (d.error || 'Erro ao redefinir.'));
                      if (res.ok) { setRespResetPass(''); setTimeout(() => { setRespResetTarget(''); setRespResetMsg(''); }, 2000); }
                      setRespResetting(false);
                    }} style={{ padding: '9px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#b45309,#d97706)', border: 'none', color: '#fff', fontWeight: 700, cursor: respResetting ? 'wait' : 'pointer', fontSize: '0.88rem' }}>
                      {respResetting ? '⏳...' : 'Salvar'}
                    </button>
                    <button onClick={() => { setRespResetTarget(''); setRespResetMsg(''); }} style={{ padding: '9px 14px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
                  </div>
                  {respResetMsg && <div style={{ marginTop: 8, fontSize: '0.78rem', fontWeight: 600, color: respResetMsg.startsWith('✓') ? '#22c55e' : '#ef4444' }}>{respResetMsg}</div>}
                </div>
              )}

              {/* Confirmar remoção */}
              {respDeleteTarget && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 8 }}>🗑 Remover responsável <span style={{ color: '#ef4444' }}>{respDeleteTarget}</span>?</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 14 }}>Esta ação é irreversível. O usuário perderá o acesso ao painel.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={respDeleting} onClick={async () => {
                      setRespDeleting(true);
                      const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-user', admin_username: 'admin', admin_password: respAdminPass, target_username: respDeleteTarget }) });
                      const d = await res.json();
                      if (res.ok) {
                        setRespUsers(prev => prev.filter(u => u.username !== respDeleteTarget));
                        setRespDeleteTarget('');
                        setRespDeleteMsg('');
                      } else setRespDeleteMsg(d.error || 'Erro ao remover.');
                      setRespDeleting(false);
                    }} style={{ padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', border: 'none', color: '#fff', fontWeight: 700, cursor: respDeleting ? 'wait' : 'pointer', fontSize: '0.88rem' }}>
                      {respDeleting ? '⏳ Removendo...' : '🗑 Confirmar Remoção'}
                    </button>
                    <button onClick={() => { setRespDeleteTarget(''); setRespDeleteMsg(''); }} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancelar</button>
                  </div>
                  {respDeleteMsg && <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#ef4444', fontWeight: 600 }}>{respDeleteMsg}</div>}
                </div>
              )}

              {/* Criar novo responsável */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 22px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 800 }}>➕ Cadastrar Novo Responsável</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Núcleo</div>
                    <select value={respNewNucleo} onChange={e => { setRespNewNucleo(e.target.value); setRespCreateMsg(''); }}
                      style={{ width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }}>
                      <option value="">Selecione o núcleo</option>
                      <option value="edson-alves">Poliesportivo Edson Alves</option>
                      <option value="ipiranga">Poliesportivo do Ipiranga</option>
                      <option value="saracuruna">Núcleo Saracuruna</option>
                      <option value="vila-urussai">Núcleo Vila Urussaí</option>
                      <option value="jayme-fichman">Núcleo Jayme Fichman</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Login (usuário)</div>
                    <input type="text" placeholder="ex: responsavel_sara" value={respNewLogin} onChange={e => { setRespNewLogin(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')); setRespCreateMsg(''); }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }} />
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 3 }}>Apenas letras, números, _ e -</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Senha inicial</div>
                    <input type="password" placeholder="mínimo 6 caracteres" value={respNewPass} onChange={e => { setRespNewPass(e.target.value); setRespCreateMsg(''); }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }} />
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 3 }}>O responsável poderá alterar depois</div>
                  </div>
                </div>
                {respCreateMsg && (
                  <div style={{ marginTop: 12, borderRadius: 8, padding: '8px 13px', background: respCreateMsg.startsWith('✓') ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)', border: `1px solid ${respCreateMsg.startsWith('✓') ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.25)'}`, color: respCreateMsg.startsWith('✓') ? '#22c55e' : '#ef4444', fontSize: '0.8rem', fontWeight: 600 }}>
                    {respCreateMsg}
                  </div>
                )}
                <button disabled={respCreating} onClick={async () => {
                  if (!respNewNucleo || !respNewLogin || !respNewPass) { setRespCreateMsg('Preencha todos os campos.'); return; }
                  if (respNewLogin.length < 3) { setRespCreateMsg('Login deve ter pelo menos 3 caracteres.'); return; }
                  if (respNewPass.length < 6) { setRespCreateMsg('Senha deve ter pelo menos 6 caracteres.'); return; }
                  setRespCreating(true);
                  const res = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-user', admin_username: 'admin', admin_password: respAdminPass, new_username: respNewLogin, new_password: respNewPass, nucleo_key: respNewNucleo }) });
                  const d = await res.json();
                  if (res.ok) {
                    setRespCreateMsg(`✓ Responsável "${d.username}" criado! Login: ${d.username}`);
                    setRespNewLogin(''); setRespNewPass(''); setRespNewNucleo('');
                    const listRes = await fetch('/api/admin/panel-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list-users', admin_username: 'admin', admin_password: respAdminPass }) });
                    const listD = await listRes.json();
                    if (listRes.ok) setRespUsers(listD.filter((u: any) => u.nucleo !== 'geral'));
                  } else {
                    setRespCreateMsg(d.error || 'Erro ao criar responsável.');
                  }
                  setRespCreating(false);
                }} style={{ marginTop: 16, padding: '10px 28px', borderRadius: 9, background: 'linear-gradient(135deg,#059669,#047857)', border: 'none', color: '#fff', fontWeight: 700, cursor: respCreating ? 'wait' : 'pointer', opacity: respCreating ? 0.7 : 1, fontSize: '0.92rem' }}>
                  {respCreating ? '⏳ Criando...' : '✅ Criar Responsável'}
                </button>
              </div>

              {/* Info box */}
              <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#60a5fa', marginBottom: 6 }}>ℹ️ Como funciona</div>
                <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  <li>Você cria o login e a senha inicial para o responsável</li>
                  <li>O responsável acessa o painel com o login e senha que você definiu</li>
                  <li>Ao entrar, ele verá apenas os dados do núcleo associado ao login</li>
                  <li>O responsável pode alterar a própria senha em <strong>🔑 Alterar Minha Senha</strong> na tela de login</li>
                  <li>Você pode redefinir a senha de qualquer responsável a qualquer momento</li>
                  <li>Para mudar o núcleo de um responsável, remova e recrie com outro núcleo</li>
                </ul>
              </div>

              <button onClick={() => { setRespAdminAuthed(false); setRespAdminPass(''); setRespUsers([]); }} style={{ alignSelf: 'flex-start', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                🔒 Encerrar sessão de gerenciamento
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
