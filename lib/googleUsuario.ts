import type { SupabaseClient } from "@supabase/supabase-js";
import { atualizarEvento, criarEvento, excluirEvento, googleConfigurado } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Conta Google de cada pessoa da equipe, ligada em Meu perfil:
// - Agenda: audiências e compromissos de quem vai entram na agenda dela; o Calendário mostra os eventos dela.
// - Gmail: o Órion lê os e-mails do Recorte Digital da OAB/ES que chegam nesse Gmail (só leitura).
// A autorização fica na tabela google_usuarios, que só o servidor lê.

export type Recurso = "agenda" | "gmail";

export const ESCOPOS: Record<Recurso, string> = {
  agenda: "https://www.googleapis.com/auth/calendar.events",
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
};

export type ConexaoUsuario = { perfil_id: string; email: string | null; agenda: boolean; gmail: boolean; conectado_em: string; gmail_lido_em: string | null };

/** O que a pessoa ligou (sem o token). */
export async function conexaoDoUsuario(perfilId: string): Promise<ConexaoUsuario | null> {
  if (!googleConfigurado()) return null;
  const { data } = await supabaseAdmin().from("google_usuarios").select("perfil_id, email, agenda, gmail, conectado_em, gmail_lido_em").eq("perfil_id", perfilId).maybeSingle();
  return (data as ConexaoUsuario | null) ?? null;
}

/** Token de acesso da pessoa para o recurso pedido, ou null se ela não ligou (ou se o Google revogou). */
export async function tokenDoUsuario(perfilId: string, recurso: Recurso): Promise<string | null> {
  if (!googleConfigurado()) return null;
  const { data } = await supabaseAdmin().from("google_usuarios").select("refresh_token, agenda, gmail").eq("perfil_id", perfilId).maybeSingle();
  if (!data?.refresh_token || !data[recurso]) return null;
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

async function chamar<T>(token: string, url: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`Google respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

// ------------------------------------------------------------------ Agenda de quem vai

/** E-mail da conta Google do escritório (para não duplicar o evento na mesma agenda). */
async function emailDoEscritorio() {
  const { data } = await supabaseAdmin().from("google_conexao").select("email").eq("id", 1).maybeSingle();
  return data?.email?.toLowerCase() ?? null;
}

type EventoGoogle = { titulo: string; inicio: string; fim: string; local?: string; descricao?: string };

/**
 * Mantém uma cópia do evento na agenda Google de quem vai (responsável), se a pessoa ligou a Agenda.
 * Troca de responsável: apaga da agenda antiga e cria na nova. ev = null apaga (evento excluído).
 * Nunca derruba a ação principal: falhas do Google são ignoradas.
 */
export async function espelharNaAgendaDeQuemVai(
  db: SupabaseClient,
  tabela: "audiencias" | "compromissos",
  id: string,
  responsavelId: string | null,
  ev: EventoGoogle | null,
  anterior?: { google_event_resp: string | null; google_resp_id: string | null } | null,
) {
  try {
    if (!googleConfigurado()) return;
    const antes = anterior ?? (await db.from(tabela).select("google_event_resp, google_resp_id").eq("id", id).maybeSingle()).data;
    const escritorio = await emailDoEscritorio();
    const destino = ev && responsavelId ? await conexaoDoUsuario(responsavelId) : null;
    const usaDestino = Boolean(destino?.agenda && destino.email?.toLowerCase() !== escritorio);

    // Saiu da agenda de alguém (excluído, trocou de responsável ou a pessoa desligou)
    if (antes?.google_event_resp && antes.google_resp_id && (!usaDestino || antes.google_resp_id !== responsavelId)) {
      const t = await tokenDoUsuario(antes.google_resp_id, "agenda");
      if (t) await excluirEvento(t, antes.google_event_resp).catch(() => null);
      if (ev) await db.from(tabela).update({ google_event_resp: null, google_resp_id: null }).eq("id", id);
    }
    if (!ev || !usaDestino || !responsavelId) return;

    const token = await tokenDoUsuario(responsavelId, "agenda");
    if (!token) return;
    if (antes?.google_event_resp && antes.google_resp_id === responsavelId) {
      try {
        await atualizarEvento(token, antes.google_event_resp, ev);
        return;
      } catch {
        // apagado direto na agenda da pessoa: cria de novo
      }
    }
    const novo = await criarEvento(token, ev);
    await db.from(tabela).update({ google_event_resp: novo.id, google_resp_id: responsavelId }).eq("id", id);
  } catch {
    // a agenda pessoal é um extra: não atrapalha salvar
  }
}

/** Eventos da agenda Google da pessoa no período (para o Calendário do Órion). Os criados pelo Órion ficam de fora. */
export async function eventosDaAgendaDoUsuario(perfilId: string, de: string, ate: string) {
  const token = await tokenDoUsuario(perfilId, "agenda").catch(() => null);
  if (!token) return null;
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", new Date(`${de}T00:00:00-03:00`).toISOString());
  url.searchParams.set("timeMax", new Date(`${ate}T23:59:59-03:00`).toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "500");
  type Ev = { id: string; summary?: string; description?: string; location?: string; status?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
  try {
    const r = await chamar<{ items?: Ev[] }>(token, url.toString());
    return (r.items ?? []).filter((e) => e.status !== "cancelled" && !(e.description ?? "").includes("Órion CRM"));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Gmail (Recorte Digital)

type Parte = { mimeType?: string; headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: Parte[] };
type Mensagem = { id: string; internalDate?: string; payload?: Parte };

/** HTML do e-mail, decodificado no charset que ele declara (o Recorte manda em ISO-8859-1). */
function htmlDaMensagem(p?: Parte): string | null {
  if (!p) return null;
  if (p.mimeType === "text/html" && p.body?.data) {
    const tipo = p.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
    const charset = /charset="?([\w-]+)/i.exec(tipo)?.[1]?.toLowerCase() ?? "utf-8";
    const bytes = Buffer.from(p.body.data, "base64url");
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return bytes.toString("utf8");
    }
  }
  for (const f of p.parts ?? []) {
    const h = htmlDaMensagem(f);
    if (h) return h;
  }
  return null;
}

/** E-mails do Recorte dos últimos dias que ainda não foram levados (assunto, data e HTML de cada um). */
export async function emailsDoRecorte(perfilId: string, jaLidos: Set<string>) {
  const token = await tokenDoUsuario(perfilId, "gmail");
  if (!token) return null;
  const busca = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  busca.searchParams.set("q", 'from:oabes@recortedigital.adv.br subject:"Public." newer_than:15d');
  busca.searchParams.set("maxResults", "50");
  const lista = await chamar<{ messages?: { id: string }[] }>(token, busca.toString());
  const novos = (lista.messages ?? []).filter((m) => !jaLidos.has(m.id));
  const emails: { id: string; assunto: string; data: string; html: string }[] = [];
  for (const m of novos.reverse()) {
    const msg = await chamar<Mensagem>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`);
    const html = htmlDaMensagem(msg.payload);
    const assunto = msg.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
    if (html) emails.push({ id: m.id, assunto, data: new Date(Number(msg.internalDate ?? Date.now())).toISOString(), html });
  }
  return emails;
}
