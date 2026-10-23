-- =====================================================================
-- 007 · Arquivos do WhatsApp (áudio, vídeo, foto e documento)
-- Guarda no armazenamento privado do Supabase o que a equipe envia e o que
-- o cliente manda, para ouvir e ver dentro do CRM.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
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
