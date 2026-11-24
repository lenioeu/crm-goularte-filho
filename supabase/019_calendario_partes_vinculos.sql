-- 019 · Calendário (compromissos além das audiências), parte contrária por processo e processos vinculados
-- (agravo, recurso, cumprimento de sentença… ligados ao processo principal). Pode rodar mais de uma vez.

-- ---------------------------------------------------------------------
-- Compromissos do calendário: reunião, atendimento, diligência, compromisso, outro.
-- Audiências continuam na tabela "audiencias"; prazos e tarefas aparecem no calendário pelas próprias tabelas.
-- ---------------------------------------------------------------------
create table if not exists compromissos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null default 'compromisso' check (tipo in ('reuniao', 'atendimento', 'diligencia', 'compromisso', 'outro')),
  titulo          text not null,
  inicio          timestamptz not null,
  fim             timestamptz,
  local           text,
  observacoes     text,
  cliente_id      uuid references clientes (id) on delete set null,
  processo_id     uuid references processos (id) on delete set null,
  responsavel_id  uuid references perfis (id) on delete set null,
  google_event_id text,
  criado_por      uuid references perfis (id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now()
);
create index if not exists compromissos_inicio on compromissos (inicio);

alter table compromissos enable row level security;
drop policy if exists equipe_usa on compromissos;
create policy equipe_usa on compromissos for all to authenticated using (
  meu_papel() is not null
  and (processo_id is null or exists (select 1 from processos p join casos c on c.id = p.caso_id where p.id = processo_id and posso_ver_caso(c)))
) with check (meu_papel() is not null);

-- ---------------------------------------------------------------------
-- Partes contrárias de cada processo (um processo pode ter várias: reclamadas, réus, agravados…)
-- ---------------------------------------------------------------------
create table if not exists processo_partes (
  id          uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos (id) on delete cascade,
  nome        text not null,
  cpf_cnpj    text,
  papel       text,            -- ex.: reclamada, ré, agravado, executado
  advogado    text,            -- advogado da parte contrária (nome e OAB), se souber
  criado_em   timestamptz not null default now()
);
create index if not exists processo_partes_processo on processo_partes (processo_id);
create index if not exists processo_partes_doc on processo_partes (regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g'));

alter table processo_partes enable row level security;
drop policy if exists equipe_usa on processo_partes;
create policy equipe_usa on processo_partes for all to authenticated using (
  meu_papel() is not null
  and exists (select 1 from processos p join casos c on c.id = p.caso_id where p.id = processo_id and posso_ver_caso(c))
) with check (
  meu_papel() is not null
  and exists (select 1 from processos p join casos c on c.id = p.caso_id where p.id = processo_id and posso_ver_caso(c))
);

-- Nome em maiúsculas e CPF/CNPJ formatado, como no cadastro de clientes
create or replace function padronizar_parte() returns trigger
language plpgsql as $$
declare d text;
begin
  new.nome := upper(btrim(new.nome));
  new.papel := nullif(btrim(new.papel), '');
  new.advogado := nullif(upper(btrim(new.advogado)), '');
  d := regexp_replace(coalesce(new.cpf_cnpj, ''), '\D', '', 'g');
  if length(d) = 11 then
    new.cpf_cnpj := substr(d, 1, 3) || '.' || substr(d, 4, 3) || '.' || substr(d, 7, 3) || '-' || substr(d, 10, 2);
  elsif length(d) = 14 then
    new.cpf_cnpj := substr(d, 1, 2) || '.' || substr(d, 3, 3) || '.' || substr(d, 6, 3) || '/' || substr(d, 9, 4) || '-' || substr(d, 13, 2);
  else
    new.cpf_cnpj := nullif(btrim(new.cpf_cnpj), '');
  end if;
  return new;
end $$;
drop trigger if exists padronizar_parte on processo_partes;
create trigger padronizar_parte before insert or update on processo_partes
  for each row execute function padronizar_parte();

-- A parte contrária que estava no caso (texto livre) vira a primeira parte de cada processo do caso
insert into processo_partes (processo_id, nome)
select p.id, c.parte_contraria
from processos p join casos c on c.id = p.caso_id
where coalesce(btrim(c.parte_contraria), '') <> ''
  and not exists (select 1 from processo_partes x where x.processo_id = p.id);

-- ---------------------------------------------------------------------
-- Processos vinculados: o agravo, o recurso ou o cumprimento ficam "dentro" do processo principal
-- ---------------------------------------------------------------------
alter table processos add column if not exists processo_pai_id uuid references processos (id) on delete set null;
alter table processos add column if not exists tipo_vinculo text;
create index if not exists processos_pai on processos (processo_pai_id);
