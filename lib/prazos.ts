// Contagem de prazos processuais. Roda no navegador (prévia do vencimento) e no servidor.
//
// Regras (CPC arts. 219, 220 e 224; CLT art. 775):
// - a contagem começa no primeiro dia útil depois da publicação (o dia da publicação não conta);
// - em dias úteis, pula sábado, domingo, feriado e o recesso de 20/12 a 20/01 (prazos suspensos);
// - em dias corridos (ex.: processo penal), conta todos os dias; se o último cair em dia sem expediente,
//   passa para o próximo dia útil;
// - feriados: os nacionais entram sozinhos; os forenses de cada tribunal, os estaduais e os municipais
//   são cadastrados na aba Prazos (tabela "feriados"), com sugestões prontas para confirmar.

export type Contagem = "uteis" | "corridos";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string) => new Date(`${s}T12:00:00Z`);
const somar = (s: string, n: number) => {
  const d = dia(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), d1 = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d1).padStart(2, "0")}`;
}

/**
 * Feriados nacionais (Lei 662/1949 e posteriores) e a Sexta-feira Santa: valem para todo tribunal.
 * Os demais (Carnaval, Corpus Christi, Dia da Justiça…) variam por tribunal: ficam como sugestão
 * (feriadosSugeridos) e só contam depois que o escritório confirma na aba Prazos. Na dúvida, o Órion não
 * pula o dia: errar para menos é seguro, para mais faz perder prazo.
 */
export function feriadosPadrao(ano: number): { dia: string; nome: string }[] {
  const p = pascoa(ano);
  return [
    { dia: `${ano}-01-01`, nome: "Confraternização Universal" },
    { dia: somar(p, -2), nome: "Sexta-feira Santa" },
    { dia: `${ano}-04-21`, nome: "Tiradentes" },
    { dia: `${ano}-05-01`, nome: "Dia do Trabalho" },
    { dia: `${ano}-09-07`, nome: "Independência" },
    { dia: `${ano}-10-12`, nome: "Nossa Senhora Aparecida" },
    { dia: `${ano}-11-02`, nome: "Finados" },
    { dia: `${ano}-11-15`, nome: "Proclamação da República" },
    { dia: `${ano}-11-20`, nome: "Consciência Negra" },
    { dia: `${ano}-12-25`, nome: "Natal" },
  ];
}

/** Dias sem expediente comuns na Justiça, mas que dependem do tribunal: o escritório confirma antes de contarem. */
export function feriadosSugeridos(ano: number): { dia: string; nome: string }[] {
  const p = pascoa(ano);
  return [
    { dia: somar(p, -48), nome: "Carnaval (segunda)" },
    { dia: somar(p, -47), nome: "Carnaval (terça)" },
    { dia: somar(p, -4), nome: "Quarta-feira Santa" },
    { dia: somar(p, -3), nome: "Quinta-feira Santa" },
    { dia: somar(p, 60), nome: "Corpus Christi" },
    { dia: `${ano}-08-11`, nome: "Dia do Advogado (Justiça Federal)" },
    { dia: `${ano}-11-01`, nome: "Todos os Santos (Justiça Federal)" },
    { dia: `${ano}-12-08`, nome: "Dia da Justiça" },
  ];
}

/** Recesso forense: 20/12 a 20/01 (prazos suspensos, CPC art. 220). */
export function noRecesso(s: string) {
  const md = s.slice(5);
  return md >= "12-20" || md <= "01-20";
}

/** Conjunto de dias sem expediente: padrão + os cadastrados pelo escritório. */
export function diasSemExpediente(locais: string[] = [], anos?: number[]) {
  const lista = new Set(locais);
  const hoje = new Date().getUTCFullYear();
  for (const a of anos ?? [hoje - 1, hoje, hoje + 1, hoje + 2]) feriadosPadrao(a).forEach((f) => lista.add(f.dia));
  return lista;
}

/** Dia útil para contagem: não é fim de semana, feriado nem recesso. */
export function ehDiaUtil(s: string, feriados: Set<string>) {
  const sem = dia(s).getUTCDay();
  return sem !== 0 && sem !== 6 && !feriados.has(s) && !noRecesso(s);
}

export function proximoDiaUtil(s: string, feriados: Set<string>) {
  let d = s;
  while (!ehDiaUtil(d, feriados)) d = somar(d, 1);
  return d;
}

/**
 * Vencimento (prazo fatal). `inicio` é a data da publicação (ou da intimação): o primeiro dia contado
 * é o dia útil seguinte.
 */
export function calcularVencimento(inicioBruto: string, dias: number, contagem: Contagem, feriados: Set<string>) {
  const inicio = inicioBruto.slice(0, 10);
  const primeiro = proximoDiaUtil(somar(inicio, 1), feriados);
  if (dias <= 0) return { primeiroDia: primeiro, fatal: primeiro };
  if (contagem === "corridos") {
    return { primeiroDia: primeiro, fatal: proximoDiaUtil(somar(primeiro, dias - 1), feriados) };
  }
  let d = primeiro;
  for (let contados = 1; contados < dias; ) {
    d = somar(d, 1);
    if (ehDiaUtil(d, feriados)) contados++;
  }
  return { primeiroDia: primeiro, fatal: d };
}

/** Prazo interno: N dias úteis antes do fatal (nunca antes de hoje… isso a tela mostra como "atrasado"). */
export function prazoInterno(fatalBruto: string, diasAntes: number, feriados: Set<string>) {
  const fatal = fatalBruto.slice(0, 10);
  if (!DATA.test(fatal)) return fatal;
  let d = fatal;
  for (let n = 0; n < diasAntes; ) {
    d = somar(d, -1);
    if (ehDiaUtil(d, feriados)) n++;
  }
  return d;
}

/** Dias úteis de hoje até o vencimento (0 = vence hoje; negativo = vencido). */
export function diasUteisAte(hojeBruto: string, alvoBruto: string, feriados: Set<string>) {
  const hoje = hojeBruto.slice(0, 10), alvo = alvoBruto.slice(0, 10);
  if (alvo === hoje || !DATA.test(alvo) || !DATA.test(hoje)) return 0;
  const passo = alvo > hoje ? 1 : -1;
  let d = hoje, n = 0;
  for (let voltas = 0; d !== alvo && voltas < 4000; voltas++) {
    d = somar(d, passo);
    if (ehDiaUtil(d, feriados)) n += passo;
  }
  return n;
}

/** Prazos mais comuns, para sugerir dias e contagem ao cadastrar. */
export const PRAZOS_COMUNS: { nome: string; dias: number; contagem: Contagem }[] = [
  { nome: "Contestação", dias: 15, contagem: "uteis" },
  { nome: "Réplica", dias: 15, contagem: "uteis" },
  { nome: "Manifestação", dias: 15, contagem: "uteis" },
  { nome: "Especificação de provas", dias: 15, contagem: "uteis" },
  { nome: "Embargos de declaração", dias: 5, contagem: "uteis" },
  { nome: "Apelação", dias: 15, contagem: "uteis" },
  { nome: "Contrarrazões", dias: 15, contagem: "uteis" },
  { nome: "Agravo de instrumento", dias: 15, contagem: "uteis" },
  { nome: "Agravo interno", dias: 15, contagem: "uteis" },
  { nome: "Recurso especial / extraordinário", dias: 15, contagem: "uteis" },
  { nome: "Recurso ordinário (trabalhista)", dias: 8, contagem: "uteis" },
  { nome: "Recurso de revista", dias: 8, contagem: "uteis" },
  { nome: "Embargos de declaração (trabalhista)", dias: 5, contagem: "uteis" },
  { nome: "Recurso inominado (JEC)", dias: 10, contagem: "uteis" },
  { nome: "Resposta à acusação", dias: 10, contagem: "corridos" },
  { nome: "Alegações finais (memoriais)", dias: 5, contagem: "corridos" },
  { nome: "Apelação criminal", dias: 5, contagem: "corridos" },
  { nome: "Recurso em sentido estrito", dias: 5, contagem: "corridos" },
];

export const dataBR = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
