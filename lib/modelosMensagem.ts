import type { SupabaseClient } from "@supabase/supabase-js";
import { primeiroNome } from "@/lib/rotulos";

// Modelos de mensagem programada (aba Modelos em "Mensagens agendadas").
// Cada modelo sabe quando sai: X dias antes/depois da audiência, X dias depois de hoje, ou quando a pessoa escolher.
// Este arquivo também roda no navegador (prévia e "Usar modelo"): nada de servidor aqui.

export type Gatilho = "antes_audiencia" | "depois_audiencia" | "depois_de_hoje" | "livre";

export type ModeloMensagem = {
  id: string;
  nome: string;
  texto: string;
  gatilho: Gatilho;
  dias: number;
  hora: string; // "10:00"
  marcado: boolean; // já vem marcado no formulário de audiência
  cancelar_se_responder: boolean;
  ordem: number;
};

export const GATILHOS: { id: Gatilho; rotulo: string }[] = [
  { id: "antes_audiencia", rotulo: "dias antes da audiência" },
  { id: "depois_audiencia", rotulo: "dias depois da audiência" },
  { id: "depois_de_hoje", rotulo: "dias depois de hoje" },
  { id: "livre", rotulo: "quando eu escolher" },
];

export const ehDeAudiencia = (g: Gatilho) => g === "antes_audiencia" || g === "depois_audiencia";

export const CAMPOS_MENSAGEM: { campo: string; ajuda: string }[] = [
  { campo: "{nome}", ajuda: "primeiro nome do cliente" },
  { campo: "{tipo_audiencia}", ajuda: "ex.: conciliação" },
  { campo: "{data_audiencia}", ajuda: "ex.: 24/10" },
  { campo: "{dia_semana}", ajuda: "ex.: sexta-feira" },
  { campo: "{hora_audiencia}", ajuda: "ex.: 14:30" },
  { campo: "{local}", ajuda: "vara ou sala; “por vídeo” quando for online" },
  { campo: "{processo}", ajuda: "número do processo" },
];

const ASSINATURA = "\nGoularte Filho Advocacia";

/** Modelos que vêm de fábrica; valem enquanto o script 013 não foi rodado. */
export const MODELOS_MENSAGEM_PADRAO: ModeloMensagem[] = [
  {
    id: "padrao-pre-audiencia",
    nome: "Pré-audiência: orientações",
    gatilho: "antes_audiencia",
    dias: 5,
    hora: "10:00",
    marcado: false,
    cancelar_se_responder: false,
    ordem: 10,
    texto:
      "Olá, {nome}! A sua audiência de {tipo_audiencia} está marcada para {dia_semana}, {data_audiencia}, às {hora_audiencia}. Local: {local}.\n\n" +
      "Algumas orientações:\n• Leve um documento oficial com foto.\n• Use roupa discreta (evite bermuda, chinelo e boné).\n" +
      "• Se tiver testemunhas, avise a gente e confirme que elas poderão ir.\n• Chegue com 30 minutos de antecedência.\n\n" +
      "Qualquer dúvida, é só responder aqui." + ASSINATURA,
  },
  {
    id: "padrao-3-dias",
    nome: "Lembrete 3 dias antes",
    gatilho: "antes_audiencia",
    dias: 3,
    hora: "10:00",
    marcado: true,
    cancelar_se_responder: false,
    ordem: 20,
    texto:
      "Olá, {nome}! Passando para lembrar que a sua audiência de {tipo_audiencia} é na {dia_semana}, {data_audiencia}, às {hora_audiencia}. Local: {local}. " +
      "Se tiver algum documento ou testemunha para a audiência, fale com a gente por aqui até a véspera." + ASSINATURA,
  },
  {
    id: "padrao-confirmacao",
    nome: "Confirmação de presença",
    gatilho: "antes_audiencia",
    dias: 2,
    hora: "10:00",
    marcado: false,
    cancelar_se_responder: false,
    ordem: 30,
    texto: "Olá, {nome}! Você confirma presença na audiência de {data_audiencia}, às {hora_audiencia}? Responda SIM para confirmar." + ASSINATURA,
  },
  {
    id: "padrao-vespera",
    nome: "Lembrete na véspera",
    gatilho: "antes_audiencia",
    dias: 1,
    hora: "18:00",
    marcado: true,
    cancelar_se_responder: false,
    ordem: 40,
    texto:
      "Olá, {nome}! Passando para lembrar da sua audiência de {tipo_audiencia} amanhã, {data_audiencia}, às {hora_audiencia}. Local: {local}. " +
      "Chegue com 30 minutos de antecedência e leve um documento com foto. Qualquer dúvida, é só responder aqui." + ASSINATURA,
  },
  {
    id: "padrao-pos-audiencia",
    nome: "Pós-audiência",
    gatilho: "depois_audiencia",
    dias: 1,
    hora: "10:00",
    marcado: false,
    cancelar_se_responder: false,
    ordem: 50,
    texto: "Olá, {nome}! Obrigado por comparecer à audiência. Assim que sair a decisão ou houver novidade no processo, avisamos por aqui." + ASSINATURA,
  },
  {
    id: "padrao-documentos",
    nome: "Cobrança de documentos",
    gatilho: "depois_de_hoje",
    dias: 3,
    hora: "10:00",
    marcado: false,
    cancelar_se_responder: true,
    ordem: 60,
    texto: "Olá, {nome}! Tudo bem? Ainda estamos aguardando os documentos para dar andamento ao seu caso. Pode enviar por aqui mesmo, foto serve." + ASSINATURA,
  },
];

export type DadosAudiencia = { inicio: string; tipo: string; local: string | null; modalidade: string; processo: string | null };

const TZ = "America/Sao_Paulo";

/** Troca os campos do texto pelos dados do cliente e da audiência. */
export function preencherMensagem(texto: string, nome: string, aud?: DadosAudiencia | null) {
  let t = texto.replace(/\{nome\}/g, nome ? primeiroNome(nome) : "{nome}");
  if (aud) {
    const d = new Date(aud.inicio);
    const valores: Record<string, string> = {
      tipo_audiencia: aud.tipo.toLowerCase(),
      data_audiencia: d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }),
      dia_semana: d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long" }),
      hora_audiencia: d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }),
      local: aud.local || (aud.modalidade === "video" ? "por vídeo (o link foi enviado)" : "a confirmar"),
      processo: aud.processo ?? "",
    };
    t = t.replace(/\{(tipo_audiencia|data_audiencia|dia_semana|hora_audiencia|local|processo)\}/g, (_, k: string) => valores[k]);
  }
  return t;
}

/** Dia (AAAA-MM-DD) e hora de envio pelo gatilho do modelo; null quando não dá para calcular. */
export function quandoEnviar(m: Pick<ModeloMensagem, "gatilho" | "dias" | "hora">, audInicio?: string | null): { data: string; hora: string } | null {
  const base =
    m.gatilho === "depois_de_hoje" ? Date.now() : ehDeAudiencia(m.gatilho) && audInicio ? new Date(audInicio).getTime() : null;
  if (base === null) return null;
  const sinal = m.gatilho === "antes_audiencia" ? -1 : 1;
  const dia = new Date(base + sinal * m.dias * 86_400_000).toLocaleDateString("sv-SE", { timeZone: TZ });
  return { data: dia, hora: m.hora };
}

/** Lê os modelos do banco; sem a tabela (script 013), usa os de fábrica. */
export async function lerModelosMensagem(db: SupabaseClient): Promise<{ modelos: ModeloMensagem[]; tabela: boolean }> {
  const { data, error } = await db
    .from("modelos_mensagem")
    .select("id, nome, texto, gatilho, dias, hora, marcado, cancelar_se_responder, ordem")
    .order("ordem")
    .order("nome");
  if (error) return { modelos: MODELOS_MENSAGEM_PADRAO, tabela: false };
  return { modelos: (data ?? []) as ModeloMensagem[], tabela: true };
}
