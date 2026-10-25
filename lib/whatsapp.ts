import { createHash } from "node:crypto";

// Conversa com o Evolution API (WhatsApp do escritório, no servidor da Oracle).
// Endereços conferidos no código da versão 2.3.7.

export const INSTANCIA = process.env.EVOLUTION_INSTANCIA || "escritorio";
const URL_BASE = (process.env.EVOLUTION_URL ?? "").replace(/\/+$/, "");

export function whatsappConfigurado() {
  return Boolean(URL_BASE && process.env.EVOLUTION_API_KEY && process.env.SUPABASE_SECRET_KEY);
}

/** Senha que o Evolution manda em cada aviso ao CRM; derivada da chave da API, sem variável extra. */
export function tokenWebhook() {
  return createHash("sha256").update(`webhook:${process.env.EVOLUTION_API_KEY ?? ""}`).digest("hex");
}

async function evo<T>(caminho: string, init?: RequestInit, segundos = 20): Promise<T> {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    ...init,
    headers: { apikey: process.env.EVOLUTION_API_KEY ?? "", "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(segundos * 1000),
  });
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 300);
    throw new Error(`WhatsApp respondeu ${r.status}${corpo ? `: ${corpo}` : ""}`);
  }
  return (await r.json()) as T;
}

// ------------------------------------------------------------------ Números
const digitos = (s: string) => s.replace(/\D/g, "");

/** Número no formato do WhatsApp: 55 + DDD + número. */
export function numeroWhatsApp(telefone: string) {
  const d = digitos(telefone);
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/** Chave para comparar números: DDD + últimos 8 dígitos (resolve o "9" a mais ou a menos). */
export function chaveTelefone(telefone: string) {
  let d = digitos(telefone);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d;
}

export const numeroDoJid = (jid: string) => digitos(jid.split("@")[0]);

// ------------------------------------------------------------------ Conexão
export type Estado = "open" | "connecting" | "close" | "inexistente";

export async function estadoConexao(): Promise<Estado> {
  try {
    const r = await evo<{ instance?: { state?: Estado } }>(`/instance/connectionState/${INSTANCIA}`);
    return r.instance?.state ?? "close";
  } catch (e) {
    if (e instanceof Error && /\b404\b/.test(e.message)) return "inexistente";
    throw e;
  }
}

const EVENTOS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE", "MESSAGES_EDITED", "CONNECTION_UPDATE"];

function configWebhook(urlWebhook: string) {
  return { enabled: true, url: urlWebhook, headers: { "x-crm-token": tokenWebhook() }, byEvents: false, base64: false, events: EVENTOS };
}

/** Regrava o aviso de mensagens no Evolution (ex.: quando o CRM passa a ouvir um evento novo). */
export async function reaplicarWebhook(urlWebhook: string) {
  await evo(`/webhook/set/${INSTANCIA}`, { method: "POST", body: JSON.stringify({ webhook: configWebhook(urlWebhook) }) });
}

/** "messages.update": recibo de entrega/leitura de uma mensagem enviada pelo escritório. */
export function lerRecibo(data: unknown): { whatsappId: string; status: "enviada" | "entregue" | "lida" } | null {
  const d = data as { keyId?: string; fromMe?: boolean; status?: string };
  if (!d?.keyId || !d.fromMe) return null;
  const status = d.status === "READ" || d.status === "PLAYED" ? "lida" : d.status === "DELIVERY_ACK" ? "entregue" : d.status === "SERVER_ACK" ? "enviada" : null;
  return status ? { whatsappId: d.keyId, status } : null;
}

/** "messages.delete": alguém apagou uma mensagem "para todos" (o cliente ou o celular do escritório). */
export function lerApagada(data: unknown): { whatsappId: string; deMim: boolean } | null {
  // Dois formatos: a chave espalhada ({ id, fromMe, remoteJid }) ou a mensagem inteira ({ key: {...} })
  const d = data as { id?: string; fromMe?: boolean; key?: { id?: string; fromMe?: boolean } };
  const id = d?.key?.id ?? d?.id;
  return id ? { whatsappId: id, deMim: Boolean(d.key?.fromMe ?? d.fromMe) } : null;
}

/** "messages.edited": o cliente (ou o celular do escritório) editou uma mensagem. */
export function lerEdicao(data: unknown): { whatsappId: string; texto: string } | null {
  type Conteudo = { conversation?: string; extendedTextMessage?: { text?: string }; imageMessage?: { caption?: string }; videoMessage?: { caption?: string } };
  const d = data as { key?: { id?: string }; editedMessage?: Conteudo & { message?: Conteudo } };
  const e = d?.editedMessage?.message ?? d?.editedMessage;
  const texto = e?.conversation ?? e?.extendedTextMessage?.text ?? e?.imageMessage?.caption ?? e?.videoMessage?.caption ?? null;
  return d?.key?.id && texto ? { whatsappId: d.key.id, texto } : null;
}

const jidDe = (telefone: string) => `${numeroWhatsApp(telefone)}@s.whatsapp.net`;

/** Apaga para todos uma mensagem que o escritório mandou (o WhatsApp só deixa até uns 2 dias depois). */
export async function apagarParaTodos(telefone: string, whatsappId: string) {
  await evo(`/chat/deleteMessageForEveryone/${INSTANCIA}`, {
    method: "DELETE",
    body: JSON.stringify({ id: whatsappId, fromMe: true, remoteJid: jidDe(telefone) }),
  });
}

/** Edita o texto de uma mensagem que o escritório mandou (o WhatsApp só deixa nos primeiros 15 minutos). */
export async function editarNoWhatsApp(telefone: string, whatsappId: string, texto: string) {
  await evo(`/chat/updateMessage/${INSTANCIA}`, {
    method: "POST",
    body: JSON.stringify({ number: numeroWhatsApp(telefone), key: { id: whatsappId, remoteJid: jidDe(telefone), fromMe: true }, text: texto }),
  });
}

/** Cria a instância se precisar, liga o aviso de mensagens ao CRM e devolve o QR Code (imagem base64). */
export async function conectar(urlWebhook: string): Promise<string | null> {
  const webhook = configWebhook(urlWebhook);
  if ((await estadoConexao()) === "inexistente") {
    const r = await evo<{ qrcode?: { base64?: string } }>("/instance/create", {
      method: "POST",
      body: JSON.stringify({ instanceName: INSTANCIA, integration: "WHATSAPP-BAILEYS", qrcode: true, groupsIgnore: true, webhook }),
    });
    return r.qrcode?.base64 ?? null;
  }
  await evo(`/webhook/set/${INSTANCIA}`, { method: "POST", body: JSON.stringify({ webhook }) });
  const r = await evo<{ base64?: string }>(`/instance/connect/${INSTANCIA}`);
  return r.base64 ?? null;
}

export async function desconectar() {
  await evo(`/instance/logout/${INSTANCIA}`, { method: "DELETE" });
}

// ------------------------------------------------------------------ Mensagens
/** Envia texto e devolve o id da mensagem no WhatsApp. */
export async function enviarTexto(telefone: string, texto: string): Promise<string | null> {
  const r = await evo<{ key?: { id?: string } }>(`/message/sendText/${INSTANCIA}`, {
    method: "POST",
    body: JSON.stringify({ number: numeroWhatsApp(telefone), text: texto, delay: 1200 }),
  });
  return r.key?.id ?? null;
}

export type TipoMidia = "image" | "video" | "audio" | "document";

/** Tipo que o WhatsApp entende, pelo tipo do arquivo. */
export function tipoDoArquivo(mimetype: string): TipoMidia {
  if (mimetype.startsWith("image/") && !mimetype.includes("svg")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "document";
}

/** Envia foto, vídeo, áudio ou documento a partir de um link (o Evolution baixa e manda). */
export async function enviarMidia(telefone: string, m: { url: string; mimetype: string; nome: string; legenda?: string }): Promise<string | null> {
  const r = await evo<{ key?: { id?: string } }>(
    `/message/sendMedia/${INSTANCIA}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: numeroWhatsApp(telefone),
        mediatype: tipoDoArquivo(m.mimetype),
        mimetype: m.mimetype,
        media: m.url,
        fileName: m.nome,
        ...(m.legenda ? { caption: m.legenda } : {}),
      }),
    },
    90,
  );
  return r.key?.id ?? null;
}

/** Envia áudio gravado como mensagem de voz (o Evolution converte para o formato do WhatsApp). */
export async function enviarAudio(telefone: string, url: string): Promise<string | null> {
  const r = await evo<{ key?: { id?: string } }>(`/message/sendWhatsAppAudio/${INSTANCIA}`, { method: "POST", body: JSON.stringify({ number: numeroWhatsApp(telefone), audio: url }) }, 90);
  return r.key?.id ?? null;
}

/** Baixa o arquivo de uma mensagem recebida (documento, foto, áudio). */
export async function baixarMidia(whatsappId: string) {
  return evo<{ base64: string; mimetype?: string; fileName?: string }>(`/chat/getBase64FromMediaMessage/${INSTANCIA}`, {
    method: "POST",
    body: JSON.stringify({ message: { key: { id: whatsappId } }, convertToMp4: false }),
  }, 90);
}

// ------------------------------------------------------------------ Aviso recebido
export type MensagemRecebida = {
  whatsappId: string;
  numero: string;
  deMim: boolean;
  nomeContato: string | null;
  texto: string | null;
  midiaTipo: string | null;
  midiaNome: string | null;
  em: string;
};

const MIDIAS: Record<string, string> = {
  imageMessage: "imagem",
  documentMessage: "documento",
  documentWithCaptionMessage: "documento",
  audioMessage: "audio",
  videoMessage: "video",
  stickerMessage: "figurinha",
};

type Bruto = {
  key?: { id?: string; remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean };
  pushName?: string | null;
  messageType?: string;
  messageTimestamp?: number;
  message?: Record<string, { caption?: string; fileName?: string; text?: string; message?: Record<string, { caption?: string; fileName?: string }> }> & {
    conversation?: string;
  };
};

/** Traduz o "messages.upsert" do Evolution; null para grupos, status e o que não interessa. */
export function lerMensagem(data: unknown): MensagemRecebida | null {
  const m = data as Bruto;
  let jid = m?.key?.remoteJid ?? "";
  if (jid.endsWith("@lid") && m.key?.remoteJidAlt) jid = m.key.remoteJidAlt;
  if (!m?.key?.id || !jid.endsWith("@s.whatsapp.net")) return null;

  const tipo = m.messageType ?? "";
  const corpo = m.message ?? {};
  let conteudo = corpo[tipo] as { caption?: string; fileName?: string; text?: string } | undefined;
  if (tipo === "documentWithCaptionMessage") conteudo = corpo[tipo]?.message?.documentMessage;
  const texto = (typeof corpo.conversation === "string" ? corpo.conversation : null) ?? conteudo?.caption ?? conteudo?.text ?? null;
  const midiaTipo = MIDIAS[tipo] ?? null;
  if (!texto && !midiaTipo) return null; // reações, enquetes, mensagens apagadas…

  return {
    whatsappId: m.key.id,
    numero: numeroDoJid(jid),
    deMim: Boolean(m.key.fromMe),
    nomeContato: m.key.fromMe ? null : m.pushName ?? null,
    texto,
    midiaTipo,
    midiaNome: conteudo?.fileName ?? null,
    em: new Date((m.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString(),
  };
}
