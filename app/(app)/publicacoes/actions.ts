"use server";

import { revalidatePath } from "next/cache";
import { criarAudiencia, type Resultado } from "@/app/(app)/actions";
import { quemSou } from "@/lib/permissoes";

const SEM_TABELA = "Falta rodar o script supabase/017_publicacoes.sql no Supabase.";
const traduzir = (msg: string) => (/publicacoes|does not exist|schema cache/i.test(msg) ? SEM_TABELA : msg);

async function marcar(id: string, situacao: "nova" | "ciencia" | "tarefa" | "audiencia"): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const tratada = situacao === "nova" ? { tratada_por: null, tratada_em: null } : { tratada_por: user.id, tratada_em: new Date().toISOString() };
  const { error } = await supabase.from("publicacoes").update({ situacao, ...tratada }).eq("id", id);
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/publicacoes");
  return { erro: null, ok: situacao === "nova" ? "Publicação voltou para tratar." : "Publicação tratada." };
}

/** "Ciência": lida, sem providência. */
export async function darCiencia(id: string) {
  return marcar(id, "ciencia");
}

/** Desfaz o tratamento: volta para "Para tratar". */
export async function voltarParaTratar(id: string) {
  return marcar(id, "nova");
}

/** Cria uma tarefa (ligada ao cliente) a partir da publicação e marca como tratada. */
export async function tarefaDaPublicacao(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const id = String(f.get("id") ?? "");
  const titulo = String(f.get("titulo") ?? "").trim();
  const vence = String(f.get("vence_em") ?? "").trim() || null;
  if (!titulo) return { erro: "Escreva o que precisa ser feito.", ok: null };
  const { data: pub } = await supabase.from("publicacoes").select("cliente_id, processos(caso_id)").eq("id", id).maybeSingle();
  if (!pub) return { erro: "Publicação não encontrada. Recarregue a página.", ok: null };
  const proc = pub.processos as { caso_id: string } | { caso_id: string }[] | null;
  const casoId = (Array.isArray(proc) ? proc[0] : proc)?.caso_id ?? null;
  const { error } = await supabase.from("tarefas").insert({
    titulo,
    vence_em: vence,
    cliente_id: pub.cliente_id,
    caso_id: casoId,
    responsavel_id: String(f.get("responsavel_id") ?? "") || user.id,
  });
  if (error) return { erro: error.message, ok: null };
  await marcar(id, "tarefa");
  revalidatePath("/tarefas");
  return { erro: null, ok: `Tarefa criada${vence ? ` para ${vence.split("-").reverse().join("/")}` : ""}.` };
}

/** Agenda a audiência que a publicação cita (mesmo caminho da aba Audiências) e marca como tratada. */
export async function audienciaDaPublicacao(estado: Resultado, f: FormData): Promise<Resultado> {
  const r = await criarAudiencia(estado, f);
  if (r.erro) return r;
  await marcar(String(f.get("publicacao_id") ?? ""), "audiencia");
  return r;
}
