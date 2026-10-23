-- =====================================================================
-- 005 · Modelos de documentos editáveis (aba Modelos)
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
create table if not exists modelos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  arquivo       text not null,              -- começo do nome do arquivo: "PROCURAÇÃO"
  descricao     text,
  conteudo      text not null,
  ordem         int not null default 0,
  ativo         boolean not null default true,
  criado_por    uuid references perfis (id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists modelos_atualizado on modelos;
create trigger modelos_atualizado before update on modelos
  for each row execute function tocar_atualizado_em();

-- Toda a equipe usa; administradores e advogados criam e editam
alter table modelos enable row level security;
drop policy if exists equipe_le on modelos;
create policy equipe_le on modelos for select to authenticated using (meu_papel() is not null);
drop policy if exists advogados_editam on modelos;
create policy advogados_editam on modelos for all to authenticated
  using (meu_papel() in ('administrador', 'advogado'))
  with check (meu_papel() in ('administrador', 'advogado'));
