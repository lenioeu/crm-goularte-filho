# WhatsApp do escritório: instalação no servidor da Oracle

O WhatsApp entra pelo **Evolution API**, programa gratuito que conecta um número comum
pelo QR Code, do mesmo jeito que o WhatsApp Web. Ele roda no servidor gratuito da Oracle
(Ubuntu 22.04, processador ARM, 1 OCPU e 6 GB). A imagem oficial
`evoapicloud/evolution-api` tem versão para ARM, conferida no Docker Hub em 22/10/2026.

Endereço final: `https://wa.goulartefilho.app`

Arquivos usados (pasta `infra/whatsapp`):

| Arquivo | Para que serve |
|---|---|
| `docker-compose.yml` | Liga os quatro programas: Evolution API, banco Postgres, Redis e Caddy (HTTPS) |
| `Caddyfile` | Faz o Caddy atender o domínio e tirar o certificado HTTPS sozinho |
| `instalar.sh` | Cria o `.env` com senhas novas, geradas no próprio servidor, e liga tudo |

As senhas ficam só no arquivo `.env` do servidor. Elas não vão para o GitHub nem para o chat.

## 1. Apontar o domínio para o servidor (Cloudflare)

1. Cloudflare › `goulartefilho.app` › **DNS** › **Records** › **Add record**.
2. Tipo `A`, nome `wa`, IPv4 `163.176.231.134`.
3. Proxy: deixe a **nuvem cinza** (DNS only). Assim o Caddy consegue tirar o certificado.
4. Salve.

## 2. Abrir as portas 80 e 443 na Oracle

A Oracle bloqueia as portas em dois lugares: no painel e dentro do próprio Ubuntu.

**No painel:**

1. Menu › **Networking** › **Virtual cloud networks** › clique na rede do servidor.
2. **Subnets** › clique na subnet › **Security Lists** › **Default Security List**.
3. **Add Ingress Rules** e preencha:
   - Source CIDR `0.0.0.0/0`
   - IP Protocol `TCP`
   - Destination Port Range `80,443`
4. Salve.

**No Ubuntu:** entre por SSH e cole:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Instalar

Ainda no SSH:

```bash
git clone --depth 1 https://github.com/lenioeu/crm-goularte-filho.git
cd crm-goularte-filho/infra/whatsapp
bash instalar.sh
```

O primeiro download leva alguns minutos. No fim aparece "Pronto".

Se aparecer `permission denied` ao falar com o Docker, rode `sudo usermod -aG docker ubuntu`.
Depois saia (`exit`), entre de novo e repita `bash instalar.sh`.

## 4. Avisar o CRM (Vercel)

1. Veja a chave da API, ainda no SSH: `grep AUTHENTICATION_API_KEY .env`. A chave é o que vem depois do `=`.
2. Em Vercel › `crm-goularte-filho` › **Settings** › **Environment Variables**, crie:

   | Nome | Valor |
   |---|---|
   | `EVOLUTION_URL` | `https://wa.goulartefilho.app` |
   | `EVOLUTION_API_KEY` | a chave do item 1 |

   O CRM também usa a `SUPABASE_SECRET_KEY` e a `CRON_SECRET`, que já estão na lista de passos do Google.
3. **Deployments** › no último, clique em ⋯ › **Redeploy**.

## 5. Preparar o banco (Supabase)

1. Abra `supabase/003_whatsapp.sql` no GitHub e copie tudo.
2. Supabase › **SQL Editor** › **New query** › cole.
3. Antes de rodar, troque `COLE_AQUI_O_CRON_SECRET` pelo mesmo valor da `CRON_SECRET` da Vercel.
4. Clique em **Run**.

Esse script liga um relógio que, a cada minuto, pede ao CRM para enviar as mensagens
agendadas que venceram. O cron gratuito da Vercel roda só uma vez por dia; por isso o
relógio fica no Supabase.

## 6. Conectar o número do escritório

1. No CRM, entre como administrador e abra **Integrações** › **WhatsApp** › **Conectar WhatsApp**.
2. Aparece um QR Code. No celular do escritório: WhatsApp Business › ⋮ › **Aparelhos conectados** ›
   **Conectar um aparelho** › aponte para o código.
3. Em alguns segundos a situação muda para **Conectado**.

O botão também liga o aviso de mensagens do Evolution para o CRM. O celular pode ficar
desligado: a conexão continua no servidor.

O painel do Evolution (`https://wa.goulartefilho.app/manager`) fica disponível para
emergências, mas não é preciso usá-lo.

## Manutenção

Rode estes comandos dentro de `~/crm-goularte-filho/infra/whatsapp`.

| Para | Comando |
|---|---|
| Ver se está tudo de pé | `docker compose ps` |
| Ver os registros da API | `docker compose logs -f evolution` (sair com Ctrl+C) |
| Reiniciar | `docker compose restart evolution` |
| Atualizar os arquivos do repositório | `git pull && docker compose up -d` |

Para trocar de versão, mude `v2.3.7` no `docker-compose.yml` e rode
`docker compose pull && docker compose up -d`.

## Cuidados com o número

O Evolution API não é a API oficial da Meta. Por isso há risco de bloqueio do número se
ele for usado como disparador. Para reduzir o risco:

- mande mensagens só para quem já falou com o escritório (é também a regra da OAB);
- não faça envios em massa nem listas de transmissão pelo sistema;
- os agendamentos saem um a um, com intervalo entre eles.

## Como funciona no CRM

- **Atendimento:** a tela lista as conversas na **Fila**, **Comigo**, **Em atendimento** e
  **Encerradas**, e se atualiza sozinha a cada 8 segundos. Quem responde assume a conversa.
  A **nota interna** fica só no CRM e não vai para o cliente.
- **Triagem automática:** quem escreve pela primeira vez recebe o menu das áreas
  ("1 - Trabalhista…") e, ao escolher, a lista de documentos daquela área. Se não
  responder certo duas vezes, a conversa vai para a fila. Liga e desliga em Integrações.
  Clientes que já têm área não passam pelo menu.
- **Contato novo:** quem escreve e não é cliente é cadastrado com o nome do WhatsApp e
  origem "WhatsApp".
- **Documentos:** cada arquivo recebido tem o campo "Que documento é?". O CRM salva na
  pasta do cliente no Drive como `AAAA-MM-DD TIPO - NOME DO CLIENTE`. Se o cliente ainda
  não tem pasta, ela é criada.
- **Mensagens agendadas:** saem no horário marcado, no máximo 8 por minuto e com intervalo
  entre elas. Quando o cliente responde, os follow-ups marcados "cancela se responder"
  são cancelados.

## Histórico de conversas antigas

Para trazer ao CRM as conversas que o número já tinha antes (de outro sistema ou do
próprio celular). O WhatsApp só manda o histórico para um aparelho no momento em que ele
é conectado; por isso o caminho é: ligar a gravação, reconectar e importar.

1. **No servidor (uma vez só).** Entre por SSH e cole:

   ```bash
   cd ~/crm-goularte-filho/infra/whatsapp
   sed -i 's/^DATABASE_SAVE_DATA_HISTORIC=false/DATABASE_SAVE_DATA_HISTORIC=true/' .env
   grep -q '^DATABASE_SAVE_DATA_HISTORIC=true' .env || echo 'DATABASE_SAVE_DATA_HISTORIC=true' >> .env
   docker compose up -d
   ```

2. **No CRM:** Integrações › WhatsApp › "Trazer as conversas antigas" › **Pedir histórico completo**.
3. **Reconecte:** clique em **Desconectar** e depois em **Conectar**, e leia o QR Code com o
   celular do escritório. Deixe o celular ligado e com internet por alguns minutos.
4. **Importe:** clique em **Importar conversas antigas**. Pode repetir mais tarde: o que já
   está no CRM é pulado.

O que acontece na importação:

- cada número vira contato (ou é ligado ao cliente que já tem esse WhatsApp);
- as mensagens entram com a data original, até 2.000 por conversa;
- quem não tinha conversa no CRM ganha uma já **encerrada**; quem tinha, recebe o histórico nela;
- não dispara a triagem automática nem notificações; grupos ficam de fora.

O quanto de histórico chega depende do WhatsApp: em geral os últimos meses, às vezes mais.
