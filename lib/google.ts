import { supabaseAdmin } from "@/lib/supabase/admin";

// Acesso ao Google Drive e ao Google Agenda em nome da conta Google do escritório.
// A autorização (refresh token) fica na tabela google_conexao, que só o servidor lê.

export const GOOGLE_ESCOPOS = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar.events",
];

const PASTA = "application/vnd.google-apps.folder";
const TZ = "America/Sao_Paulo";

export function googleConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SUPABASE_SECRET_KEY);
}

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export async function trocarCodigo(code: string, redirectUri: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Google recusou a autorização (${r.status}).`);
  return (await r.json()) as { access_token: string; refresh_token?: string; id_token?: string };
}

/** Token de acesso válido, ou null se o Google não estiver conectado. */
export async function tokenDeAcesso(): Promise<string | null> {
  if (!googleConfigurado()) return null;
  const { data } = await supabaseAdmin().from("google_conexao").select("refresh_token").eq("id", 1).maybeSingle();
  if (!data?.refresh_token) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return ((await r.json()) as { access_token: string }).access_token;
}

async function google<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Google respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

// ------------------------------------------------------------------ Drive
export type Pasta = { id: string; name: string; webViewLink?: string };
const aspas = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function listarPastas(token: string, paiId: string): Promise<Pasta[]> {
  const q = `mimeType = '${PASTA}' and trashed = false and '${aspas(paiId)}' in parents`;
  const pastas: Pasta[] = [];
  let pagina: string | undefined;
  do {
    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.searchParams.set("q", q);
    u.searchParams.set("fields", "nextPageToken, files(id, name, webViewLink)");
    u.searchParams.set("pageSize", "1000");
    if (pagina) u.searchParams.set("pageToken", pagina);
    const j = await google<{ files: Pasta[]; nextPageToken?: string }>(token, u.toString());
    pastas.push(...j.files);
    pagina = j.nextPageToken;
  } while (pagina);
  return pastas;
}

export async function criarPasta(token: string, nome: string, paiId: string): Promise<Pasta> {
  return google<Pasta>(token, "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
    method: "POST",
    body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [paiId] }),
  });
}

/** Nomes de todos os arquivos da pasta e das subpastas (até `fundo` níveis). */
export async function listarNomesDeArquivos(token: string, paiId: string, fundo = 2): Promise<string[]> {
  const nomes: string[] = [];
  let pagina: string | undefined;
  const subpastas: string[] = [];
  do {
    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.searchParams.set("q", `'${aspas(paiId)}' in parents and trashed = false`);
    u.searchParams.set("fields", "nextPageToken, files(id, name, mimeType)");
    u.searchParams.set("pageSize", "1000");
    if (pagina) u.searchParams.set("pageToken", pagina);
    const j = await google<{ files: { id: string; name: string; mimeType: string }[]; nextPageToken?: string }>(token, u.toString());
    for (const f of j.files) {
      nomes.push(f.name);
      if (f.mimeType === PASTA) subpastas.push(f.id);
    }
    pagina = j.nextPageToken;
  } while (pagina);
  if (fundo > 0) for (const id of subpastas) nomes.push(...(await listarNomesDeArquivos(token, id, fundo - 1)));
  return nomes;
}

/** Acha a subpasta pelo nome (sem diferenciar acentos e maiúsculas) ou cria. */
export async function obterOuCriarPasta(token: string, nome: string, paiId: string): Promise<Pasta> {
  const alvo = normalizar(nome);
  const existente = (await listarPastas(token, paiId)).find((p) => normalizar(p.name) === alvo);
  return existente ?? criarPasta(token, nome, paiId);
}

/** Procura "Goularte Filho › Clientes" no Meu Drive. */
export async function procurarPastaClientes(token: string): Promise<(Pasta & { caminho: string }) | null> {
  const raiz = await listarPastas(token, "root");
  for (const escritorio of raiz.filter((p) => normalizar(p.name).includes("GOULARTE"))) {
    const clientes = (await listarPastas(token, escritorio.id)).find((p) => normalizar(p.name) === "CLIENTES");
    if (clientes) return { ...clientes, caminho: `${escritorio.name} › ${clientes.name}` };
  }
  return null;
}

/** Grava um arquivo (conteúdo em base64) dentro da pasta indicada. Com `converterPara`, o Drive converte (ex.: HTML em Google Docs). */
export async function enviarArquivo(
  token: string,
  arq: { nome: string; mimetype: string; base64: string; paiId: string; converterPara?: string },
): Promise<{ id: string; webViewLink?: string }> {
  const limite = "orion" + Math.random().toString(36).slice(2);
  const corpo = Buffer.concat([
    Buffer.from(
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: arq.nome, parents: [arq.paiId], ...(arq.converterPara ? { mimeType: arq.converterPara } : {}) }) +
        `\r\n--${limite}\r\nContent-Type: ${arq.mimetype}\r\n\r\n`,
    ),
    Buffer.from(arq.base64, "base64"),
    Buffer.from(`\r\n--${limite}--`),
  ]);
  return google(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${limite}` },
    body: corpo,
  });
}

// ------------------------------------------------------------------ Agenda
export async function criarEvento(
  token: string,
  ev: { titulo: string; inicio: string; fim: string; local?: string; descricao?: string },
): Promise<{ id: string }> {
  return google<{ id: string }>(token, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify({
      summary: ev.titulo,
      location: ev.local,
      description: ev.descricao,
      start: { dateTime: ev.inicio, timeZone: TZ },
      end: { dateTime: ev.fim, timeZone: TZ },
    }),
  });
}

export async function excluirEvento(token: string, id: string) {
  await google(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
