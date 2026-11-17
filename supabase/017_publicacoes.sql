-- =====================================================================
-- 017 · Publicações do Recorte Digital (OAB/ES)
-- O e-mail diário do Recorte chega ao Órion por um script no Gmail; cada
-- publicação vira um item para a equipe tratar (ciência, tarefa, audiência).
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
create table if not exists publicacoes (
  id                 uuid primary key default gen_random_uuid(),
  chave              text not null unique,            -- impressão digital: a mesma publicação não entra duas vezes
  origem             text not null default 'recorte',
  numero_cnj         text,
  processo_id        uuid references processos (id) on delete set null,
  cliente_id         uuid references clientes (id) on delete set null,
  disponibilizada_em date,
  publicada_em       date,
  jornal             text,
  caderno            text,
  orgao              text,
  texto              text not null,
  link               text,
  tipo               text not null default 'outro' check (tipo in ('intimacao', 'audiencia', 'distribuicao', 'outro')),
  audiencia_em       timestamptz,                     -- audiência marcada/remarcada que o texto cita
  situacao           text not null default 'nova' check (situacao in ('nova', 'ciencia', 'tarefa', 'audiencia')),
  tratada_por        uuid references perfis (id) on delete set null,
  tratada_em         timestamptz,
  criado_em          timestamptz not null default now()
);
create index if not exists publicacoes_situacao on publicacoes (situacao, publicada_em desc);
create index if not exists publicacoes_processo on publicacoes (processo_id);

-- Um registro por e-mail recebido (para avisar quando o do dia não chegar)
create table if not exists recortes_recebidos (
  dia          date primary key,
  assunto      text,
  publicacoes  int not null default 0,
  recebido_em  timestamptz not null default now()
);

-- A equipe lê e trata; quem grava é o próprio Órion (chave secreta). Publicação de processo
-- de caso sigiloso segue a regra do caso.
alter table publicacoes enable row level security;
drop policy if exists equipe_le on publicacoes;
create policy equipe_le on publicacoes for select to authenticated using (
  meu_papel() is not null
  and (processo_id is null or exists (select 1 from processos p join casos c on c.id = p.caso_id where p.id = processo_id and posso_ver_caso(c)))
);
drop policy if exists equipe_trata on publicacoes;
create policy equipe_trata on publicacoes for update to authenticated using (
  meu_papel() is not null
  and (processo_id is null or exists (select 1 from processos p join casos c on c.id = p.caso_id where p.id = processo_id and posso_ver_caso(c)))
) with check (meu_papel() is not null);

alter table recortes_recebidos enable row level security;
drop policy if exists equipe_le on recortes_recebidos;
create policy equipe_le on recortes_recebidos for select to authenticated using (meu_papel() is not null);
