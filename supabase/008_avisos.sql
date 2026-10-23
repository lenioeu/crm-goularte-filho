-- =====================================================================
-- 008 · Avisos de mensagem nova (contador, som e notificação no celular)
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================

-- A última mensagem da conversa foi do cliente e ninguém respondeu ainda
alter table conversas add column if not exists aguardando_resposta boolean not null default false;

-- Celulares e computadores que pediram notificação (cada pessoa vê e apaga só os seus)
create table if not exists push_inscricoes (
  id        uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfis (id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  criado_em timestamptz not null default now()
);
alter table push_inscricoes enable row level security;
drop policy if exists minhas_inscricoes on push_inscricoes;
create policy minhas_inscricoes on push_inscricoes for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- Chaves de assinatura das notificações: só o servidor lê (sem políticas = ninguém de fora)
create table if not exists chaves_push (
  id      int primary key default 1 check (id = 1),
  publica text not null,
  privada text not null
);
alter table chaves_push enable row level security;
