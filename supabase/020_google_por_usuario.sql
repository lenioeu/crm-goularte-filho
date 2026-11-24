-- 020 · Conta Google de cada pessoa da equipe (Agenda e Gmail), ligada em Meu perfil.
-- A autorização (refresh token) só é lida pelo servidor: a tabela não tem regra de leitura para a equipe.

create table if not exists google_usuarios (
  perfil_id     uuid primary key references perfis (id) on delete cascade,
  email         text,
  refresh_token text not null,
  agenda        boolean not null default false,
  gmail         boolean not null default false,
  conectado_em  timestamptz not null default now(),
  gmail_lido_em timestamptz          -- última vez que o Órion procurou o Recorte nesse Gmail
);
alter table google_usuarios enable row level security;

-- E-mails do Recorte já levados do Gmail para Publicações (para não ler duas vezes)
create table if not exists recorte_gmail_lidos (
  mensagem_id text primary key,
  perfil_id   uuid references perfis (id) on delete set null,
  lido_em     timestamptz not null default now()
);
alter table recorte_gmail_lidos enable row level security;

-- Cópia do evento na agenda de quem vai (além da agenda do escritório)
alter table audiencias   add column if not exists google_event_resp text;
alter table audiencias   add column if not exists google_resp_id uuid references perfis (id) on delete set null;
alter table compromissos add column if not exists google_event_resp text;
alter table compromissos add column if not exists google_resp_id uuid references perfis (id) on delete set null;
