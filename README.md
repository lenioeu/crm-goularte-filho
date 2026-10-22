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

## Para rodar no computador (opcional)

```bash
npm install
npm run dev
```

Depois abra http://localhost:3000. O sistema já aponta para o projeto Supabase do escritório.

## O que já funciona

- Login e cadastro, com liberação de acesso pelo administrador
- Início com números reais do banco
- Clientes: cadastro e lista
- Funil de casos: quadro por etapa, filtro por área, não viáveis com motivo
- Tarefas: quadro com coluna de revisão opcional
- Audiências: cadastro, lista por dia e lembrete ao cliente programado para a véspera
- Áreas de atuação: lista e criação
- Equipe e cargos: liberar acesso, escolher papel e cargo
- Meu perfil

## Etapas

1. [x] Repositório
2. [x] Banco de dados e login (Supabase)
3. [x] Sistema no ar (Vercel)
4. [ ] Google Drive e Google Agenda
5. [ ] WhatsApp (Evolution API)
6. [ ] Testes com a equipe
