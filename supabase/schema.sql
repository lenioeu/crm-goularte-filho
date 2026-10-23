-- =====================================================================
-- CRM Goularte Filho Advocacia · estrutura do banco de dados (Supabase)
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole todo este
-- arquivo e clique em "Run". Pode rodar de novo sem problema: o script
-- só cria o que ainda não existe.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type papel_acesso as enum ('administrador', 'advogado', 'estagiario', 'atendimento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type etapa_funil as enum ('primeiro_contato', 'triagem', 'consulta_agendada', 'proposta', 'contrato_assinado', 'nao_viavel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_conversa as enum ('bot', 'aguardando', 'em_atendimento', 'resolvida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_agendamento as enum ('lembrete_audiencia', 'follow_up', 'livre');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_agendamento as enum ('programada', 'enviada', 'cancelada', 'falhou');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Configurações gerais do escritório (chave → valor)
-- ex.: pasta_clientes_drive_id, numero_whatsapp, horario_lembrete
-- ---------------------------------------------------------------------
create table if not exists configuracoes (
  chave       text primary key,
  valor       jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Áreas de atuação (cada uma vira opção do bot e pasta no Drive)
-- ---------------------------------------------------------------------
create table if not exists areas (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null unique,
  cor                text not null default '#1967d2',
  ordem_bot          int  not null,
  documentos_pedidos text,
  pasta_drive_id     text,
  ativa              boolean not null default true,
  criado_em          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cargos (aparecem abaixo do nome da pessoa)
-- ---------------------------------------------------------------------
create table if not exists cargos (
  id   uuid primary key default gen_random_uuid(),
  nome text not null unique
);

-- ---------------------------------------------------------------------
-- Pessoas da equipe (ligadas ao login do Supabase)
-- ---------------------------------------------------------------------
create table if not exists perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  cargo_id   uuid references cargos (id),
  papel      papel_acesso not null default 'atendimento',
  oab        text,
  telefone   text,
  assinatura text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists perfis_areas (
  perfil_id uuid references perfis (id) on delete cascade,
  area_id   uuid references areas (id) on delete cascade,
  primary key (perfil_id, area_id)
);

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table if not exists clientes (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  cpf_cnpj          text,
  telefone_whatsapp text unique,
  email             text,
  area_id           uuid references areas (id),
  responsavel_id    uuid references perfis (id),
  pasta_drive_id    text,
  pasta_drive_url   text,
  origem            text,
  observacoes       text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Casos (cartões do funil)
-- ---------------------------------------------------------------------
create table if not exists casos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes (id) on delete cascade,
  area_id           uuid references areas (id),
  titulo            text not null,
  resumo            text,
  parte_contraria   text,
  etapa             etapa_funil not null default 'primeiro_contato',
  motivo_nao_viavel text,
  responsavel_id    uuid references perfis (id),
  sigiloso          boolean not null default false,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table if not exists casos_historico (
  id         uuid primary key default gen_random_uuid(),
  caso_id    uuid not null references casos (id) on delete cascade,
  de_etapa   etapa_funil,
  para_etapa etapa_funil not null,
  por        uuid references perfis (id),
  em         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Processos (atualizados pela API pública do CNJ / DataJud)
-- ---------------------------------------------------------------------
create table if not exists processos (
  id                       uuid primary key default gen_random_uuid(),
  caso_id                  uuid not null references casos (id) on delete cascade,
  numero_cnj               text not null unique,
  tribunal                 text,
  vara                     text,
  fase                     text,
  ultima_movimentacao      text,
  ultima_movimentacao_em   date,
  sincronizado_em          timestamptz,
  arquivado                boolean not null default false,
  criado_em                timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Audiências (espelhadas no Google Agenda)
-- ---------------------------------------------------------------------
create table if not exists audiencias (
  id              uuid primary key default gen_random_uuid(),
  caso_id         uuid not null references casos (id) on delete cascade,
  processo_id     uuid references processos (id) on delete set null,
  tipo            text not null,
  inicio          timestamptz not null,
  local           text,
  modalidade      text not null default 'presencial' check (modalidade in ('presencial', 'video')),
  responsavel_id  uuid references perfis (id),
  google_event_id text,
  observacoes     text,
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Conversas e mensagens do WhatsApp
-- ---------------------------------------------------------------------
create table if not exists conversas (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references clientes (id) on delete cascade,
  numero_conexao     text not null,
  status             status_conversa not null default 'bot',
  area_id            uuid references areas (id),
  atendente_id       uuid references perfis (id),
  ultima_mensagem_em timestamptz,
  criado_em          timestamptz not null default now()
);

create table if not exists mensagens (
  id               uuid primary key default gen_random_uuid(),
  conversa_id      uuid not null references conversas (id) on delete cascade,
  direcao          text not null check (direcao in ('entrada', 'saida')),
  autor_id         uuid references perfis (id),
  enviada_pelo_bot boolean not null default false,
  nota_interna     boolean not null default false,
  texto            text,
  midia_url        text,
  midia_tipo       text,
  whatsapp_id      text unique,
  criado_em        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Documentos salvos no Google Drive
-- ---------------------------------------------------------------------
create table if not exists documentos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes (id) on delete cascade,
  mensagem_id     uuid references mensagens (id) on delete set null,
  nome_original   text,
  nome_salvo      text not null,
  tipo_documento  text,
  drive_file_id   text not null,
  drive_url       text,
  salvo_por       uuid references perfis (id),
  salvo_em        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Mensagens agendadas
-- ---------------------------------------------------------------------
create table if not exists mensagens_agendadas (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references clientes (id) on delete cascade,
  audiencia_id          uuid references audiencias (id) on delete cascade,
  tipo                  tipo_agendamento not null,
  texto                 text not null,
  enviar_em             timestamptz not null,
  cancelar_se_responder boolean not null default false,
  automatico            boolean not null default false,
  status                status_agendamento not null default 'programada',
  criado_por            uuid references perfis (id),
  enviada_em            timestamptz,
  erro                  text,
  criado_em             timestamptz not null default now()
);

create index if not exists mensagens_agendadas_fila
  on mensagens_agendadas (enviar_em) where status = 'programada';

-- ---------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------
create table if not exists tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  caso_id        uuid references casos (id) on delete cascade,
  cliente_id     uuid references clientes (id) on delete cascade,
  responsavel_id uuid references perfis (id),
  revisor_id     uuid references perfis (id),
  coluna         text not null default 'a_fazer' check (coluna in ('a_fazer', 'em_andamento', 'revisao', 'concluida')),
  vence_em       date,
  criado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Atualiza "atualizado_em" sozinho
-- ---------------------------------------------------------------------
create or replace function tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists clientes_atualizado on clientes;
create trigger clientes_atualizado before update on clientes
  for each row execute function tocar_atualizado_em();

drop trigger if exists casos_atualizado on casos;
create trigger casos_atualizado before update on casos
  for each row execute function tocar_atualizado_em();

-- Guarda o histórico de mudança de etapa do funil
create or replace function registrar_etapa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    insert into casos_historico (caso_id, de_etapa, para_etapa, por)
    values (new.id, case when tg_op = 'UPDATE' then old.etapa end, new.etapa, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists casos_etapa on casos;
create trigger casos_etapa after insert or update of etapa on casos
  for each row execute function registrar_etapa();

-- Cria o perfil de quem entra no sistema pela primeira vez.
-- A primeira pessoa vira administradora e já fica ativa. As seguintes
-- entram inativas, e o administrador libera e escolhe o papel de cada uma.
create or replace function criar_perfil_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean;
begin
  select not exists (select 1 from perfis) into primeiro;
  insert into perfis (id, nome, papel, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nome', new.email),
    case when primeiro then 'administrador'::papel_acesso else 'atendimento'::papel_acesso end,
    primeiro
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function criar_perfil_novo_usuario();

-- ---------------------------------------------------------------------
-- Permissões (Row Level Security)
-- ---------------------------------------------------------------------
create or replace function meu_papel() returns papel_acesso
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

create or replace function sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'administrador', false)
$$;

-- Pode ver o caso: administrador sempre; advogado em casos não sigilosos
-- ou nos seus; estagiário e atendimento só nos casos atribuídos a eles.
create or replace function posso_ver_caso(c casos) returns boolean
language sql stable security definer set search_path = public as $$
  select case meu_papel()
    when 'administrador' then true
    when 'advogado'      then (not c.sigiloso) or c.responsavel_id = auth.uid()
    when 'estagiario'    then c.responsavel_id = auth.uid()
    when 'atendimento'   then c.responsavel_id = auth.uid() and not c.sigiloso
    else false
  end
$$;

alter table configuracoes        enable row level security;
alter table areas                enable row level security;
alter table cargos               enable row level security;
alter table perfis               enable row level security;
alter table perfis_areas         enable row level security;
alter table clientes             enable row level security;
alter table casos                enable row level security;
alter table casos_historico      enable row level security;
alter table processos            enable row level security;
alter table audiencias           enable row level security;
alter table conversas            enable row level security;
alter table mensagens            enable row level security;
alter table documentos           enable row level security;
alter table mensagens_agendadas  enable row level security;
alter table tarefas              enable row level security;

-- Tabelas de cadastro: toda a equipe lê, só o administrador altera
do $$
declare t text;
begin
  foreach t in array array['configuracoes', 'areas', 'cargos', 'perfis', 'perfis_areas'] loop
    execute format('drop policy if exists equipe_le on %I', t);
    execute format('create policy equipe_le on %I for select to authenticated using (meu_papel() is not null)', t);
    execute format('drop policy if exists admin_altera on %I', t);
    execute format('create policy admin_altera on %I for all to authenticated using (sou_admin()) with check (sou_admin())', t);
  end loop;
end $$;

-- Cada pessoa pode editar o próprio perfil (nome, telefone, assinatura)
drop policy if exists edita_proprio_perfil on perfis;
create policy edita_proprio_perfil on perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and papel = meu_papel());

-- Casos: visibilidade conforme o papel e o sigilo
drop policy if exists ver_casos on casos;
create policy ver_casos on casos for select to authenticated using (posso_ver_caso(casos));
drop policy if exists criar_casos on casos;
create policy criar_casos on casos for insert to authenticated with check (meu_papel() is not null);
drop policy if exists alterar_casos on casos;
create policy alterar_casos on casos for update to authenticated
  using (posso_ver_caso(casos)) with check (meu_papel() is not null);
drop policy if exists apagar_casos on casos;
create policy apagar_casos on casos for delete to authenticated using (sou_admin());

-- Tabelas ligadas a um caso herdam a visibilidade do caso
drop policy if exists ver_historico on casos_historico;
create policy ver_historico on casos_historico for select to authenticated
  using (exists (select 1 from casos c where c.id = caso_id and posso_ver_caso(c)));

do $$
declare t text;
begin
  foreach t in array array['processos', 'audiencias'] loop
    execute format('drop policy if exists ver_por_caso on %I', t);
    execute format('create policy ver_por_caso on %I for select to authenticated using (exists (select 1 from casos c where c.id = caso_id and posso_ver_caso(c)))', t);
    execute format('drop policy if exists alterar_por_caso on %I', t);
    execute format('create policy alterar_por_caso on %I for all to authenticated using (exists (select 1 from casos c where c.id = caso_id and posso_ver_caso(c))) with check (meu_papel() is not null)', t);
  end loop;
end $$;

-- Operação do dia a dia: toda a equipe ativa lê e registra.
-- (Clientes e conversas aparecem para o atendimento antes de existir caso.)
do $$
declare t text;
begin
  foreach t in array array['clientes', 'conversas', 'mensagens', 'documentos', 'mensagens_agendadas', 'tarefas'] loop
    execute format('drop policy if exists equipe_le on %I', t);
    execute format('create policy equipe_le on %I for select to authenticated using (meu_papel() is not null)', t);
    execute format('drop policy if exists equipe_registra on %I', t);
    execute format('create policy equipe_registra on %I for insert to authenticated with check (meu_papel() is not null)', t);
    execute format('drop policy if exists equipe_altera on %I', t);
    execute format('create policy equipe_altera on %I for update to authenticated using (meu_papel() is not null) with check (meu_papel() is not null)', t);
    execute format('drop policy if exists admin_apaga on %I', t);
    execute format('create policy admin_apaga on %I for delete to authenticated using (sou_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Dados iniciais
-- ---------------------------------------------------------------------
insert into areas (nome, cor, ordem_bot, documentos_pedidos) values
  ('Trabalhista',     '#1967d2', 1, 'CTPS, holerites, TRCT, extrato do FGTS, RG e comprovante de endereço'),
  ('Cível',           '#8430ce', 2, 'Contratos, comprovantes, notificações, RG e comprovante de endereço'),
  ('Criminal',        '#c2185b', 3, 'Boletim de ocorrência, decisão de prisão, documentos pessoais'),
  ('Previdenciário',  '#00796b', 4, 'CNIS, laudos médicos, carta de indeferimento, RG e CPF'),
  ('Família',         '#e37400', 5, 'Certidões de casamento e nascimento, comprovantes de renda'),
  ('Execução Fiscal', '#546e7a', 6, 'CDA, notificação, comprovantes de pagamento')
on conflict (nome) do nothing;

insert into cargos (nome) values
  ('Advogado(a) · Sócio(a)'), ('Advogado(a)'), ('Estagiário(a)'), ('Secretário(a)')
on conflict (nome) do nothing;

insert into configuracoes (chave, valor) values
  ('nome_escritorio', '"Goularte Filho Advocacia"'),
  ('horario_lembrete_audiencia', '"18:00"'),
  ('padrao_nome_arquivo', '"AAAA-MM-DD TIPO - NOME DO CLIENTE"')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Ligação com o Google (mesmo conteúdo de 002_google.sql)
-- ---------------------------------------------------------------------
create table if not exists google_conexao (
  id             int primary key default 1 check (id = 1),
  refresh_token  text not null,
  email          text,
  conectado_por  uuid references perfis (id),
  conectado_em   timestamptz not null default now()
);

alter table google_conexao enable row level security;

-- ---------------------------------------------------------------------
-- Processos: dados que vêm do DataJud (CNJ)
-- ---------------------------------------------------------------------
alter table processos add column if not exists classe text;
alter table processos add column if not exists movimentos jsonb;

-- ---------------------------------------------------------------------
-- WhatsApp (mesmo conteúdo de 003_whatsapp.sql, menos o relógio do pg_cron,
-- que precisa do CRON_SECRET e fica só no 003)
-- ---------------------------------------------------------------------
alter type status_agendamento add value if not exists 'enviando';
alter table mensagens add column if not exists midia_nome text;
create index if not exists conversas_cliente on conversas (cliente_id, criado_em desc);
create index if not exists conversas_fila on conversas (status, ultima_mensagem_em desc);
create index if not exists mensagens_conversa on mensagens (conversa_id, criado_em);
insert into configuracoes (chave, valor) values ('whatsapp_bot', 'true') on conflict (chave) do nothing;

-- Qualificação do cliente para os modelos (mesmo conteúdo de 004_modelos.sql)
alter table clientes add column if not exists rg            text;
alter table clientes add column if not exists nacionalidade text;
alter table clientes add column if not exists estado_civil  text;
alter table clientes add column if not exists profissao     text;
alter table clientes add column if not exists endereco      text;
alter table clientes add column if not exists cep           text;
alter table clientes add column if not exists genero        text check (genero in ('m', 'f'));

-- Modelos editáveis (mesmo conteúdo de 005_modelos_editaveis.sql)
create table if not exists modelos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  arquivo       text not null,              -- começo do nome do arquivo: "PROCURAÇÃO"
  descricao     text,
  conteudo      text not null,
  ordem         int not null default 0,
  rodape        boolean not null default true, -- false: sai sem telefone, e-mail e endereço no fim
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

-- Excluir pessoas sem perder o histórico (mesmo conteúdo de 006_excluir_pessoas.sql)
alter table clientes drop constraint if exists clientes_responsavel_id_fkey, add constraint clientes_responsavel_id_fkey foreign key (responsavel_id) references perfis (id) on delete set null;
alter table casos drop constraint if exists casos_responsavel_id_fkey, add constraint casos_responsavel_id_fkey foreign key (responsavel_id) references perfis (id) on delete set null;
alter table casos_historico drop constraint if exists casos_historico_por_fkey, add constraint casos_historico_por_fkey foreign key (por) references perfis (id) on delete set null;
alter table audiencias drop constraint if exists audiencias_responsavel_id_fkey, add constraint audiencias_responsavel_id_fkey foreign key (responsavel_id) references perfis (id) on delete set null;
alter table conversas drop constraint if exists conversas_atendente_id_fkey, add constraint conversas_atendente_id_fkey foreign key (atendente_id) references perfis (id) on delete set null;
alter table mensagens drop constraint if exists mensagens_autor_id_fkey, add constraint mensagens_autor_id_fkey foreign key (autor_id) references perfis (id) on delete set null;
alter table documentos drop constraint if exists documentos_salvo_por_fkey, add constraint documentos_salvo_por_fkey foreign key (salvo_por) references perfis (id) on delete set null;
alter table mensagens_agendadas drop constraint if exists mensagens_agendadas_criado_por_fkey, add constraint mensagens_agendadas_criado_por_fkey foreign key (criado_por) references perfis (id) on delete set null;
alter table tarefas drop constraint if exists tarefas_responsavel_id_fkey, add constraint tarefas_responsavel_id_fkey foreign key (responsavel_id) references perfis (id) on delete set null;
alter table tarefas drop constraint if exists tarefas_revisor_id_fkey, add constraint tarefas_revisor_id_fkey foreign key (revisor_id) references perfis (id) on delete set null;
alter table google_conexao drop constraint if exists google_conexao_conectado_por_fkey, add constraint google_conexao_conectado_por_fkey foreign key (conectado_por) references perfis (id) on delete set null;
alter table modelos drop constraint if exists modelos_criado_por_fkey, add constraint modelos_criado_por_fkey foreign key (criado_por) references perfis (id) on delete set null;

-- Arquivos do WhatsApp (mesmo conteúdo de 007_arquivos_whatsapp.sql; precisa do Storage do Supabase)
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp', 'whatsapp', false, 67108864)  -- 64 MB por arquivo
on conflict (id) do nothing;

drop policy if exists whatsapp_equipe_envia on storage.objects;
create policy whatsapp_equipe_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp' and public.meu_papel() is not null);

drop policy if exists whatsapp_equipe_le on storage.objects;
create policy whatsapp_equipe_le on storage.objects for select to authenticated
  using (bucket_id = 'whatsapp' and public.meu_papel() is not null);

-- Onde o arquivo da mensagem ficou guardado (caminho dentro do armazenamento)
alter table mensagens add column if not exists arquivo_caminho text;

-- Avisos de mensagem nova (mesmo conteúdo de 008_avisos.sql)
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

-- Clientes sempre em maiúsculas, CPF e CEP formatados (mesmo conteúdo de 009_clientes_maiusculas.sql)
create or replace function clientes_maiusculas() returns trigger
language plpgsql as $$
declare d text;
begin
  new.nome          := upper(btrim(new.nome));
  -- CPF 000.000.000-00 · CNPJ 00.000.000/0000-00 · CEP 00000-000
  d := regexp_replace(coalesce(new.cpf_cnpj, ''), '\D', '', 'g');
  if length(d) = 11 then
    new.cpf_cnpj := substr(d, 1, 3) || '.' || substr(d, 4, 3) || '.' || substr(d, 7, 3) || '-' || substr(d, 10, 2);
  elsif length(d) = 14 then
    new.cpf_cnpj := substr(d, 1, 2) || '.' || substr(d, 3, 3) || '.' || substr(d, 6, 3) || '/' || substr(d, 9, 4) || '-' || substr(d, 13, 2);
  else
    new.cpf_cnpj := nullif(upper(btrim(new.cpf_cnpj)), '');
  end if;
  d := regexp_replace(coalesce(new.cep, ''), '\D', '', 'g');
  if length(d) = 8 then new.cep := substr(d, 1, 5) || '-' || substr(d, 6, 3); end if;
  new.rg            := upper(new.rg);
  new.nacionalidade := upper(new.nacionalidade);
  new.estado_civil  := upper(new.estado_civil);
  new.profissao     := upper(new.profissao);
  new.endereco      := upper(new.endereco);
  new.origem        := upper(new.origem);
  new.observacoes   := upper(new.observacoes);
  return new;
end $$;

drop trigger if exists clientes_maiusculas on clientes;
create trigger clientes_maiusculas before insert or update on clientes
  for each row execute function clientes_maiusculas();

-- Tiques e notas sobre o cliente (mesmo conteúdo de 010_tiques_e_notas.sql)
alter table mensagens add column if not exists status_envio text check (status_envio in ('enviada', 'entregue', 'lida'));

create table if not exists notas_cliente (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  autor_id   uuid references perfis (id) on delete set null,
  texto      text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists notas_cliente_cliente on notas_cliente (cliente_id, criado_em desc);
alter table notas_cliente enable row level security;
drop policy if exists equipe_le on notas_cliente;
create policy equipe_le on notas_cliente for select to authenticated using (meu_papel() is not null);
drop policy if exists equipe_escreve on notas_cliente;
create policy equipe_escreve on notas_cliente for insert to authenticated with check (meu_papel() is not null and autor_id = auth.uid());
drop policy if exists autor_ou_admin_apaga on notas_cliente;
create policy autor_ou_admin_apaga on notas_cliente for delete to authenticated using (autor_id = auth.uid() or sou_admin());
