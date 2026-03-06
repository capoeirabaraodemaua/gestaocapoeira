'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Student {
  id: string;
  nome_completo: string;
  cpf: string;
  data_nascimento: string;
  nome_pai: string;
  nome_mae: string;
  nucleo: string | null;
  nome_responsavel: string | null;
  cpf_responsavel: string | null;
  assinatura_responsavel: boolean;
  assinatura_pai: boolean;
  assinatura_mae: boolean;
  menor_de_idade: boolean;
}

function TermoContent() {
  const params = useSearchParams();
  const studentId = params.get('id');

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    nome_responsavel: '',
    cpf_responsavel: '',
  });

  useEffect(() => {
    if (!studentId) { setNotFound(true); setLoading(false); return; }
    loadStudent(studentId);
  }, [studentId]);

  const loadStudent = async (id: string) => {
    try {
      // Tenta via API server-side primeiro (mais confiável)
      const res = await fetch(`/api/termo?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const s = await res.json() as Student;
        setStudent(s);
        setForm({ nome_responsavel: s.nome_responsavel || '', cpf_responsavel: s.cpf_responsavel || '' });
        setLoading(false);
        return;
      }
      // Fallback: acesso direto ao Supabase
      const { data, error } = await supabase
        .from('students')
        .select('id,nome_completo,cpf,data_nascimento,nome_pai,nome_mae,nucleo,nome_responsavel,cpf_responsavel,assinatura_responsavel,menor_de_idade')
        .eq('id', id)
        .single();
      if (error || !data) throw new Error(error?.message || 'not found');
      const s = data as Student;
      setStudent(s);
      setForm({ nome_responsavel: s.nome_responsavel || '', cpf_responsavel: s.cpf_responsavel || '' });
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  };

  const formatCPF = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const handleSave = async () => {
    if (!student) return;
    if (!form.nome_responsavel.trim()) {
      alert('Preencha o nome do responsável antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      // Salva via API server-side (usa service role, mais confiável)
      const res = await fetch(`/api/termo?id=${student.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_responsavel: form.nome_responsavel, cpf_responsavel: form.cpf_responsavel }),
      });
      if (!res.ok) throw new Error('api error');
      setSaved(true);
      setStudent(prev => prev ? { ...prev, ...form, assinatura_responsavel: true } : prev);
    } catch {
      // Fallback direto ao Supabase
      const { error } = await supabase.from('students').update({
        nome_responsavel: form.nome_responsavel,
        cpf_responsavel: form.cpf_responsavel,
        assinatura_responsavel: true,
      }).eq('id', student.id);
      if (error) { alert('Erro ao salvar. Tente novamente.'); setSaving(false); return; }
      setSaved(true);
      setStudent(prev => prev ? { ...prev, ...form, assinatura_responsavel: true } : prev);
    }
    setSaving(false);
  };

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
      Carregando...
    </div>
  );

  if (notFound || !student) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: '2rem' }}>⚠</div>
      <div style={{ fontWeight: 700 }}>Aluno não encontrado</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Verifique o link enviado.</div>
    </div>
  );

  if (!student.menor_de_idade) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: '2rem' }}>ℹ️</div>
      <div style={{ fontWeight: 700 }}>Termo não aplicável</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Este aluno é maior de idade e não necessita de autorização.</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Cabeçalho */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', marginBottom: 12 }} />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }}>Termo de Autorização</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Associação Cultural de Capoeira Barão de Mauá
          </p>
        </div>

        {/* Documento */}
        <div style={{
          background: 'var(--bg-card)',
          border: '2px solid #dc2626',
          borderRadius: 16,
          overflow: 'hidden',
          marginBottom: 24,
        }}>
          {/* Título */}
          <div style={{ background: '#dc2626', padding: '16px 24px', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ⚠ Autorização de Participação — Menor de Idade
            </div>
          </div>

          <div style={{ padding: '28px 28px 24px', fontFamily: 'Georgia, serif' }}>

            {/* Dados do aluno */}
            <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontFamily: 'sans-serif' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Dados do Aluno</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.85rem' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Nome:</span> <strong>{student.nome_completo}</strong></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Núcleo:</span> <strong>{student.nucleo || '—'}</strong></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Nascimento:</span> <strong>{student.data_nascimento ? new Date(student.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Data:</span> <strong>{hoje}</strong></div>
              </div>
            </div>

            {/* Texto do termo */}
            <p style={{ textAlign: 'justify', lineHeight: 1.9, marginBottom: 28, fontSize: '0.93rem' }}>
              Eu, responsável legal pelo menor inscrito, autorizo sua participação nas atividades de capoeira
              realizadas pela <strong>Associação Cultural de Capoeira Barão de Mauá</strong>, estando ciente
              das atividades físicas envolvidas.
            </p>

            <hr style={{ border: 'none', borderTop: '1px dashed rgba(220,38,38,0.3)', marginBottom: 24 }} />

            {/* Campos responsável */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28, fontFamily: 'sans-serif' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                  Responsável <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  value={form.nome_responsavel}
                  onChange={e => setForm(p => ({ ...p, nome_responsavel: e.target.value }))}
                  placeholder="Nome completo do responsável legal"
                  disabled={saved}
                  style={{ width: '100%', fontFamily: 'Georgia, serif', opacity: saved ? 0.7 : 1 }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                  CPF <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  value={form.cpf_responsavel}
                  onChange={e => setForm(p => ({ ...p, cpf_responsavel: formatCPF(e.target.value) }))}
                  placeholder="000.000.000-00"
                  disabled={saved}
                  style={{ opacity: saved ? 0.7 : 1 }}
                />
              </div>
            </div>

          </div>
        </div>

        {/* Botão salvar / status */}
        {saved ? (
          <div style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 12, padding: '16px 20px', textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: '0.95rem' }}>
            ✅ Termo assinado e salvo com sucesso!<br />
            <span style={{ fontWeight: 400, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Você pode fechar esta página.</span>
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving || !form.nome_responsavel.trim()}
            style={{
              width: '100%', padding: '16px',
              background: form.nome_responsavel.trim() ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'var(--bg-input)',
              border: form.nome_responsavel.trim() ? 'none' : '1px solid var(--border)',
              color: form.nome_responsavel.trim() ? '#fff' : 'var(--text-secondary)',
              borderRadius: 12, fontWeight: 700, fontSize: '1rem',
              cursor: form.nome_responsavel.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              boxShadow: form.nome_responsavel.trim() ? '0 4px 16px rgba(220,38,38,0.3)' : 'none',
            }}
          >
            {saving ? 'Salvando...' : '✍ Confirmar e Salvar Termo'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TermoPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>}>
      <TermoContent />
    </Suspense>
  );
}
