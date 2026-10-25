-- =====================================================================
-- 015 · Mensagens apagadas e editadas no atendimento
-- Guarda quando uma mensagem foi apagada (e por quem: cliente ou
-- escritório) e quando foi editada, com o texto original.
-- Depois de rodar, clique em Integrações › WhatsApp › "Atualizar ligação"
-- para o WhatsApp avisar o CRM das mensagens apagadas e editadas.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
alter table mensagens add column if not exists apagada_em     timestamptz;
alter table mensagens add column if not exists apagada_por    text check (apagada_por in ('cliente', 'escritorio'));
alter table mensagens add column if not exists editada_em     timestamptz;
alter table mensagens add column if not exists texto_original text;
