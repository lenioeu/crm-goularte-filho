-- =====================================================================
-- 006 · Excluir pessoas da equipe sem perder o histórico
-- Ao excluir alguém, o que a pessoa fez fica no sistema, só sem o nome dela.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- (Precisa do 005 antes, por causa da tabela modelos.)
-- =====================================================================
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
