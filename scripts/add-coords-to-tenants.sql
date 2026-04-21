-- Adiciona colunas de coordenadas na tabela tenants (nucleos)
-- para unificar nucleos e locais de treino

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 6);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 6);

-- Comentario para documentacao
COMMENT ON COLUMN tenants.lat IS 'Latitude do local de treino para registro de presenca por GPS';
COMMENT ON COLUMN tenants.lng IS 'Longitude do local de treino para registro de presenca por GPS';
