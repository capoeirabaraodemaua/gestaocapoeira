-- =====================================================
-- Script de Configuração do Banco de Dados Demonstrativo
-- Capoeira Gestão - Ambiente Demo (v2)
-- =====================================================
-- ATENÇÃO: Este script usa DROP TABLE para garantir
-- que as tabelas sejam criadas corretamente.
-- Execute apenas no banco DEMONSTRATIVO!
-- =====================================================

-- Desabilitar verificações de FK temporariamente
SET session_replication_role = 'replica';

-- Dropar tabelas existentes (na ordem correta por causa das FKs)
DROP TABLE IF EXISTS pagamentos CASCADE;
DROP TABLE IF EXISTS checkins CASCADE;
DROP TABLE IF EXISTS eventos CASCADE;
DROP TABLE IF EXISTS alunos CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Reabilitar verificações de FK
SET session_replication_role = 'origin';

-- =====================================================
-- Criar Tabelas
-- =====================================================

-- Tabela de Tenants (Núcleos)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  telefone TEXT,
  email TEXT,
  logo_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Admins
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Alunos
CREATE TABLE alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  data_nascimento DATE,
  cpf TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  graduacao_id TEXT NOT NULL DEFAULT 'crua',
  data_graduacao DATE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  foto_url TEXT,
  apelido TEXT,
  observacoes TEXT,
  ativo BOOLEAN DEFAULT true,
  data_cadastro DATE DEFAULT CURRENT_DATE,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Check-ins (Presenças)
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIME NOT NULL DEFAULT CURRENT_TIME,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  local_nome TEXT,
  local_endereco TEXT,
  lat NUMERIC,
  lng NUMERIC
);

-- Tabela de Eventos
CREATE TABLE eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ,
  local TEXT,
  tipo TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Pagamentos
CREATE TABLE pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id),
  valor NUMERIC NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  mes_referencia INTEGER NOT NULL,
  ano_referencia INTEGER NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Índices para Performance
-- =====================================================

CREATE INDEX idx_alunos_tenant ON alunos(tenant_id);
CREATE INDEX idx_alunos_ativo ON alunos(ativo);
CREATE INDEX idx_checkins_aluno ON checkins(aluno_id);
CREATE INDEX idx_checkins_tenant ON checkins(tenant_id);
CREATE INDEX idx_checkins_data ON checkins(data);
CREATE INDEX idx_pagamentos_aluno ON pagamentos(aluno_id);
CREATE INDEX idx_pagamentos_tenant ON pagamentos(tenant_id);
CREATE INDEX idx_pagamentos_status ON pagamentos(status);
CREATE INDEX idx_admins_tenant ON admins(tenant_id);
CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_eventos_tenant ON eventos(tenant_id);

-- =====================================================
-- Habilitar RLS (Row Level Security)
-- =====================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para o service role (backend)
DROP POLICY IF EXISTS "Service role full access tenants" ON tenants;
DROP POLICY IF EXISTS "Service role full access admins" ON admins;
DROP POLICY IF EXISTS "Service role full access alunos" ON alunos;
DROP POLICY IF EXISTS "Service role full access checkins" ON checkins;
DROP POLICY IF EXISTS "Service role full access eventos" ON eventos;
DROP POLICY IF EXISTS "Service role full access pagamentos" ON pagamentos;

CREATE POLICY "Service role full access tenants" ON tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access admins" ON admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access alunos" ON alunos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access checkins" ON checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access eventos" ON eventos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access pagamentos" ON pagamentos FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- Dados Demonstrativos
-- =====================================================

-- Inserir núcleos demonstrativos
INSERT INTO tenants (nome, slug, endereco, cidade, estado, telefone, email) VALUES
('Núcleo Demo Centro', 'demo-centro', 'Rua da Capoeira, 123', 'Rio de Janeiro', 'RJ', '(21) 99999-0001', 'demo.centro@capoeira.com'),
('Núcleo Demo Norte', 'demo-norte', 'Av. Principal, 456', 'São Paulo', 'SP', '(11) 99999-0002', 'demo.norte@capoeira.com');

-- Inserir admin geral demonstrativo
INSERT INTO admins (nome, email, role, tenant_id) VALUES
('Admin Geral Demo', 'admin@demo.com', 'geral', NULL);

-- Inserir alguns alunos demonstrativos
INSERT INTO alunos (nome, apelido, email, telefone, graduacao_id, tenant_id, data_nascimento)
SELECT 
  'Aluno Demo ' || n,
  'Apelido ' || n,
  'aluno' || n || '@demo.com',
  '(21) 9' || LPAD(n::text, 4, '0') || '-' || LPAD((n * 1111 % 10000)::text, 4, '0'),
  CASE (n % 5) 
    WHEN 0 THEN 'crua'
    WHEN 1 THEN 'crua-amarela'
    WHEN 2 THEN 'amarela'
    WHEN 3 THEN 'amarela-laranja'
    ELSE 'laranja'
  END,
  (SELECT id FROM tenants WHERE slug = CASE WHEN n % 2 = 0 THEN 'demo-centro' ELSE 'demo-norte' END),
  CURRENT_DATE - ((20 + n) * 365 || ' days')::interval
FROM generate_series(1, 10) AS n;

SELECT 'Banco de dados demonstrativo configurado com sucesso!' AS status;
