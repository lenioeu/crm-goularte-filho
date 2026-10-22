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

## 4. Conectar o número do escritório

1. Veja a chave da API: `grep AUTHENTICATION_API_KEY .env`. Ela começa depois do `=`.
2. Abra `https://wa.goulartefilho.app/manager` no navegador.
3. Em **Server URL** coloque `https://wa.goulartefilho.app` e, em **API Key**, a chave do passo 1.
4. **Instance** › **+**:
   - nome `escritorio`;
   - canal `Baileys`;
   - número com DDI e DDD, por exemplo `5551999999999`.
5. Abra a instância › **Get QR Code**.
6. No celular do escritório: WhatsApp › **Aparelhos conectados** › **Conectar um aparelho** › leia o QR.

Use o **WhatsApp Business** no celular. O aparelho pode ficar desligado: a conexão continua no servidor.

## 5. Avisar o CRM (Vercel)

Em Vercel › `crm-goularte-filho` › **Settings** › **Environment Variables**, crie:

| Nome | Valor |
|---|---|
| `EVOLUTION_URL` | `https://wa.goulartefilho.app` |
| `EVOLUTION_API_KEY` | a chave do passo 4.1 |
| `EVOLUTION_INSTANCIA` | `escritorio` |

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

## Próxima etapa (no CRM)

1. **Webhook:** o Evolution avisa o CRM a cada mensagem recebida, em `/api/whatsapp/webhook`.
   O CRM então:
   - cria a conversa e o cliente, se ele for novo;
   - cancela os follow-ups marcados "cancela se responder".
2. **Atendimento:**
   - tela de conversas com a fila por área;
   - triagem automática por menu ("1 Trabalhista, 2 Cível…");
   - botão para salvar documentos recebidos na pasta do cliente no Drive.
3. **Envio dos agendamentos:** o `pg_cron` do Supabase chama o CRM a cada minuto. O cron
   gratuito da Vercel roda só uma vez por dia. O CRM envia as mensagens vencidas e marca
   cada uma como `enviada` ou `falhou`.
