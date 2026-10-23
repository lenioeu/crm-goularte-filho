// Modelos de documentos do escritório. Cada modelo é um texto com marcadores
// entre chaves duplas ({{QUALIFICACAO}}, {{DATA_EXTENSO}}…) que o CRM troca pelos
// dados do cliente. Marcadores inventados ({{objeto do contrato}}) viram perguntas
// na hora de gerar. Sem IA: o texto é o do escritório e só os campos mudam.
// Este arquivo roda no servidor e no navegador (prévia ao vivo do editor).

export type ClienteDoc = {
  nome: string;
  cpf_cnpj: string | null;
  rg: string | null;
  nacionalidade: string | null;
  estado_civil: string | null;
  profissao: string | null;
  endereco: string | null;
  cep: string | null;
  email: string | null;
  telefone_whatsapp: string | null;
  genero: string | null;
};
export type AdvogadoDoc = { nome: string; oab: string | null };
export type EscritorioDoc = { endereco: string; telefone: string; email: string; cidade: string; foro: string; pagamento: string };
export type ModeloTexto = { id: string; nome: string; arquivo: string; descricao: string | null; conteudo: string; padrao?: boolean };
export type Campo = { chave: string; rotulo: string; padrao: string; opcional: boolean };

export type DadosDoc = {
  cliente: ClienteDoc;
  advogados: AdvogadoDoc[];
  escritorio: EscritorioDoc;
  data: string; // AAAA-MM-DD
  extra: Record<string, string>;
};

export type Bloco =
  | { t: "titulo" | "secao" | "centro" | "p"; texto: string }
  | { t: "assinaturas"; nomes: { nome: string; linhas: string[] }[] };

// Dados profissionais públicos (constam do timbre). Dados bancários não ficam no código:
// o administrador preenche no CRM e eles ficam só no banco de dados.
export const ESCRITORIO_PADRAO: EscritorioDoc = {
  endereco: "Av. Leitão da Silva, 1387, Ed. Sheila, sala 312, Gurigica, Vitória-ES, CEP 29046-005",
  telefone: "(27) 99763-2984",
  email: "juridico@goulartefilho.com.br",
  cidade: "Vitória/ES",
  foro: "VITÓRIA/ES",
  pagamento: "",
};
export const ADVOGADO_PADRAO: AdvogadoDoc = { nome: "LENIO FILGUEIRAS GOULARTE FILHO", oab: "OAB/ES nº 34.299" };

export const CLIENTE_EXEMPLO: ClienteDoc = {
  nome: "MARIA EXEMPLO DA SILVA",
  cpf_cnpj: "12345678901",
  rg: "1234567-SSP/ES",
  nacionalidade: "BRASILEIRA",
  estado_civil: "CASADA",
  profissao: "PROFESSORA",
  endereco: "RUA DAS FLORES, 100, CENTRO, VITÓRIA-ES",
  cep: "29000-000",
  email: "maria@exemplo.com",
  telefone_whatsapp: "27999990000",
  genero: "f",
};

// ------------------------------------------------------------------ Auxiliares
const BRANCO = "______________";
const v = (s: string | null | undefined) => (s && s.trim() ? s.trim() : BRANCO);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dataExtenso(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} de ${a}`;
}
const dataCurta = (iso: string) => iso.split("-").reverse().join("/");

function cpfFormatado(s: string | null) {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return s;
}
function telefoneFormatado(s: string | null) {
  const d = (s ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}

/** "NOME, brasileiro, casado, mecânico, com CPF nº … e RG nº …, residente e domiciliado na …, CEP …" */
export function qualificacao(c: ClienteDoc, comContato = false) {
  const a = c.genero === "f" ? "a" : "o";
  const partes = [
    c.nome.toUpperCase(),
    v(c.nacionalidade),
    v(c.estado_civil),
    v(c.profissao),
    `com CPF nº ${v(cpfFormatado(c.cpf_cnpj))} e RG nº ${v(c.rg)}`,
    `residente e domiciliad${a} na ${v(c.endereco)}`,
    `CEP ${v(c.cep)}`,
  ];
  if (comContato) {
    if (c.telefone_whatsapp) partes.push(`telefone ${telefoneFormatado(c.telefone_whatsapp)}`);
    if (c.email) partes.push(`e-mail ${c.email}`);
  }
  return partes.join(", ");
}

/** Campos da qualificação que ainda estão vazios no cadastro. */
export function faltando(c: ClienteDoc) {
  const lista: [string, string | null][] = [
    ["CPF", c.cpf_cnpj], ["RG", c.rg], ["nacionalidade", c.nacionalidade], ["estado civil", c.estado_civil],
    ["profissão", c.profissao], ["endereço", c.endereco], ["CEP", c.cep],
  ];
  return lista.filter(([, x]) => !x || !x.trim()).map(([n]) => n);
}

function advogadosTexto(lista: AdvogadoDoc[], e: EscritorioDoc) {
  const advs = lista.length ? lista : [ADVOGADO_PADRAO];
  const nomes = advs.map((x) => `${x.nome.toUpperCase()}, com registro na ${v(x.oab)}`);
  const junto = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join("; ")}; e ${nomes[nomes.length - 1]}`;
  return `${junto}, ${advs.length > 1 ? "todos com" : "com"} endereço profissional na ${e.endereco}`;
}

export const rodape = (e: EscritorioDoc) => `Telefone: ${e.telefone} · E-mail: ${e.email} · ${e.endereco}`;

// ------------------------------------------------------------------ Marcadores
type Valor = (d: DadosDoc) => string;
const FIXOS: Record<string, { valor: Valor; ajuda: string; grupo: string }> = {
  NOME: { grupo: "Cliente", ajuda: "Nome do cliente, em maiúsculas", valor: (d) => d.cliente.nome.toUpperCase() },
  QUALIFICACAO: { grupo: "Cliente", ajuda: "Nome, nacionalidade, estado civil, profissão, CPF, RG, endereço e CEP", valor: (d) => qualificacao(d.cliente) },
  QUALIFICACAO_CONTATO: { grupo: "Cliente", ajuda: "A qualificação mais telefone e e-mail", valor: (d) => qualificacao(d.cliente, true) },
  CPF: { grupo: "Cliente", ajuda: "CPF ou CNPJ formatado", valor: (d) => v(cpfFormatado(d.cliente.cpf_cnpj)) },
  RG: { grupo: "Cliente", ajuda: "RG com órgão", valor: (d) => v(d.cliente.rg) },
  NACIONALIDADE: { grupo: "Cliente", ajuda: "ex.: brasileira", valor: (d) => v(d.cliente.nacionalidade) },
  ESTADO_CIVIL: { grupo: "Cliente", ajuda: "ex.: casado", valor: (d) => v(d.cliente.estado_civil) },
  PROFISSAO: { grupo: "Cliente", ajuda: "ex.: mecânico", valor: (d) => v(d.cliente.profissao) },
  ENDERECO: { grupo: "Cliente", ajuda: "Endereço do cliente", valor: (d) => v(d.cliente.endereco) },
  CEP: { grupo: "Cliente", ajuda: "CEP do cliente", valor: (d) => v(d.cliente.cep) },
  TELEFONE: { grupo: "Cliente", ajuda: "WhatsApp do cliente", valor: (d) => v(telefoneFormatado(d.cliente.telefone_whatsapp)) },
  EMAIL: { grupo: "Cliente", ajuda: "E-mail do cliente", valor: (d) => v(d.cliente.email) },
  ADVOGADOS: { grupo: "Escritório", ajuda: "Advogado(s) escolhido(s), com OAB e endereço profissional", valor: (d) => advogadosTexto(d.advogados, d.escritorio) },
  CIDADE: { grupo: "Escritório", ajuda: "Cidade da assinatura, ex.: Vitória/ES", valor: (d) => d.escritorio.cidade },
  FORO: { grupo: "Escritório", ajuda: "Foro do contrato, ex.: VITÓRIA/ES", valor: (d) => d.escritorio.foro },
  CONTA_PAGAMENTO: {
    grupo: "Escritório",
    ajuda: "“na seguinte conta: …” ou, sem conta cadastrada, “na conta indicada pelo CONTRATADO”",
    valor: (d) => (d.escritorio.pagamento.trim() ? `na seguinte conta: ${d.escritorio.pagamento.trim().replace(/\.$/, "")}` : "na conta indicada pelo CONTRATADO"),
  },
  ENDERECO_ESCRITORIO: { grupo: "Escritório", ajuda: "Endereço profissional", valor: (d) => d.escritorio.endereco },
  TELEFONE_ESCRITORIO: { grupo: "Escritório", ajuda: "Telefone do escritório", valor: (d) => d.escritorio.telefone },
  EMAIL_ESCRITORIO: { grupo: "Escritório", ajuda: "E-mail do escritório", valor: (d) => d.escritorio.email },
  DATA: { grupo: "Data", ajuda: "ex.: 23/10/2026", valor: (d) => dataCurta(d.data) },
  DATA_EXTENSO: { grupo: "Data", ajuda: "ex.: 23 de outubro de 2026", valor: (d) => dataExtenso(d.data) },
};

const ESPECIAIS = [
  { marcador: "{{CLAUSULA}}", grupo: "Texto", ajuda: "Numera sozinho: Cláusula 1ª:, Cláusula 2ª:…" },
  { marcador: "{{o/a}}", grupo: "Texto", ajuda: "Escolhe pelo tratamento do cliente; vale para qualquer par, ex.: {{brasileiro/brasileira}}" },
  { marcador: "{{ASSINATURA_CLIENTE:Outorgante}}", grupo: "Assinaturas", ajuda: "Linha de assinatura com o nome do cliente e o papel depois dos dois-pontos" },
  { marcador: "{{ASSINATURA_CLIENTE_CPF:Declarante}}", grupo: "Assinaturas", ajuda: "Igual, com o CPF embaixo do nome" },
  { marcador: "{{ASSINATURA_ADVOGADOS:Contratado}}", grupo: "Assinaturas", ajuda: "Uma assinatura para cada advogado escolhido, com a OAB" },
  { marcador: "{{objeto do contrato}}", grupo: "Perguntas", ajuda: "Qualquer outro nome vira um campo para preencher ao gerar" },
  { marcador: "{{honorários|30% do proveito econômico}}", grupo: "Perguntas", ajuda: "Depois da barra, o texto que já vem preenchido" },
  { marcador: "{{finalidade (opcional)}}", grupo: "Perguntas", ajuda: "Com “(opcional)” no nome, pode ficar em branco" },
];

/** Lista para a ajuda do editor. */
export const MARCADORES = [
  ...Object.entries(FIXOS).map(([k, x]) => ({ marcador: `{{${k}}}`, grupo: x.grupo, ajuda: x.ajuda })),
  ...ESPECIAIS,
];

const TOKEN = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}/g;
const ASSINATURA = /^\{\{\s*ASSINATURA_(CLIENTE_CPF|CLIENTE|ADVOGADOS)\s*(?::\s*([^{}]*?))?\s*\}\}$/;
const chaveDe = (rotulo: string) => rotulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ehGenero = (nome: string) => /^[^\s/]+\/[^\s/]+$/.test(nome);
const ehFixo = (nome: string) => nome in FIXOS || nome === "CLAUSULA" || nome.startsWith("ASSINATURA_");

/** Perguntas que o modelo faz na hora de gerar (marcadores que não são do sistema). */
export function camposDoModelo(conteudo: string): Campo[] {
  const campos = new Map<string, Campo>();
  for (const m of conteudo.matchAll(TOKEN)) {
    const nome = m[1].trim();
    if (ehFixo(nome) || ehGenero(nome)) continue;
    const chave = chaveDe(nome);
    if (!chave || campos.has(chave)) continue;
    campos.set(chave, { chave, rotulo: nome, padrao: (m[2] ?? "").trim(), opcional: /\(opcional\)/i.test(nome) });
  }
  return [...campos.values()];
}

export const usaAdvogados = (conteudo: string) => /\{\{\s*(ADVOGADOS|ASSINATURA_ADVOGADOS)\b/.test(conteudo);

/** Transforma o texto do modelo em blocos (título, parágrafos, assinaturas) já com os dados. */
export function renderizar(conteudo: string, d: DadosDoc): Bloco[] {
  const blocos: Bloco[] = [];
  let clausula = 0;
  const feminino = d.cliente.genero === "f";

  const trocar = (linha: string) =>
    linha
      .replace(TOKEN, (_, bruto: string, padrao: string | undefined, pos: number, todo: string) => {
        const nome = bruto.trim();
        if (nome === "CLAUSULA") return `Cláusula ${++clausula}ª:`;
        if (FIXOS[nome]) return FIXOS[nome].valor(d);
        if (ehGenero(nome)) return nome.split("/")[feminino ? 1 : 0];
        const valor = (d.extra[chaveDe(nome)] ?? padrao ?? "").trim();
        if (!valor) return /\(opcional\)/i.test(nome) ? "" : BRANCO;
        // Evita ponto duplo quando o modelo já tem ponto logo depois do campo
        return todo[pos + _.length] === "." ? valor.replace(/\.$/, "") : valor;
      })
      .replace(/\s+([.,;:])/g, "$1")
      .trim();

  for (const bruta of conteudo.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;

    const ass = linha.match(ASSINATURA);
    if (ass) {
      const papel = (ass[2] ?? "").trim();
      const novos =
        ass[1] === "ADVOGADOS"
          ? (d.advogados.length ? d.advogados : [ADVOGADO_PADRAO]).map((a) => ({ nome: a.nome.toUpperCase(), linhas: [v(a.oab), papel].filter(Boolean) }))
          : [{ nome: d.cliente.nome.toUpperCase(), linhas: [ass[1] === "CLIENTE_CPF" ? `CPF: ${v(cpfFormatado(d.cliente.cpf_cnpj))}` : "", papel].filter(Boolean) }];
      const ultimo = blocos[blocos.length - 1];
      if (ultimo?.t === "assinaturas") ultimo.nomes.push(...novos);
      else blocos.push({ t: "assinaturas", nomes: novos });
      continue;
    }

    const [t, resto] = linha.startsWith("## ")
      ? (["secao", linha.slice(3)] as const)
      : linha.startsWith("# ")
        ? (["titulo", linha.slice(2)] as const)
        : linha.startsWith("> ")
          ? (["centro", linha.slice(2)] as const)
          : (["p", linha] as const);
    const texto = trocar(resto);
    if (texto) blocos.push({ t, texto });
  }
  return blocos;
}

/** Trechos em negrito (**assim**) para a prévia e o HTML. */
export function trechos(texto: string) {
  return texto.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") ? { negrito: true, texto: p.slice(2, -2) } : { negrito: false, texto: p }));
}

// ------------------------------------------------------------------ HTML (Google Docs)
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const comNegrito = (s: string) => trechos(s).map((x) => (x.negrito ? `<b>${esc(x.texto)}</b>` : esc(x.texto))).join("");

export function emHtml(blocos: Bloco[], e: EscritorioDoc) {
  const corpo = blocos
    .map((b) => {
      if (b.t === "assinaturas") {
        return b.nomes
          .map(
            (n) =>
              `<p style="text-align:center;margin:36pt 0 0">______________________________________</p>` +
              `<p style="text-align:center;margin:0;font-weight:bold">${esc(n.nome)}</p>` +
              n.linhas.map((l) => `<p style="text-align:center;margin:0">${esc(l)}</p>`).join(""),
          )
          .join("");
      }
      if (b.t === "titulo") return `<p style="text-align:center;font-weight:bold;font-size:13pt;margin:0 0 18pt">${comNegrito(b.texto)}</p>`;
      if (b.t === "secao") return `<p style="font-weight:bold;margin:12pt 0 4pt">${comNegrito(b.texto)}</p>`;
      if (b.t === "centro") return `<p style="text-align:center;margin:0 0 10pt">${comNegrito(b.texto)}</p>`;
      return `<p style="text-align:justify;line-height:1.5;margin:0 0 10pt">${comNegrito(b.texto)}</p>`;
    })
    .join("\n");
  return (
    `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:12pt">` +
    corpo +
    `<p style="text-align:center;font-size:9pt;color:#555;margin-top:30pt">${esc(rodape(e))}</p></body></html>`
  );
}

// ------------------------------------------------------------------ Modelos que vêm de fábrica
// Texto dos modelos que o escritório já usava no Drive. Servem de ponto de partida
// na aba Modelos e de reserva enquanto o script 005 não foi rodado.
export const MODELOS_PADRAO: ModeloTexto[] = [
  {
    id: "padrao-procuracao",
    nome: "Procuração",
    arquivo: "PROCURAÇÃO",
    descricao: "Ad judicia et extra, com os poderes do art. 105 do CPC.",
    conteudo: `# PROCURAÇÃO “AD JUDICIA ET EXTRA”
## OUTORGANTE:
{{QUALIFICACAO}}.
## OUTORGADO:
{{ADVOGADOS}}.
## PODERES:
O OUTORGANTE nomeia e constitui seu(s) bastante(s) procurador(es) o(s) advogado(s) acima qualificado(s), outorgando-lhe(s) os poderes da “Cláusula Ad Judicia et Extra” para o foro em geral, inclusive as contidas na ressalva do artigo 105 do CPC/15, com exceção ao recebimento de citação, tais como representação em escrituras de divórcios, saque de alvarás judiciais e acordos, podendo substabelecer, notadamente para adoção de todas as medidas necessárias à defesa de seus interesses, bem como levantar alvarás judiciais, transigir, firmar compromissos, apresentar defesa, impetrar habeas corpus, interpor recursos, e todos os demais atos em prol de seus direitos e de sua defesa, em relação aos processos judiciais e procedimentos administrativos em que seja parte ativa ou passiva. {{poderes específicos (opcional)}}
{{CIDADE}}, {{DATA_EXTENSO}}.
{{ASSINATURA_CLIENTE:Outorgante}}`,
  },
  {
    id: "padrao-hipossuficiencia",
    nome: "Declaração de hipossuficiência",
    arquivo: "DECLARAÇÃO DE HIPOSSUFICIÊNCIA",
    descricao: "Para o pedido de gratuidade da justiça (art. 98 do CPC).",
    conteudo: `# DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA
{{QUALIFICACAO_CONTATO}}, declaro que, em função da minha condição financeira, não tenho condições de arcar com o pagamento de custas processuais, sem prejuízo próprio e de minha família, nos termos do art. 5º, LXXIV, da Constituição Federal e do art. 4º da Lei nº 1.060/50. Requeiro, ainda, que o benefício abranja todos os atos do processo, na forma do art. 98 do Código de Processo Civil.
{{CIDADE}}, {{DATA}}.
{{ASSINATURA_CLIENTE_CPF:Declarante}}`,
  },
  {
    id: "padrao-contrato",
    nome: "Contrato de honorários",
    arquivo: "CONTRATO DE HONORÁRIOS",
    descricao: "Prestação de serviços advocatícios, com honorários e multa.",
    conteudo: `# CONTRATO DE PRESTAÇÃO DE SERVIÇOS E HONORÁRIOS ADVOCATÍCIOS
Pelo presente instrumento particular de contrato, {{ADVOGADOS}}, doravante denominado(s) “CONTRATADO” (independente de gênero e número), convenciona e contrata com {{QUALIFICACAO}}, doravante denominad{{o/a}} “CONTRATANTE” (independente de gênero e número), o seguinte:
## DO OBJETO
{{CLAUSULA}} O CONTRATADO compromete-se, com o presente termo, a prestar os seus serviços profissionais para {{objeto: o contratado vai…}}.
Parágrafo único: O CONTRATADO representará o CONTRATANTE, em juízo ou fora dele, mediante procuração com cláusula “ad judicia et extra”, sempre em conformidade com o serviço para o qual foi contratado.
## DOS DEVERES DO CONTRATADO
{{CLAUSULA}} O CONTRATADO tem obrigação de dedicar seus melhores esforços na prestação dos serviços contratados. Porém, o CONTRATANTE fica desde já ciente de que a advocacia é uma atividade de meio, e não de resultado, de modo que não é possível garantir o êxito favorável ao CONTRATANTE no final da ação.
## DOS DEVERES DO CONTRATANTE
{{CLAUSULA}} O CONTRATANTE deverá fornecer em tempo hábil a documentação necessária à propositura e ao andamento da ação, e pagar todas as despesas derivadas da causa.
{{CLAUSULA}} Pelo pactuado neste contrato obrigam-se o CONTRATANTE e seus sucessores.
{{CLAUSULA}} O CONTRATANTE fica obrigado a, sempre que houver mudança de endereço, telefone ou e-mail, comunicar imediatamente ao CONTRATADO.
## DO PREÇO E DAS CONDIÇÕES DE PAGAMENTO
{{CLAUSULA}} Quando em juízo ou fora dele, o CONTRATANTE pagará ao CONTRATADO, para atuar em primeiro e segundo graus de jurisdição, o valor de {{honorários|30% (trinta por cento) a título de honorários contratuais do proveito econômico da lide, inclusive de eventuais acordos}}.
Parágrafo primeiro: Em caso de acordo, ou ainda de êxito na sentença, a conta bancária a ser oferecida para pagamento é a do CONTRATADO, que repassará o dinheiro ao cliente no prazo de até 05 (cinco) dias úteis do recebimento. Ficam a cargo do CONTRATANTE as despesas que porventura vierem a existir para a transferência de valores para banco diverso do banco do CONTRATADO.
Parágrafo segundo: O pagamento poderá ser realizado em dinheiro entregue em mãos diretamente ao CONTRATADO ou por meio de transferência bancária ou depósito, {{CONTA_PAGAMENTO}}.
## DO INADIMPLEMENTO E DA MULTA RESCISÓRIA
{{CLAUSULA}} Estabelece-se multa no valor de UM SALÁRIO MÍNIMO vigente à época da assinatura deste, mais juros de 1% ao mês e correção monetária pelo índice INPC, quando encontrar-se em inadimplência o CONTRATANTE que não cumprir qualquer cláusula presente neste contrato. Encontra-se em inadimplência, ainda, o CONTRATANTE quando: a) fizer composição amigável com qualquer uma das partes, litigantes ou não, sem anuência do CONTRATADO; b) não forem pagos os honorários nas datas estabelecidas, sejam integrais, sejam parcelados; c) for cassado o mandato sem culpa do CONTRATADO; d) constituir outro advogado para o mesmo feito sem conhecimento expresso do CONTRATADO; e) desistir do processo sem anuência expressa do CONTRATADO.
{{CLAUSULA}} Fica o CONTRATADO autorizado desde já a fazer a retenção de seus honorários quando do recebimento de valores devidos ao CONTRATANTE, advindos de êxito da demanda, ainda que parcial.
## DAS DISPOSIÇÕES FINAIS
{{CLAUSULA}} Pode o CONTRATANTE ser representado por outro(a) advogado(a), desde que tenha o consentimento expresso do CONTRATADO, em qualquer ato processual.
{{CLAUSULA}} Para dirimir qualquer questão oriunda do presente contrato, as partes elegem o foro de {{FORO}}, com renúncia expressa de qualquer outro, por mais privilegiado que seja.
E, por assim se acharem justos e contratados, as partes firmam o presente instrumento, em duas vias de igual teor e forma, obrigando-se por si e sucessores ao fiel cumprimento das cláusulas e condições aqui estipuladas.
{{CIDADE}}, {{DATA_EXTENSO}}.
{{ASSINATURA_ADVOGADOS:Contratado}}
{{ASSINATURA_CLIENTE_CPF:Contratante}}`,
  },
  {
    id: "padrao-renuncia",
    nome: "Termo de renúncia (60 salários mínimos)",
    arquivo: "TERMO DE RENÚNCIA",
    descricao: "Renúncia ao que exceder o teto dos Juizados Especiais Federais.",
    conteudo: `# TERMO DE RENÚNCIA A VALORES SUPERIORES A SESSENTA SALÁRIOS MÍNIMOS
EU, {{QUALIFICACAO}}, RENUNCIO EXPRESSAMENTE aos valores que excederem o limite de 60 (sessenta) salários mínimos, definidos como teto fixador da competência dos Juizados Especiais Federais, nos termos do artigo 3º da Lei nº 10.259/01.
{{CIDADE}}, {{DATA_EXTENSO}}.
{{ASSINATURA_CLIENTE:Declarante}}`,
  },
];
