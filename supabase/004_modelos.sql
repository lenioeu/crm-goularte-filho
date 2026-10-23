-- =====================================================================
-- 004 · Modelos de documentos: dados de qualificação do cliente
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
alter table clientes add column if not exists rg            text;
alter table clientes add column if not exists nacionalidade text;
alter table clientes add column if not exists estado_civil  text;
alter table clientes add column if not exists profissao     text;
alter table clientes add column if not exists endereco      text;
alter table clientes add column if not exists cep           text;
alter table clientes add column if not exists genero        text check (genero in ('m', 'f'));
