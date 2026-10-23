-- 011: o modelo pode sair sem o rodapé do escritório (telefone, e-mail e endereço).
-- Rode uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
alter table modelos add column if not exists rodape boolean not null default true;
