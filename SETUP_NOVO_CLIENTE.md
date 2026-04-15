# Guia de Setup — Novo Cliente

## PASSO 1 — Criar projeto Supabase

1. Acesse https://supabase.com → **New project**
2. Copie as 3 chaves: `URL`, `anon key`, `service_role key`

---

## PASSO 2 — Rodar SQL no novo Supabase

Acesse: **Supabase Dashboard → SQL Editor → New query** e cole:

```sql
-- ============================================================
-- TABELA PRINCIPAL DE ALUNOS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS students_id_seq;
CREATE SEQUENCE IF NOT EXISTS students_inscricao_seq START 1;

CREATE TABLE IF NOT EXISTS students (
  id                    SERIAL PRIMARY KEY,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  nome_completo         TEXT,
  apelido               TEXT,
  nome_social           TEXT,
  sexo                  TEXT,
  cpf                   TEXT,
  identidade            TEXT,
  numeracao_unica       TEXT,
  data_nascimento       DATE,
  telefone              TEXT,
  email                 TEXT,
  cep                   TEXT,
  endereco              TEXT,
  numero                TEXT,
  complemento           TEXT,
  bairro                TEXT,
  cidade                TEXT,
  estado                TEXT,
  graduacao             TEXT,
  tipo_graduacao        TEXT,
  nucleo                TEXT,
  foto_url              TEXT,
  nome_pai              TEXT,
  nome_mae              TEXT,
  autoriza_imagem       BOOLEAN NOT NULL DEFAULT FALSE,
  menor_de_idade        BOOLEAN NOT NULL DEFAULT FALSE,
  nome_responsavel      TEXT,
  cpf_responsavel       TEXT,
  assinatura_responsavel BOOLEAN NOT NULL DEFAULT FALSE,
  assinatura_pai        BOOLEAN NOT NULL DEFAULT FALSE,
  assinatura_mae        BOOLEAN NOT NULL DEFAULT FALSE,
  desenvolvimento_atipico TEXT[],
  ordem_inscricao       INTEGER DEFAULT nextval('students_inscricao_seq'),
  tenant_id             TEXT,
  password              TEXT
);

-- Índices para performance
CREATE UNIQUE INDEX IF NOT EXISTS students_cpf_unique 
  ON students(cpf) WHERE cpf IS NOT NULL AND cpf != '';
CREATE UNIQUE INDEX IF NOT EXISTS students_numeracao_unica_unique 
  ON students(numeracao_unica) WHERE numeracao_unica IS NOT NULL;
CREATE INDEX IF NOT EXISTS students_email_idx ON students(email);
CREATE INDEX IF NOT EXISTS students_nucleo_idx ON students(nucleo);
CREATE INDEX IF NOT EXISTS students_nome_idx ON students(nome_completo);

-- ============================================================
-- RLS (Row Level Security) — desabilitar para uso com service_role
-- ============================================================
ALTER TABLE students DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- STORAGE BUCKET (fazer pelo Dashboard ou SQL abaixo)
-- ============================================================
-- No Dashboard: Storage → New bucket → nome: "photos" → Private
-- OU via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', false)
ON CONFLICT (id) DO NOTHING;
```

---

## PASSO 3 — Configurar Storage

No **Supabase Dashboard → Storage**:
1. Crie bucket `photos` (Private)
2. Em **Policies**, adicione policy para service_role ter acesso total:

```sql
-- Policy para service_role acessar tudo no bucket photos
CREATE POLICY "service_role full access"
ON storage.objects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

---

## PASSO 4 — Atualizar .env.local no projeto

Troque as variáveis pelo novo Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_NOVO_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_nova_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_nova_service_role_key
NEXT_PUBLIC_APP_URL=https://seu-novo-dominio.vercel.app
DEV_PASSWORD=senha_do_desenvolvedor
```

---

## PASSO 5 — O que personalizar por cliente (peça ao Orchids)

| O que trocar | Onde fica |
|---|---|
| Nome da associação | `src/lib/i18n/translations.ts` |
| Lista de núcleos/unidades | `src/app/page.tsx` (select nucleo) + `src/app/admin/page.tsx` |
| Graduações/cordas | `src/lib/graduacoes.ts` |
| Logo | `public/logo-barao-maua.png` → substituir |
| Imagem de fundo | Painel Admin → botão "Alterar Fundo" |
| Credenciais admin | API `/api/admin/panel-auth` |
| Cores dos núcleos | `src/app/admin/page.tsx` (NUCLEO_CONFIG) |
| Termos de responsabilidade | `src/lib/i18n/translations.ts` (form_minor_term_text) |
| Rodapé / WhatsApp contato | `src/app/page.tsx` (footer) |

---

## PASSO 6 — Deploy na Vercel

1. Push o código para GitHub
2. Vercel → **New Project → Import**
3. Em **Environment Variables**, adicione as 4 variáveis do `.env.local`
4. Deploy!

---

## Checklist final

- [ ] Novo projeto Supabase criado
- [ ] SQL rodado no editor
- [ ] Bucket `photos` criado
- [ ] `.env.local` atualizado com novas chaves
- [ ] Nome/núcleos/logo personalizados
- [ ] Senha admin inicial configurada
- [ ] Deploy na Vercel

---

## Resumo do que o Orchids faz vs. você faz

| Tarefa | Quem faz |
|---|---|
| Personalizar código (nome, núcleos, cores, textos) | **Orchids** |
| Criar projeto no Supabase | **Você** (5 min) |
| Rodar o SQL | **Você** (copia e cola) |
| Criar bucket `photos` | **Você** (clica no dashboard) |
| Atualizar as chaves `.env.local` | **Você passa as chaves → Orchids troca** |
| Deploy na Vercel | **Você** (conecta GitHub) |
