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

## Visual

Tons do Gmail (fundo claro, pílulas azuis no menu) com cabeçalho azul-marinho do PJe. Modo
escuro acompanha o sistema operacional.

## Dados pessoais (LGPD)

- Casos podem ser marcados como sigilosos; só o administrador e o responsável os veem.
- Estagiários e atendimento só veem os casos atribuídos a eles.
- Notas internas nunca são enviadas ao cliente.
