# CRM Goularte Filho Advocacia

Sistema de atendimento e gestão de casos do escritório Goularte Filho Advocacia.

O atendimento acontece pelo WhatsApp. Um bot faz a triagem por área do direito e entrega a
conversa ao responsável. O sistema guarda clientes, casos, processos e audiências, agenda
mensagens e salva os documentos do cliente direto na pasta dele no Google Drive.

## Onde está cada coisa

| Caminho | O que é |
|---|---|
| `docs/prototipo.html` | Protótipo navegável das telas. Abra no navegador. |
| `docs/decisoes.md` | Decisões de produto e de tecnologia já tomadas. |
| `supabase/schema.sql` | Estrutura do banco de dados (tabelas, permissões e dados iniciais). |

## Como o sistema é montado

| Peça | Serviço | Custo |
|---|---|---|
| Banco de dados e login | Supabase | plano gratuito para começar |
| Telas (o sistema em si) | Vercel | plano gratuito para começar |
| WhatsApp | Evolution API, no servidor gratuito da Oracle | grátis |
| Documentos | Google Drive do escritório (`Goularte Filho › Clientes`) | já existente |
| Audiências | Google Agenda | já existente |
| Processos | API pública do CNJ (DataJud) | grátis |

## Etapas

1. [x] Repositório
2. [ ] Banco de dados e login (Supabase)
3. [ ] Sistema no ar (Vercel)
4. [ ] Google Drive e Google Agenda
5. [ ] WhatsApp (Evolution API)
6. [ ] Testes com a equipe
