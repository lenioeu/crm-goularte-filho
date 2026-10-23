-- =====================================================================
-- 003 · WhatsApp: ajustes no banco e envio automático das mensagens agendadas
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================

-- Estado "enviando" (reserva a mensagem enquanto ela sai) e nome do arquivo recebido
alter type status_agendamento add value if not exists 'enviando';
alter table mensagens add column if not exists midia_nome text;

create index if not exists conversas_cliente on conversas (cliente_id, criado_em desc);
create index if not exists conversas_fila on conversas (status, ultima_mensagem_em desc);
create index if not exists mensagens_conversa on mensagens (conversa_id, criado_em);

-- Triagem automática ligada por padrão (desliga em Integrações)
insert into configuracoes (chave, valor) values ('whatsapp_bot', 'true') on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Relógio de 1 minuto: chama o CRM para enviar as mensagens que venceram.
-- ANTES DE RODAR: troque COLE_AQUI_O_CRON_SECRET pelo mesmo valor do
-- CRON_SECRET da Vercel (mantenha o "Bearer " na frente).
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('whatsapp-agendadas') where exists (select 1 from cron.job where jobname = 'whatsapp-agendadas');
select cron.schedule(
  'whatsapp-agendadas',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://crm.goulartefilho.app/api/whatsapp/agendadas',
    headers := jsonb_build_object('Authorization', 'Bearer COLE_AQUI_O_CRON_SECRET'),
    timeout_milliseconds := 60000
  );
  $$
);
