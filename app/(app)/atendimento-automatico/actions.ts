"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { BOT_PADRAO, type ConfigBot, RESPOSTAS_PADRAO } from "@/lib/bot";
import { quemSou } from "@/lib/permissoes";

const SO_ADMIN = { erro: "Só o administrador altera o atendimento automático.", ok: null };
const hora = (v: FormDataEntryValue | null, padrao: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : padrao);

export async function salvarConfigBot(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador") return SO_ADMIN;
  const modo = String(f.get("modo") ?? "");
  const texto = (k: keyof ConfigBot) => String(f.get(k) ?? "").replace(/\r\n/g, "\n").trim() || (BOT_PADRAO[k] as string);
  const areas = f.getAll("areas").map(String);
  const todas = f.get("todas_areas") === "on";
  const cfg: ConfigBot = {
    modo: modo === "fora" || modo === "desligado" ? modo : "sempre",
    dias: f.getAll("dias").map(Number).filter((d) => d >= 0 && d <= 6),
    inicio: hora(f.get("inicio"), BOT_PADRAO.inicio),
    fim: hora(f.get("fim"), BOT_PADRAO.fim),
    saudacao: texto("saudacao"),
    encaminhado: texto("encaminhado"),
    outro: texto("outro"),
    foraExpediente: String(f.get("foraExpediente") ?? "").trim(),
    avisarForaSempre: f.get("avisarForaSempre") === "on",
    tentativas: Math.min(5, Math.max(1, Number(f.get("tentativas")) || BOT_PADRAO.tentativas)),
    areasMenu: todas ? null : areas,
  };
  if (cfg.inicio >= cfg.fim) return { erro: "O fim do expediente precisa ser depois do início.", ok: null };
  if (!todas && !areas.length) return { erro: "Escolha pelo menos uma área para o menu.", ok: null };
  const { error } = await supabase.from("configuracoes").upsert({ chave: "whatsapp_bot_config", valor: cfg });
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/atendimento-automatico");
  revalidatePath("/integracoes");
  return { erro: null, ok: "Atendimento automático salvo. Vale para as próximas mensagens." };
}

export type RespostaRapida = { atalho: string; texto: string };

const limpar = (r: RespostaRapida) => ({
  atalho: r.atalho.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^\/+/, "").replace(/[^a-z0-9_-]/g, ""),
  texto: r.texto.replace(/\r\n/g, "\n").trim(),
});

/** Acrescenta uma resposta pelo botão "Respostas" da conversa. Qualquer pessoa da equipe pode criar. */
export async function adicionarResposta(nova: RespostaRapida): Promise<Resultado> {
  const { papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const r = limpar(nova);
  if (!r.atalho) return { erro: "Dê um atalho, ex.: docs (letras e números, sem espaço).", ok: null };
  if (!r.texto) return { erro: "Escreva o texto da resposta.", ok: null };
  // configuracoes só aceita escrita do administrador (RLS): grava pela chave secreta
  const db = (await import("@/lib/supabase/admin")).supabaseAdmin();
  const { data } = await db.from("configuracoes").select("valor").eq("chave", "respostas_rapidas").maybeSingle();
  const atuais = (Array.isArray(data?.valor) ? data.valor : data ? [] : RESPOSTAS_PADRAO) as RespostaRapida[];
  if (atuais.some((x) => x.atalho === r.atalho)) return { erro: `Já existe a resposta /${r.atalho}. Escolha outro atalho.`, ok: null };
  const { error } = await db.from("configuracoes").upsert({ chave: "respostas_rapidas", valor: [...atuais, r] });
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/atendimento-automatico");
  revalidatePath("/atendimento");
  return { erro: null, ok: `Resposta /${r.atalho} salva. Digite /${r.atalho} na próxima conversa.` };
}

export async function salvarRespostas(lista: RespostaRapida[]): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador" && papel !== "advogado") return { erro: "Só administradores e advogados alteram as respostas rápidas.", ok: null };
  const limpas = lista.map(limpar).filter((r) => r.atalho && r.texto);
  const repetido = limpas.find((r, i) => limpas.findIndex((x) => x.atalho === r.atalho) !== i);
  if (repetido) return { erro: `O atalho /${repetido.atalho} aparece duas vezes.`, ok: null };
  // configuracoes só aceita escrita do administrador (RLS); advogados gravam pela chave secreta
  const db = papel === "administrador" ? supabase : (await import("@/lib/supabase/admin")).supabaseAdmin();
  const { error } = await db.from("configuracoes").upsert({ chave: "respostas_rapidas", valor: limpas });
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/atendimento-automatico");
  revalidatePath("/atendimento");
  return { erro: null, ok: `${limpas.length} ${limpas.length === 1 ? "resposta salva" : "respostas salvas"}.` };
}

export async function atualizarArea(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador altera as áreas.", ok: null };
  const id = String(f.get("id") ?? "");
  const nome = String(f.get("nome") ?? "").trim();
  if (!nome) return { erro: "Informe o nome da área.", ok: null };
  const { error } = await supabase
    .from("areas")
    .update({
      nome,
      cor: String(f.get("cor") ?? "#1967d2"),
      ordem_bot: Number(f.get("ordem_bot")) || 1,
      documentos_pedidos: String(f.get("documentos") ?? "").trim() || null,
      ativa: f.get("ativa") === "on",
    })
    .eq("id", id);
  if (error) return { erro: /duplicate key/i.test(error.message) ? "Já existe uma área com esse nome." : error.message, ok: null };
  revalidatePath("/areas");
  revalidatePath("/atendimento-automatico");
  return { erro: null, ok: "Área salva." };
}
