// Lê uma lista de processos (planilha "número;cliente;parte contrária" ou texto copiado do
// acervo do PJe) e compara os nomes com os clientes do CRM. Roda no servidor e no navegador.

export type LinhaLida = { numero: string; nome: string; parteContraria: string };

const CNJ = /(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})/;

function dvCNJ(d: string) {
  return 98 - (Number(BigInt(d.slice(0, 7) + d.slice(9)) * 100n % 97n)) === Number(d.slice(7, 9));
}
const formatar = (d: string) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;

/** Planilha (separada por ; ou tabulação) ou texto do PJe: "ATOrd 0000382-96.2025.5.17.0008  FULANO x EMPRESA". */
export function lerLista(texto: string): LinhaLida[] {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const saida: LinhaLida[] = [];
  const vistos = new Set<string>();
  const add = (d: string, nome: string, contra: string) => {
    if (!dvCNJ(d) || vistos.has(d)) return;
    vistos.add(d);
    saida.push({ numero: formatar(d), nome: nome.replace(/\s+/g, " ").trim().toUpperCase(), parteContraria: contra.replace(/\s+/g, " ").trim().toUpperCase() });
  };

  // 1) Planilha: cada linha tem número e nome, separados por ; ou tabulação
  const planilha = linhas.filter((l) => /[;\t]/.test(l) && CNJ.test(l.replace(/\s/g, "")));
  if (planilha.length) {
    for (const l of planilha) {
      const cols = l.split(/[;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      const iNum = cols.findIndex((c) => CNJ.test(c.replace(/\s/g, "")));
      const m = cols[iNum].replace(/\s/g, "").match(CNJ)!;
      const resto = cols.filter((_, i) => i !== iNum && cols[i]);
      add(m.slice(1).join(""), resto[0] ?? "", resto[1] ?? "");
    }
    return saida;
  }

  // 2) Texto do acervo do PJe: número e, nas linhas seguintes, "AUTOR x RÉU"
  // Sobras da tela do PJe que aparecem no meio dos nomes: colunas, horários, ícones, comarcas e rodapé
  const parar =
    /^(100%|Audiência em:|Audiência$|Autuação$|\d{1,2}\/\d{2}\/\d{4}|\d{1,2}:\d{2}$|\d+\.\d+\.\d+\.\d+|Órgão|Processo$|-$|\d+ª Vara|Vara$|Trabalho$|de$|do$|da$|de Vitória|Vitória$|Cachoeiro|Itapemirim$|Julgador|Data da|Página|[\uE000-\uF8FF\s]+$)/i;
  const juntas = linhas.map((l) => l.trim());
  for (let i = 0; i < juntas.length; i++) {
    // o número pode vir quebrado em duas linhas ("0000382-" / "96.2025.5.17.0008")
    let alvo = juntas[i];
    let pulo = 0;
    if (/\d{7}-$/.test(alvo) && /^\d{2}\.\d{4}/.test(juntas[i + 1] ?? "")) {
      alvo += juntas[i + 1];
      pulo = 1;
    }
    const m = alvo.replace(/\s(?=\d{2}\.\d{4}\.)/, "").match(CNJ);
    if (!m) continue;
    const partes: string[] = [];
    const depois = alvo.slice(alvo.indexOf(m[0]) + m[0].length).trim();
    if (depois && !parar.test(depois)) partes.push(depois);
    let j = i + 1 + pulo;
    for (; j < juntas.length; j++) {
      const t = juntas[j];
      if (CNJ.test(t.replace(/\s/g, "")) || /\d{7}-$/.test(t)) break;
      if (!t || parar.test(t)) {
        if (partes.some((p) => /\sx(\s|$)|^x\s/i.test(p)) && !t) {
          // depois do "x", uma linha vazia seguida de outra linha de nome ainda é continuação
          const prox = juntas.slice(j + 1).find((x) => x);
          if (!prox || parar.test(prox) || CNJ.test(prox.replace(/\s/g, ""))) break;
        }
        continue;
      }
      partes.push(t);
    }
    const tudo = partes.join(" ").replace(/\s+/g, " ").trim();
    const [autor, ...reu] = tudo.split(/\s+x\s+|^x\s+/i);
    add(m.slice(1).join(""), autor ?? "", reu.join(" x "));
    i = j - 1;
  }
  return saida;
}

// ------------------------------------------------------------------ Comparar nomes
const LIGACOES = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
export const normalizarNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
const palavras = (s: string) => normalizarNome(s).split(" ").filter((p) => p && !LIGACOES.has(p));

/** 0 a 1: quão parecido é o nome da lista com o nome do cliente no CRM. */
export function semelhanca(a: string, b: string) {
  const na = normalizarNome(a), nb = normalizarNome(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const pa = palavras(a), pb = palavras(b);
  if (!pa.length || !pb.length) return 0;
  const sa = new Set(pa), sb = new Set(pb);
  const comuns = [...sa].filter((p) => sb.has(p)).length;
  // Um nome contido no outro (ex.: pasta só com nome e sobrenome)
  const menor = Math.min(sa.size, sb.size);
  if (comuns === menor && menor >= 2 && pa[0] === pb[0]) return 0.9;
  const jaccard = comuns / new Set([...pa, ...pb]).size;
  const primeiroEUltimo = pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1] ? 0.15 : 0;
  return Math.min(0.89, jaccard + primeiroEUltimo);
}

export type Sugestao = { id: string; nome: string; nota: number };

export function sugerir(nome: string, clientes: { id: string; nome: string }[], quantas = 3): Sugestao[] {
  return clientes
    .map((c) => ({ id: c.id, nome: c.nome, nota: semelhanca(nome, c.nome) }))
    .filter((x) => x.nota >= 0.45)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, quantas);
}
