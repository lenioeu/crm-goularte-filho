// Consulta à API pública do DataJud (CNJ).
// Documentação: https://datajud-wiki.cnj.jus.br/api-publica/
// A chave abaixo é a chave PÚBLICA divulgada pelo CNJ para todos; se o CNJ
// trocar, basta definir DATAJUD_API_KEY na Vercel.
const CHAVE_PUBLICA = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

// Ordem dos códigos de tribunal (TR) da Justiça Estadual e Eleitoral, 01 a 27.
const UFS = ["ac", "al", "ap", "am", "ba", "ce", "dft", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to"];

export const somenteDigitos = (s: string) => s.replace(/\D/g, "");

export function formatarCNJ(d: string) {
  if (d.length !== 20) return d;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

/** Confere os dígitos verificadores do número único (Resolução CNJ 65/2008, módulo 97). */
export function validarCNJ(d: string) {
  if (!/^\d{20}$/.test(d)) return false;
  const n = d.slice(0, 7), dv = d.slice(7, 9), resto = d.slice(9);
  const r = BigInt(n + resto + "00") % 97n;
  return Number(98n - r) === Number(dv);
}

/** Nome do índice do tribunal no DataJud (ex.: api_publica_trt17). */
export function indiceTribunal(d: string): { indice: string; sigla: string } | null {
  const j = d.slice(13, 14);
  const tr = d.slice(14, 16);
  const n = Number(tr);
  let sigla: string | null = null;
  if (j === "8" && n >= 1 && n <= 27) sigla = UFS[n - 1] === "dft" ? "tjdft" : `tj${UFS[n - 1]}`;
  else if (j === "5") sigla = n === 0 ? "tst" : `trt${n}`;
  else if (j === "4" && n >= 1 && n <= 6) sigla = `trf${n}`;
  else if (j === "6" && n >= 1 && n <= 27) sigla = `tre-${UFS[n - 1] === "dft" ? "df" : UFS[n - 1]}`;
  else if (j === "9") sigla = ({ 13: "tjmmg", 21: "tjmrs", 26: "tjmsp" } as Record<number, string>)[n] ?? null;
  else if (j === "3") sigla = "stj";
  if (!sigla) return null;
  return { indice: `api_publica_${sigla}`, sigla: sigla.toUpperCase() };
}

export type Movimento = { data: string; nome: string };
export type ResumoProcesso = {
  tribunal: string;
  orgao: string | null;
  classe: string | null;
  movimentos: Movimento[];
};

type Fonte = {
  classe?: { nome?: string };
  orgaoJulgador?: { nome?: string };
  dataHoraUltimaAtualizacao?: string;
  movimentos?: { nome?: string; dataHora?: string; complementosTabelados?: { nome?: string; descricao?: string }[] }[];
};

/** Busca o processo no DataJud. Retorna null se o tribunal não tiver o processo (ou ele for sigiloso). */
export async function consultarDataJud(d: string): Promise<ResumoProcesso | null> {
  const t = indiceTribunal(d);
  if (!t) throw new Error("Não reconheci o tribunal pelo número do processo.");

  const r = await fetch(`https://api-publica.datajud.cnj.jus.br/${t.indice}/_search`, {
    method: "POST",
    headers: {
      Authorization: `APIKey ${process.env.DATAJUD_API_KEY ?? CHAVE_PUBLICA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ size: 10, query: { match: { numeroProcesso: d } } }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`O DataJud respondeu ${r.status}.`);
  const j = (await r.json()) as { hits?: { hits?: { _source: Fonte }[] } };
  const fontes = (j.hits?.hits ?? []).map((h) => h._source);
  if (fontes.length === 0) return null;

  // O mesmo processo pode vir em mais de um grau (1º grau, recurso): junta tudo.
  fontes.sort((a, b) => (b.dataHoraUltimaAtualizacao ?? "").localeCompare(a.dataHoraUltimaAtualizacao ?? ""));
  const vistos = new Set<string>();
  const movimentos: Movimento[] = [];
  for (const f of fontes) {
    for (const m of f.movimentos ?? []) {
      if (!m.dataHora || !m.nome) continue;
      const complemento = m.complementosTabelados?.map((c) => c.nome ?? c.descricao).filter(Boolean).join(", ");
      const nome = complemento ? `${m.nome} (${complemento})` : m.nome;
      const chave = `${m.dataHora}|${nome}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      movimentos.push({ data: m.dataHora, nome });
    }
  }
  movimentos.sort((a, b) => b.data.localeCompare(a.data));

  return {
    tribunal: t.sigla,
    orgao: fontes[0].orgaoJulgador?.nome ?? null,
    classe: fontes[0].classe?.nome ?? null,
    movimentos: movimentos.slice(0, 15),
  };
}

/** Campos para gravar na tabela processos a partir do resumo. */
export function camposDoResumo(r: ResumoProcesso) {
  const ultima = r.movimentos[0];
  return {
    tribunal: r.tribunal,
    vara: r.orgao,
    classe: r.classe,
    movimentos: r.movimentos,
    ultima_movimentacao: ultima?.nome ?? null,
    ultima_movimentacao_em: ultima ? ultima.data.slice(0, 10) : null,
    sincronizado_em: new Date().toISOString(),
  };
}

/** Números de processo (formato CNJ, com ou sem pontuação) que aparecem num texto, já conferidos pelos dígitos verificadores. */
export function numerosCNJNoTexto(texto: string): string[] {
  const achados = new Set<string>();
  const padrao = /(?<!\d)(\d{7})[-._ ]?(\d{2})[-._ ]?(\d{4})[-._ ]?(\d)[-._ ]?(\d{2})[-._ ]?(\d{4})(?!\d)/g;
  for (const m of texto.matchAll(padrao)) {
    const d = m.slice(1, 7).join("");
    if (validarCNJ(d)) achados.add(d);
  }
  return [...achados];
}
