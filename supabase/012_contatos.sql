-- =====================================================================
-- 012 · Contatos que ainda não são clientes
-- Quem escreve pela primeira vez no WhatsApp entra como "contato" (com um
-- tipo: interessado, parte contrária, fornecedor…) e só vai para a lista
-- de Clientes quando alguém clica em "Tornar cliente".
-- Os cadastros que já existem continuam como clientes.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
alter table clientes add column if not exists situacao text not null default 'cliente'
  check (situacao in ('cliente', 'contato'));
alter table clientes add column if not exists contato_tipo text;
create index if not exists clientes_situacao on clientes (situacao);
