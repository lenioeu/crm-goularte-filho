-- =====================================================================
-- 013 · Modelos de mensagem programada
-- Mensagens prontas que já sabem quando sair: X dias antes/depois da
-- audiência, X dias depois de hoje, ou quando você escolher.
-- Aparecem em Mensagens agendadas › Modelos, no formulário de audiência
-- e no "Programar" da conversa.
-- Rode no Supabase › SQL Editor › New query. Pode rodar mais de uma vez.
-- =====================================================================
create table if not exists modelos_mensagem (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  texto                 text not null,
  gatilho               text not null default 'livre'
    check (gatilho in ('antes_audiencia', 'depois_audiencia', 'depois_de_hoje', 'livre')),
  dias                  int not null default 0 check (dias between 0 and 365),
  hora                  text not null default '10:00' check (hora ~ '^\d{2}:\d{2}$'),
  marcado               boolean not null default false, -- já vem marcado ao agendar audiência
  cancelar_se_responder boolean not null default false,
  ordem                 int not null default 0,
  criado_em             timestamptz not null default now()
);

-- Toda a equipe usa, cria e edita
alter table modelos_mensagem enable row level security;
drop policy if exists equipe_usa on modelos_mensagem;
create policy equipe_usa on modelos_mensagem for all to authenticated
  using (meu_papel() is not null) with check (meu_papel() is not null);

-- Modelos de fábrica (só na primeira vez, com a tabela vazia)
insert into modelos_mensagem (nome, texto, gatilho, dias, hora, marcado, cancelar_se_responder, ordem)
select * from (values
  ($q$Pré-audiência: orientações$q$, $q$Olá, {nome}! A sua audiência de {tipo_audiencia} está marcada para {dia_semana}, {data_audiencia}, às {hora_audiencia}. Local: {local}.

Algumas orientações:
• Leve um documento oficial com foto.
• Use roupa discreta (evite bermuda, chinelo e boné).
• Se tiver testemunhas, avise a gente e confirme que elas poderão ir.
• Chegue com 30 minutos de antecedência.

Qualquer dúvida, é só responder aqui.
Goularte Filho Advocacia$q$, $q$antes_audiencia$q$, 5, $q$10:00$q$, false, false, 10),
  ($q$Lembrete 3 dias antes$q$, $q$Olá, {nome}! Passando para lembrar que a sua audiência de {tipo_audiencia} é na {dia_semana}, {data_audiencia}, às {hora_audiencia}. Local: {local}. Se tiver algum documento ou testemunha para a audiência, fale com a gente por aqui até a véspera.
Goularte Filho Advocacia$q$, $q$antes_audiencia$q$, 3, $q$10:00$q$, true, false, 20),
  ($q$Confirmação de presença$q$, $q$Olá, {nome}! Você confirma presença na audiência de {data_audiencia}, às {hora_audiencia}? Responda SIM para confirmar.
Goularte Filho Advocacia$q$, $q$antes_audiencia$q$, 2, $q$10:00$q$, false, false, 30),
  ($q$Lembrete na véspera$q$, $q$Olá, {nome}! Passando para lembrar da sua audiência de {tipo_audiencia} amanhã, {data_audiencia}, às {hora_audiencia}. Local: {local}. Chegue com 30 minutos de antecedência e leve um documento com foto. Qualquer dúvida, é só responder aqui.
Goularte Filho Advocacia$q$, $q$antes_audiencia$q$, 1, $q$18:00$q$, true, false, 40),
  ($q$Pós-audiência$q$, $q$Olá, {nome}! Obrigado por comparecer à audiência. Assim que sair a decisão ou houver novidade no processo, avisamos por aqui.
Goularte Filho Advocacia$q$, $q$depois_audiencia$q$, 1, $q$10:00$q$, false, false, 50),
  ($q$Cobrança de documentos$q$, $q$Olá, {nome}! Tudo bem? Ainda estamos aguardando os documentos para dar andamento ao seu caso. Pode enviar por aqui mesmo, foto serve.
Goularte Filho Advocacia$q$, $q$depois_de_hoje$q$, 3, $q$10:00$q$, false, true, 60)
) as v(nome, texto, gatilho, dias, hora, marcado, cancelar_se_responder, ordem)
where not exists (select 1 from modelos_mensagem);
