-- =====================================================================
-- 010 · Tiques das mensagens (✓ enviada, ✓✓ entregue, ✓✓ azul lida)
--       e notas sobre o cliente (ficha do cliente)
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- Depois, em Integrações › WhatsApp, clique em "Atualizar ligação" uma vez.
-- =====================================================================
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
