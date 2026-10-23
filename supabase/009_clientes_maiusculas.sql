-- =====================================================================
-- 009 · Cadastro de clientes sempre em LETRAS MAIÚSCULAS, com CPF/CNPJ e CEP formatados
-- Vale para tudo que for gravado (formulário, WhatsApp, importação do Drive)
-- e corrige os cadastros que já existem. Fica de fora o e-mail, e as
-- ligações com o Drive (códigos internos).
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
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

-- Corrige o que já está gravado (o gatilho acima faz a conversão em cada linha)
update clientes set nome = nome;
