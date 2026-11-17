import { createHash } from "node:crypto";

// Leitura do e-mail diário do Recorte Digital da OAB/ES (feito pela WEBJUR).
// Cada publicação vem entre os comentários <!--Inicio publicacao;;Processo:NNN--> e <!--Fim publicacao;;Processo:...-->,
// com rótulos fixos (Data de Disponibilização, Data de Publicação, Jornal, Caderno, Local/Tribunal/Vara, Página) e o texto.

export type TipoPublicacao = "intimacao" | "audiencia" | "distribuicao" | "outro";

export type PublicacaoLida = {
  chave: string; // impressão digital, para não importar a mesma publicação duas vezes
  numeroCnj: string | null; // 0000000-00.0000.0.00.0000
  disponibilizacao: string | null; // AAAA-MM-DD
  publicacao: string | null; // AAAA-MM-DD
  jornal: string | null;
  caderno: string | null;
  orgao: string | null; // vara, gabinete, tribunal
  texto: string;
  link: string | null;
  tipo: TipoPublicacao;
  audiencia: { data: string; hora: string } | null; // quando o texto marca ou remarca audiência
};

const ENTIDADES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", sect: "§" };

function semHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : ENTIDADES[e.toLowerCase()] ?? m))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const dataIso = (br: string | undefined | null) => {
  const m = br?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export function formatarCnj(digitos: string) {
  const d = digitos.replace(/\D/g, "");
  if (d.length !== 20) return null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

/** Que tipo de publicação é, pelo começo do texto. */
function classificar(texto: string): TipoPublicacao {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/audiencia[^.]{0,80}(designada|redesignada|remarcada|marcada|agendada)|(designo|redesigno)[^.]{0,40}audiencia/.test(t)) return "audiencia";
  if (/^(lista de distribuicao|distribuicao)|processos (protocolados|distribuidos)|lista de processos distribuidos/.test(t.slice(0, 400))) return "distribuicao";
  if (/intimacao|intima-se|intimem-se|decisao|despacho|sentenca|acordao|prazo/.test(t)) return "intimacao";
  return "outro";
}

/** Dia e hora da audiência citada no texto ("... audiência foi redesignada para o dia 01/12/2026 às 14:30"). */
function audienciaNoTexto(texto: string) {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = t.match(/audiencia[^]{0,160}?(\d{2}\/\d{2}\/\d{4})[^\d]{0,20}(\d{1,2})[:h](\d{2})/i);
  if (!m) return null;
  const data = dataIso(m[1]);
  return data ? { data, hora: `${m[2].padStart(2, "0")}:${m[3]}` } : null;
}

/** Separa as publicações de um e-mail do Recorte Digital. Lista vazia quando o dia não teve publicação. */
export function lerEmailRecorte(html: string): PublicacaoLida[] {
  const lidas: PublicacaoLida[] = [];
  const re = /<!--\s*Inicio publicacao;;Processo:([^>]*?)-->([\s\S]*?)<!--\s*Fim publicacao;;Processo:([^>]*?)-->/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const corpo = semHtml(m[2]);
    const linhas = corpo.split("\n");
    // Valor de um rótulo: o resto da linha ou, se vier vazio ("Jornal:" sozinho), a linha de baixo
    const campo = (rotulo: string) => {
      const i = linhas.findIndex((x) => x.toLowerCase().startsWith(rotulo.toLowerCase()));
      if (i < 0) return null;
      const l = linhas[i];
      const resto = l.includes(":") ? l.slice(l.indexOf(":") + 1).trim() : "";
      return resto || linhas[i + 1]?.trim() || null;
    };
    // O texto começa depois da linha "Página:"
    const iPagina = linhas.findIndex((x) => /^p[aá]gina\s*:/i.test(x));
    const texto = linhas
      .slice(iPagina >= 0 ? iPagina + 1 : 0)
      .filter((x) => !/^publica[cç][aã]o\s*:\s*\d+/i.test(x))
      .join("\n")
      .trim();
    const numeroCnj = formatarCnj(m[3]) ?? formatarCnj(m[1]);
    const orgao = [campo("Tribunal:"), campo("Vara:"), campo("Local:")].filter(Boolean).join(" · ") || linhas[iPagina - 1]?.trim() || null;
    // O link às vezes vem quebrado em duas linhas: junta o trecho entre "Acesso ao documento:" e "Identificador"
    const trechoLink = texto.match(/Acesso ao documento:\s*([\s\S]{8,600}?)(?:\s+Identificador|$)/i)?.[1]?.replace(/\s+/g, "");
    const link = trechoLink?.match(/^https?:\/\/\S+/)?.[0]?.replace(/[.,;]+$/, "") ?? texto.match(/https?:\/\/pje[^\s]+/i)?.[0] ?? null;
    const disponibilizacao = dataIso(campo("Data de Disponibiliza"));
    const tipo = classificar(texto);
    lidas.push({
      chave: createHash("sha256").update(`${numeroCnj ?? m[1]}|${disponibilizacao}|${texto.slice(0, 2000)}`).digest("hex").slice(0, 40),
      numeroCnj,
      disponibilizacao,
      publicacao: dataIso(campo("Data de Publica")),
      jornal: campo("Jornal:"),
      caderno: campo("Caderno:"),
      orgao,
      texto,
      link,
      tipo,
      audiencia: tipo === "audiencia" ? audienciaNoTexto(texto) : null,
    });
  }
  return lidas;
}

/** Senha que o script do Gmail manda no cabeçalho x-orion-token (derivada do CRON_SECRET da Vercel). */
export function tokenRecorte() {
  const base = process.env.CRON_SECRET;
  return base ? createHash("sha256").update(`recorte:${base}`).digest("hex") : null;
}

/** Dia do diário a que o e-mail se refere, pelo assunto ("Public. 4. DJES 17/11/26, DJU 16/11/26 ..."). */
export function diaDoAssunto(assunto: string, recebidoEm: Date) {
  const m = assunto.match(/DJES\s+(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`;
  return recebidoEm.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
