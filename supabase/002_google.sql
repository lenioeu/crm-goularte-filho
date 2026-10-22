-- =====================================================================
-- CRM Goularte Filho Advocacia · ligação com o Google (Drive e Agenda)
--
-- Como usar: no Supabase, abra "SQL Editor", cole este arquivo e clique
-- em "Run". Pode rodar de novo sem problema.
-- =====================================================================

-- Autorização da conta Google do escritório.
-- A tabela tem segurança ligada e NENHUMA permissão: ninguém da equipe
-- consegue ler a autorização pelo sistema; só o servidor, com a chave
-- secreta, usa para falar com o Google.
create table if not exists google_conexao (
  id             int primary key default 1 check (id = 1),
  refresh_token  text not null,
  email          text,
  conectado_por  uuid references perfis (id),
  conectado_em   timestamptz not null default now()
);

alter table google_conexao enable row level security;
