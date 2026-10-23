// Modelos de documentos do escritório, com o texto que o escritório já usa
// (procuração, declaração de hipossuficiência, contrato de honorários e termo
// de renúncia). Os dados do cliente entram sozinhos; o que faltar sai como "______".
// Sem IA: o texto é fixo e só os campos mudam.

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

export type Bloco =
  | { t: "titulo" | "secao" | "p"; texto: string }
  | { t: "assinaturas"; nomes: { nome: string; linhas: string[] }[] };

export type Campo = { nome: string; rotulo: string; padrao?: string; obrigatorio?: boolean; dica?: string; linhas?: number };

export type DadosDoc = {
  cliente: ClienteDoc;
  advogados: AdvogadoDoc[];
  escritorio: EscritorioDoc;
  data: string; // AAAA-MM-DD
  extra: Record<string, string>;
};

export type Modelo = { id: string; nome: string; arquivo: string; descricao: string; campos: Campo[]; gerar: (d: DadosDoc) => Bloco[] };

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

const rodape = (e: EscritorioDoc) => `Telefone: ${e.telefone} · E-mail: ${e.email} · ${e.endereco}`;

// ------------------------------------------------------------------ Modelos
export const MODELOS: Modelo[] = [
  {
    id: "procuracao",
    nome: "Procuração",
    arquivo: "PROCURAÇÃO",
    descricao: "Ad judicia et extra, com os poderes do art. 105 do CPC.",
    campos: [
      { nome: "finalidade", rotulo: "Finalidade específica (opcional)", dica: "ex.: em ação de guarda e regulamentação de visitas de suas filhas" },
    ],
    gerar: ({ cliente, advogados, escritorio, data, extra }) => [
      { t: "titulo", texto: "PROCURAÇÃO “AD JUDICIA ET EXTRA”" },
      { t: "secao", texto: "OUTORGANTE:" },
      { t: "p", texto: qualificacao(cliente) + "." },
      { t: "secao", texto: advogados.length > 1 ? "OUTORGADOS:" : "OUTORGADO:" },
      { t: "p", texto: advogadosTexto(advogados, escritorio) + "." },
      { t: "secao", texto: "PODERES:" },
      {
        t: "p",
        texto:
          "O OUTORGANTE nomeia e constitui seu(s) bastante(s) procurador(es) o(s) advogado(s) acima qualificado(s), outorgando-lhe(s) os poderes da " +
          "“Cláusula Ad Judicia et Extra” para o foro em geral, inclusive as contidas na ressalva do artigo 105 do CPC/15, com exceção ao recebimento " +
          "de citação, tais como representação em escrituras de divórcios, saque de alvarás judiciais e acordos, podendo substabelecer, notadamente " +
          "para adoção de todas as medidas necessárias à defesa de seus interesses, bem como levantar alvarás judiciais, transigir, firmar compromissos, " +
          "apresentar defesa, impetrar habeas corpus, interpor recursos, e todos os demais atos em prol de seus direitos e de sua defesa, em relação aos " +
          "processos judiciais e procedimentos administrativos em que seja parte ativa ou passiva" +
          (extra.finalidade?.trim() ? `, bem como ${extra.finalidade.trim().replace(/\.$/, "")}` : "") +
          ".",
      },
      { t: "p", texto: `${escritorio.cidade}, ${dataExtenso(data)}.` },
      { t: "assinaturas", nomes: [{ nome: cliente.nome.toUpperCase(), linhas: ["Outorgante"] }] },
    ],
  },
  {
    id: "hipossuficiencia",
    nome: "Declaração de hipossuficiência",
    arquivo: "DECLARAÇÃO DE HIPOSSUFICIÊNCIA",
    descricao: "Para o pedido de gratuidade da justiça (art. 98 do CPC).",
    campos: [],
    gerar: ({ cliente, escritorio, data }) => [
      { t: "titulo", texto: "DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA" },
      {
        t: "p",
        texto:
          qualificacao(cliente, true) +
          ", declaro que, em função da minha condição financeira, não tenho condições de arcar com o pagamento de custas processuais, sem prejuízo " +
          "próprio e de minha família, nos termos do art. 5º, LXXIV, da Constituição Federal e do art. 4º da Lei nº 1.060/50. Requeiro, ainda, que o " +
          "benefício abranja todos os atos do processo, na forma do art. 98 do Código de Processo Civil.",
      },
      { t: "p", texto: `${escritorio.cidade}, ${dataCurta(data)}.` },
      { t: "assinaturas", nomes: [{ nome: cliente.nome.toUpperCase(), linhas: [`CPF: ${v(cpfFormatado(cliente.cpf_cnpj))}`, "Declarante"] }] },
    ],
  },
  {
    id: "contrato",
    nome: "Contrato de honorários",
    arquivo: "CONTRATO DE HONORÁRIOS",
    descricao: "Prestação de serviços advocatícios, com honorários e multa.",
    campos: [
      { nome: "objeto", rotulo: "Objeto: o contratado vai…", obrigatorio: true, linhas: 2, dica: "ex.: ajuizar ação de rescisão do contrato de consórcio firmado pelo CONTRATANTE" },
      {
        nome: "honorarios",
        rotulo: "Honorários",
        obrigatorio: true,
        linhas: 2,
        padrao: "30% (trinta por cento) a título de honorários contratuais do proveito econômico da lide, inclusive de eventuais acordos",
      },
    ],
    gerar: ({ cliente, advogados, escritorio, data, extra }) => {
      const advs = advogados.length ? advogados : [ADVOGADO_PADRAO];
      const pagamento = escritorio.pagamento.trim();
      let n = 0;
      const cl = () => `Cláusula ${++n}ª:`;
      return [
        { t: "titulo", texto: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS E HONORÁRIOS ADVOCATÍCIOS" },
        {
          t: "p",
          texto:
            `Pelo presente instrumento particular de contrato, ${advogadosTexto(advogados, escritorio)}, doravante denominado(s) “CONTRATADO” ` +
            `(independente de gênero e número), convenciona e contrata com ${qualificacao(cliente)}, doravante denominado(a) “CONTRATANTE” ` +
            "(independente de gênero e número), o seguinte:",
        },
        { t: "secao", texto: "DO OBJETO" },
        { t: "p", texto: `${cl()} O CONTRATADO compromete-se, com o presente termo, a prestar os seus serviços profissionais para ${v(extra.objeto).replace(/\.$/, "")}.` },
        { t: "p", texto: "Parágrafo único: O CONTRATADO representará o CONTRATANTE, em juízo ou fora dele, mediante procuração com cláusula “ad judicia et extra”, sempre em conformidade com o serviço para o qual foi contratado." },
        { t: "secao", texto: "DOS DEVERES DO CONTRATADO" },
        { t: "p", texto: `${cl()} O CONTRATADO tem obrigação de dedicar seus melhores esforços na prestação dos serviços contratados. Porém, o CONTRATANTE fica desde já ciente de que a advocacia é uma atividade de meio, e não de resultado, de modo que não é possível garantir o êxito favorável ao CONTRATANTE no final da ação.` },
        { t: "secao", texto: "DOS DEVERES DO CONTRATANTE" },
        { t: "p", texto: `${cl()} O CONTRATANTE deverá fornecer em tempo hábil a documentação necessária à propositura e ao andamento da ação, e pagar todas as despesas derivadas da causa.` },
        { t: "p", texto: `${cl()} Pelo pactuado neste contrato obrigam-se o CONTRATANTE e seus sucessores.` },
        { t: "p", texto: `${cl()} O CONTRATANTE fica obrigado a, sempre que houver mudança de endereço, telefone ou e-mail, comunicar imediatamente ao CONTRATADO.` },
        { t: "secao", texto: "DO PREÇO E DAS CONDIÇÕES DE PAGAMENTO" },
        { t: "p", texto: `${cl()} Quando em juízo ou fora dele, o CONTRATANTE pagará ao CONTRATADO, para atuar em primeiro e segundo graus de jurisdição, o valor de ${v(extra.honorarios).replace(/\.$/, "")}.` },
        { t: "p", texto: "Parágrafo primeiro: Em caso de acordo, ou ainda de êxito na sentença, a conta bancária a ser oferecida para pagamento é a do CONTRATADO, que repassará o dinheiro ao cliente no prazo de até 05 (cinco) dias úteis do recebimento. Ficam a cargo do CONTRATANTE as despesas que porventura vierem a existir para a transferência de valores para banco diverso do banco do CONTRATADO." },
        {
          t: "p",
          texto:
            "Parágrafo segundo: O pagamento poderá ser realizado em dinheiro entregue em mãos diretamente ao CONTRATADO ou por meio de transferência bancária ou depósito, " +
            (pagamento ? `na seguinte conta: ${pagamento.replace(/\.$/, "")}.` : "na conta indicada pelo CONTRATADO."),
        },
        { t: "secao", texto: "DO INADIMPLEMENTO E DA MULTA RESCISÓRIA" },
        {
          t: "p",
          texto:
            `${cl()} Estabelece-se multa no valor de UM SALÁRIO MÍNIMO vigente à época da assinatura deste, mais juros de 1% ao mês e correção monetária pelo índice INPC, quando encontrar-se em inadimplência o CONTRATANTE que não cumprir qualquer cláusula presente neste contrato. Encontra-se em inadimplência, ainda, o CONTRATANTE quando: ` +
            "a) fizer composição amigável com qualquer uma das partes, litigantes ou não, sem anuência do CONTRATADO; b) não forem pagos os honorários nas datas estabelecidas, sejam integrais, sejam parcelados; c) for cassado o mandato sem culpa do CONTRATADO; d) constituir outro advogado para o mesmo feito sem conhecimento expresso do CONTRATADO; e) desistir do processo sem anuência expressa do CONTRATADO.",
        },
        { t: "p", texto: `${cl()} Fica o CONTRATADO autorizado desde já a fazer a retenção de seus honorários quando do recebimento de valores devidos ao CONTRATANTE, advindos de êxito da demanda, ainda que parcial.` },
        { t: "secao", texto: "DAS DISPOSIÇÕES FINAIS" },
        { t: "p", texto: `${cl()} Pode o CONTRATANTE ser representado por outro(a) advogado(a), desde que tenha o consentimento expresso do CONTRATADO, em qualquer ato processual.` },
        { t: "p", texto: `${cl()} Para dirimir qualquer questão oriunda do presente contrato, as partes elegem o foro de ${escritorio.foro}, com renúncia expressa de qualquer outro, por mais privilegiado que seja.` },
        { t: "p", texto: "E, por assim se acharem justos e contratados, as partes firmam o presente instrumento, em duas vias de igual teor e forma, obrigando-se por si e sucessores ao fiel cumprimento das cláusulas e condições aqui estipuladas." },
        { t: "p", texto: `${escritorio.cidade}, ${dataExtenso(data)}.` },
        {
          t: "assinaturas",
          nomes: [
            ...advs.map((a) => ({ nome: a.nome.toUpperCase(), linhas: [v(a.oab), "Contratado"] })),
            { nome: cliente.nome.toUpperCase(), linhas: [`CPF nº: ${v(cpfFormatado(cliente.cpf_cnpj))}`, "Contratante"] },
          ],
        },
      ];
    },
  },
  {
    id: "renuncia",
    nome: "Termo de renúncia (60 salários mínimos)",
    arquivo: "TERMO DE RENÚNCIA",
    descricao: "Renúncia ao que exceder o teto dos Juizados Especiais Federais.",
    campos: [],
    gerar: ({ cliente, escritorio, data }) => [
      { t: "titulo", texto: "TERMO DE RENÚNCIA A VALORES SUPERIORES A SESSENTA SALÁRIOS MÍNIMOS" },
      {
        t: "p",
        texto:
          `EU, ${qualificacao(cliente)}, RENUNCIO EXPRESSAMENTE aos valores que excederem o limite de 60 (sessenta) salários mínimos, definidos como teto ` +
          "fixador da competência dos Juizados Especiais Federais, nos termos do artigo 3º da Lei nº 10.259/01.",
      },
      { t: "p", texto: `${escritorio.cidade}, ${dataExtenso(data)}.` },
      { t: "assinaturas", nomes: [{ nome: cliente.nome.toUpperCase(), linhas: ["Declarante"] }] },
    ],
  },
];

export const modeloPorId = (id: string | undefined) => MODELOS.find((m) => m.id === id) ?? MODELOS[0];

// ------------------------------------------------------------------ HTML
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Documento completo em HTML, que o Google Drive converte em Google Docs. */
export function emHtml(blocos: Bloco[], e: EscritorioDoc) {
  const corpo = blocos.map((b) => (b.t === "assinaturas" ? assinaturasHtml(b.nomes) : paragrafoHtml(b.t, b.texto))).join("\n");
  return (
    `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:12pt">` +
    corpo +
    `<p style="text-align:center;font-size:9pt;color:#555;margin-top:30pt">${esc(rodape(e))}</p></body></html>`
  );
}

function paragrafoHtml(t: "titulo" | "secao" | "p", texto: string) {
  if (t === "titulo") return `<p style="text-align:center;font-weight:bold;font-size:13pt;margin:0 0 18pt">${esc(texto)}</p>`;
  if (t === "secao") return `<p style="font-weight:bold;margin:12pt 0 4pt">${esc(texto)}</p>`;
  return `<p style="text-align:justify;line-height:1.5;margin:0 0 10pt">${esc(texto)}</p>`;
}

function assinaturasHtml(nomes: { nome: string; linhas: string[] }[]) {
  return nomes
    .map(
      (n) =>
        `<p style="text-align:center;margin:36pt 0 0">______________________________________</p>` +
        `<p style="text-align:center;margin:0;font-weight:bold">${esc(n.nome)}</p>` +
        n.linhas.map((l) => `<p style="text-align:center;margin:0">${esc(l)}</p>`).join(""),
    )
    .join("");
}
