# Decisões do projeto

Registro do que já foi definido. Quando algo mudar, atualize aqui.

## Escopo

- Sistema de uso exclusivo do escritório Goularte Filho Advocacia. Sem planos de assinatura e
  sem vários escritórios.
- A equipe é configurável: o administrador define quantos usuários existem e o cargo de cada
  pessoa. O cargo aparece abaixo do nome em todas as telas (ex.: "Advogado", "Estagiária").
- Fora do escopo por enquanto: controle de prazos processuais e forma de pagamento de
  honorários. O escritório já tem um sistema próprio de receitas e despesas; integrar com ele
  fica para depois.

## Áreas de atuação

Trabalhista, Cível, Criminal, Previdenciário, Família e Execução Fiscal. Novas áreas podem ser
adicionadas pelo sistema. Cada área vira:

- uma opção no menu do bot de triagem;
- um filtro no atendimento, no funil e nos relatórios;
- uma pasta dentro de `Clientes` no Google Drive.

## Funil de casos

Primeiro contato → Triagem → Consulta agendada → Proposta de honorários → Contrato assinado.
Casos sem viabilidade saem do funil com o motivo registrado.

## WhatsApp

- Conexão não oficial por QR code, pelo **Evolution API** (código aberto e gratuito), rodando
  no servidor gratuito da Oracle Cloud (ARM, Ubuntu 22.04).
- Plano B, se o Evolution API não funcionar no servidor: conector brasileiro pago por número.
- Para reduzir o risco de bloqueio: número exclusivo do escritório, conversa iniciada pelo
  cliente, sem envios em massa.

## Google Drive

O sistema segue a organização que o escritório já usa:

```
Goularte Filho › Clientes › ÁREA › NOME DO CLIENTE
```

- Sem subpastas dentro da pasta do cliente.
- Pastas existentes são vinculadas aos clientes pelo nome; casos duvidosos ficam para
  confirmação manual.
- A pasta é criada automaticamente quando o bot conclui a triagem.
- Arquivos recebidos pelo WhatsApp são salvos renomeados: `AAAA-MM-DD TIPO - NOME DO CLIENTE.ext`.
- O sistema envia os arquivos pela conta Google do escritório, para que os arquivos novos
  pertençam ao escritório, e não à conta pessoal de quem atendeu.

## Mensagens agendadas

- Tipos: lembrete de audiência, follow-up e mensagem livre.
- Lembrete de audiência criado automaticamente para a véspera, às 18h.
- Follow-up pode ser cancelado automaticamente se o cliente responder antes.
- Follow-up só para quem procurou o escritório (Provimento 205/2021 da OAB veda captação).

## Indicadores

Números para consulta, por pessoa e do escritório. Sem pontuação e sem ranking. A tabela da
equipe fica em ordem alfabética.

## Petições

O padrão de endereçamento é sempre alinhado à esquerda e justificado, na forma
"AO JUÍZO DA X VARA...", nunca "Excelentíssimo Senhor Doutor Juiz de Direito".

O CRM **não** terá gerador de petições com IA. Decisão do escritório em 23/10/2026: não
sugerir de novo. Modelos de documentos (procuração, contrato, declaração) são preenchidos
com os dados do cliente, sem IA.

## Modelos de documentos

Os textos vêm dos modelos que o escritório já usava no Drive (procuração cível, declaração
de hipossuficiência da ZapSign, contrato de honorários e termo de renúncia do JEF). O CRM
preenche a qualificação do cliente, os advogados escolhidos (quem tem OAB em Meu perfil) e a
data, e salva como Google Docs na pasta do cliente para revisão antes da assinatura.

Na aba **Modelos**, administradores e advogados criam e editam os textos. Cada linha é um
parágrafo; marcadores entre chaves duplas trazem os dados (`{{QUALIFICACAO}}`,
`{{DATA_EXTENSO}}`, `{{CLAUSULA}}`, `{{ASSINATURA_CLIENTE:Outorgante}}`…) e qualquer outro
nome (`{{objeto do contrato}}`) vira pergunta na hora de gerar. Os quatro modelos acima vêm
de fábrica e são copiados para a tabela `modelos` (script 005) quando o escritório quiser editá-los.

Como o repositório é público, dados bancários e CPF do advogado não ficam no código: o
administrador preenche a conta para pagamento na tela de Documentos, e ela fica só no banco.

## Teste antes de publicar

A Vercel roda `scripts/teste-fumaca.mjs` depois de compilar. Ele liga o CRM contra um
Supabase falso, abre todas as páginas logado e bloqueia a publicação se alguma quebrar.
Rode no computador com `npm run build && npm run teste`.

## Visual

Tons do Gmail (fundo claro, pílulas azuis no menu) com cabeçalho azul-marinho do PJe. Modo
escuro acompanha o sistema operacional.

## Dados pessoais (LGPD)

- Casos podem ser marcados como sigilosos; só o administrador e o responsável os veem.
- Estagiários e atendimento só veem os casos atribuídos a eles.
- Notas internas nunca são enviadas ao cliente.

## Equipe

O administrador adiciona pessoas em Equipe (o CRM cria o acesso com uma senha provisória, que a
pessoa troca em Meu perfil) e pode excluí-las. Com o script 006, excluir uma pessoa mantém casos,
tarefas e mensagens dela, só sem o nome. Para bloquear sem apagar, basta desmarcar "Ativo".

## Processos a partir do Drive

O DataJud não informa o nome das partes (LGPD). Para ligar os processos antigos aos clientes, o
botão "Procurar processos nas pastas" lê os nomes dos arquivos das pastas dos clientes, acha números
no formato CNJ (conferindo os dígitos verificadores) e só cadastra depois da revisão.

## Atendimento automático e avisos

A triagem do WhatsApp segue as regras da página Atendimento automático (configuracoes.whatsapp_bot_config):
sempre, só fora do expediente ou desligada; textos com {nome}, {menu}, {area} e {documentos}; áreas do menu;
tentativas. Respostas rápidas ficam em configuracoes.respostas_rapidas e aparecem ao digitar "/" na conversa.

Avisos de mensagem nova: conversas.aguardando_resposta liga quando o cliente escreve e desliga quando alguém
da equipe responde (o bot não conta). O menu mostra o contador e toca um som; com notificações ligadas no
aparelho (Web Push, chaves geradas pelo próprio CRM e guardadas em chaves_push), avisa mesmo com o CRM fechado.
No iPhone, só com o app instalado na tela de início.

