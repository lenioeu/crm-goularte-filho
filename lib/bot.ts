import type { SupabaseClient } from "@supabase/supabase-js";
import { TZ } from "@/lib/rotulos";

// Regras da triagem automática do WhatsApp, editáveis na página "Atendimento automático".
// Ficam em configuracoes.whatsapp_bot_config; o que não foi salvo usa o padrão abaixo.

export type ConfigBot = {
  modo: "sempre" | "fora" | "desligado"; // sempre responde, só fora do expediente, ou nunca
  dias: number[]; // 0 = domingo … 6 = sábado
  inicio: string; // "08:00"
  fim: string; // "18:00"
  saudacao: string;
  encaminhado: string;
  outro: string;
  foraExpediente: string;
  avisarForaSempre: boolean; // fora do expediente, avisa também quem já é cliente
  tentativas: number;
  areasMenu: string[] | null; // null = todas as áreas ativas
};

export const BOT_PADRAO: ConfigBot = {
  modo: "sempre",
  dias: [1, 2, 3, 4, 5],
  inicio: "08:00",
  fim: "18:00",
  saudacao:
    "Olá, {nome}! Você está falando com o escritório Goularte Filho Advocacia.\n\nPara direcionar seu atendimento, responda com o número do assunto:\n{menu}",
  encaminhado: "Obrigado! Seu atendimento foi encaminhado para a área {area}.\n\nPara adiantar, se tiver, envie por aqui: {documentos}.\n\nEm breve uma pessoa da equipe responde.",
  outro: "Certo! Em breve uma pessoa da equipe responde por aqui.",
  foraExpediente: "Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Recebemos sua mensagem e respondemos assim que possível.",
  avisarForaSempre: false,
  tentativas: 2,
  areasMenu: null,
};

/** Respostas rápidas de fábrica, usadas enquanto a equipe não salvar as suas em "Atendimento automático". */
export const RESPOSTAS_PADRAO = [
  { atalho: "ola", texto: "Olá, {nome}! Tudo bem? Aqui é do escritório Goularte Filho Advocacia." },
  { atalho: "docs", texto: "{nome}, para darmos andamento, envie por aqui foto do RG ou CNH, CPF e comprovante de residência." },
  { atalho: "aguarde", texto: "Recebido, {nome}! Vou verificar e já retorno." },
  { atalho: "andamento", texto: "{nome}, seu processo segue em andamento. Assim que houver novidade, avisamos por aqui." },
  { atalho: "obrigado", texto: "Obrigado pelo contato, {nome}! Qualquer dúvida, é só chamar." },
];

export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export async function lerConfigBot(db: SupabaseClient): Promise<ConfigBot> {
  const { data } = await db.from("configuracoes").select("chave, valor").in("chave", ["whatsapp_bot_config", "whatsapp_bot"]);
  const salvo = (data?.find((c) => c.chave === "whatsapp_bot_config")?.valor ?? {}) as Partial<ConfigBot>;
  const cfg = { ...BOT_PADRAO, ...salvo };
  // Chave antiga (liga/desliga de Integrações)
  if (!data?.some((c) => c.chave === "whatsapp_bot_config") && data?.find((c) => c.chave === "whatsapp_bot")?.valor === false) cfg.modo = "desligado";
  return cfg;
}

/** Está dentro do horário de expediente agora (horário de Brasília)? */
export function dentroDoExpediente(cfg: ConfigBot, quando = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(quando).map((p) => [p.type, p.value]),
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.weekday);
  const hm = `${partes.hour}:${partes.minute}`;
  return cfg.dias.includes(dia) && hm >= cfg.inicio && hm < cfg.fim;
}

/** Troca {nome}, {area}, {documentos}, {menu}; tira a linha de {documentos} quando a área não tem lista. */
export function montarTexto(modelo: string, v: { nome?: string; area?: string; documentos?: string | null; menu?: string }) {
  let t = modelo;
  if (!v.documentos) t = t.split("\n").filter((l) => !l.includes("{documentos}")).join("\n");
  t = t
    .replace(/\{nome\}/g, v.nome ?? "")
    .replace(/\{area\}/g, v.area ?? "")
    .replace(/\{documentos\}/g, (v.documentos ?? "").replace(/\.$/, ""))
    .replace(/\{menu\}/g, v.menu ?? "");
  return t
    .replace(/,\s*([!?.])/g, "$1") // "Olá, !" quando não sabemos o nome
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
