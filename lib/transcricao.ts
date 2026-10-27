import type { SupabaseClient } from "@supabase/supabase-js";
import { baixarMidia } from "@/lib/whatsapp";

// Transcrição dos áudios do WhatsApp pelo Groq (Whisper). Chave na Vercel: GROQ_API_KEY.
const URL_GROQ = process.env.GROQ_URL_TESTE || "https://api.groq.com/openai/v1/audio/transcriptions";
const MODELO = process.env.GROQ_MODELO_AUDIO || "whisper-large-v3-turbo";
const LIMITE_MB = 25; // limite do Groq por arquivo

/** A chave do Groq começa com "gsk_"; ignora o que vier colado junto (espaços, aspas, "›"…). */
function chaveGroq() {
  const bruta = process.env.GROQ_API_KEY ?? "";
  return bruta.match(/gsk_[A-Za-z0-9]+/)?.[0] ?? bruta.replace(/[^\x21-\x7e]/g, "");
}

export const transcricaoConfigurada = () => Boolean(chaveGroq());

const EXTENSAO: Record<string, string> = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "audio/wav": "wav", "video/mp4": "mp4" };

/** Manda o áudio (base64) para o Groq e devolve o texto. */
export async function transcrever(base64: string, mimetype = "audio/ogg"): Promise<string> {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > LIMITE_MB * 1048576) throw new Error(`áudio maior que ${LIMITE_MB} MB`);
  const tipo = mimetype.split(";")[0];
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: tipo }), `audio.${EXTENSAO[tipo] ?? "ogg"}`);
  form.append("model", MODELO);
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("temperature", "0");
  const r = await fetch(URL_GROQ, {
    method: "POST",
    headers: { Authorization: `Bearer ${chaveGroq()}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (r.status === 401) throw new Error("O Groq recusou a chave. Confira a GROQ_API_KEY na Vercel (só a chave, começando com gsk_) e faça um Redeploy.");
  if (!r.ok) throw new Error(`Groq respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { text?: string };
  return (j.text ?? "").trim();
}

/**
 * Transcreve o áudio de uma mensagem e grava em mensagens.transcricao (script 016).
 * Devolve o texto, ou lança o erro (o botão "Transcrever" mostra o motivo).
 */
export async function transcreverMensagem(db: SupabaseClient, filtro: { id?: string; whatsappId?: string }): Promise<string> {
  if (!transcricaoConfigurada()) throw new Error("Falta a chave GROQ_API_KEY na Vercel.");
  const q = db.from("mensagens").select("id, whatsapp_id, midia_tipo");
  const { data: m } = await (filtro.id ? q.eq("id", filtro.id) : q.eq("whatsapp_id", filtro.whatsappId!)).maybeSingle();
  if (!m?.whatsapp_id || m.midia_tipo !== "audio") throw new Error("Esta mensagem não é um áudio do WhatsApp.");
  const arq = await baixarMidia(m.whatsapp_id);
  const texto = (await transcrever(arq.base64, arq.mimetype)) || "(áudio sem fala)";
  const { error } = await db.from("mensagens").update({ transcricao: texto }).eq("id", m.id);
  if (error) throw new Error(/transcricao|column|schema cache/i.test(error.message) ? "Falta rodar o script supabase/016_transcricao_audio.sql no Supabase." : error.message);
  return texto;
}
