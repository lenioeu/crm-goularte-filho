# Recorte Digital (OAB/ES) → Publicações

O Recorte Digital da OAB/ES procura todo dia as publicações com o nome e a OAB do advogado
(DJES, DJEN e diários dos tribunais superiores) e manda um e-mail por dia, mesmo quando não há
publicação. O site não tem API e só abre com login; por isso o Órion usa o e-mail.

## Como funciona

1. O e-mail do Recorte chega ao Gmail do advogado (por volta das 5h–7h).
2. Um script do Google (Apps Script), na própria conta do Gmail, roda de hora em hora, pega os
   e-mails novos do Recorte e manda para o Órion (`/api/publicacoes/recorte`). Os que já foram
   ganham o marcador **Orion-Recorte** no Gmail.
3. O Órion separa cada publicação, liga ao processo (e ao cliente) pelo número e mostra em
   **Publicações**, para a equipe tratar:
   - **Ciência** — lida, sem providência;
   - **Criar tarefa** — vira tarefa do cliente, com data e responsável;
   - **Agendar audiência** — quando o texto marca ou remarca audiência, já vem com dia e hora.
4. Se num dia útil o e-mail não chegar até as 10h, os administradores recebem um aviso no celular.

O Órion **não** guarda a senha do Recorte. A mesma publicação nunca entra duas vezes.

## Ligar (uma vez)

1. Rode no Supabase o script `supabase/017_publicacoes.sql`.
2. No Órion, vá em **Integrações › Recorte Digital** e clique em **Copiar o script**.
3. Abra **script.google.com** com a conta do Gmail que recebe o Recorte › **Novo projeto**.
4. Apague o que vier escrito, cole o script e salve (dê o nome "Órion Recorte").
5. No menu de funções, escolha **instalar** e clique em **Executar**. Autorize o acesso ao Gmail
   (o Google avisa que o app não foi verificado: **Avançado › Ir para Órion Recorte**).

Pronto: ele já traz os e-mails dos últimos 15 dias e passa a rodar sozinho de hora em hora.

## Dúvidas

- **Trocar a senha do script:** troque o `CRON_SECRET` na Vercel, faça um Redeploy e cole o
  script de novo (Integrações mostra a versão nova).
- **Reimportar:** tire o marcador **Orion-Recorte** dos e-mails no Gmail e rode `importarRecorte`.
  O que já está no Órion é pulado.
- **Processo não cadastrado:** a publicação aparece com o aviso "processo não cadastrado ·
  cadastrar", que abre o cadastro com o número preenchido.
