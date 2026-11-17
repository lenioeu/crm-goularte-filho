-- =====================================================================
-- 018 · Prazos processuais
-- Prazos com vencimento fatal e interno (contados pelo Órion em dias úteis
-- ou corridos), feriados do escritório e ligação com as publicações.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
create table if not exists prazos (
  id              uuid primary key default gen_random_uuid(),
  descricao       text not null,                    -- ex.: Contestação, Recurso ordinário
  processo_id     uuid references processos (id) on delete cascade,
  cliente_id      uuid references clientes (id) on delete set null,
  publicacao_id   uuid references publicacoes (id) on delete set null,
  publicado_em    date not null,                    -- publicação ou intimação: a contagem começa no dia útil seguinte
  dias            int not null check (dias between 0 and 365),
  contagem        text not null default 'uteis' check (contagem in ('uteis', 'corridos')),
  vence_em        date not null,                    -- prazo fatal
  vence_interno   date not null,                    -- prazo interno da equipe
  responsavel_id  uuid references perfis (id) on delete set null,
  situacao        text not null default 'aberto' check (situacao in ('aberto', 'cumprido', 'cancelado')),
  cumprido_em     timestamptz,
  cumprido_por    uuid references perfis (id) on delete set null,
  observacao      text,
  google_event_id text,
  criado_por      uuid references perfis (id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists prazos_abertos on prazos (situacao, vence_em);
create index if not exists prazos_processo on prazos (processo_id);

-- Dias sem expediente do escritório (forenses do tribunal, estaduais, municipais).
-- Os feriados nacionais e o recesso de 20/12 a 20/01 o Órion já conhece.
create table if not exists feriados (
  dia        date primary key,
  descricao  text not null,
  criado_por uuid references perfis (id) on delete set null,
  criado_em  timestamptz not null default now()
);

-- Publicação tratada como prazo
alter table publicacoes drop constraint if exists publicacoes_situacao_check;
alter table publicacoes add constraint publicacoes_situacao_check check (situacao in ('nova', 'ciencia', 'tarefa', 'audiencia', 'prazo'));

-- A equipe vê, cria e cumpre; prazo de processo de caso sigiloso segue a regra do caso
alter table prazos enable row level security;
drop policy if exists equipe_usa on prazos;
create policy equipe_usa on prazos for all to authenticated using (
  meu_papel() is not null
  and (processo_id is null or exists (select 1 from processos p join casos c on c.id = p.caso_id where p.id = processo_id and posso_ver_caso(c)))
) with check (meu_papel() is not null);

alter table feriados enable row level security;
drop policy if exists equipe_le on feriados;
create policy equipe_le on feriados for select to authenticated using (meu_papel() is not null);
drop policy if exists equipe_cadastra on feriados;
create policy equipe_cadastra on feriados for all to authenticated using (meu_papel() is not null) with check (meu_papel() is not null);
