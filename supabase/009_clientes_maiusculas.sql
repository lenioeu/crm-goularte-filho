-- =====================================================================
-- 009 · Cadastro de clientes sempre em LETRAS MAIÚSCULAS
-- Vale para tudo que for gravado (formulário, WhatsApp, importação do Drive)
-- e corrige os cadastros que já existem. Fica de fora o e-mail, e as
-- ligações com o Drive (códigos internos).
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
create or replace function clientes_maiusculas() returns trigger
language plpgsql as $$
begin
  new.nome          := upper(btrim(new.nome));
  new.cpf_cnpj      := upper(new.cpf_cnpj);
  new.rg            := upper(new.rg);
  new.nacionalidade := upper(new.nacionalidade);
  new.estado_civil  := upper(new.estado_civil);
  new.profissao     := upper(new.profissao);
  new.endereco      := upper(new.endereco);
  new.cep           := upper(new.cep);
  new.origem        := upper(new.origem);
  new.observacoes   := upper(new.observacoes);
  return new;
end $$;

drop trigger if exists clientes_maiusculas on clientes;
create trigger clientes_maiusculas before insert or update on clientes
  for each row execute function clientes_maiusculas();

-- Corrige o que já está gravado (o gatilho acima faz a conversão)
update clientes set nome = nome
where nome <> upper(nome) or cpf_cnpj <> upper(cpf_cnpj) or rg <> upper(rg) or nacionalidade <> upper(nacionalidade)
   or estado_civil <> upper(estado_civil) or profissao <> upper(profissao) or endereco <> upper(endereco)
   or cep <> upper(cep) or origem <> upper(origem) or observacoes <> upper(observacoes);
