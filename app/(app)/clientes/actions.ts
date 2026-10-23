"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { lerTiposContato, SEM_COLUNA_CONTATO, semColunaContato } from "@/lib/contatos";
import { quemSou } from "@/lib/permissoes";

function atualizarTelas(id?: string) {
  revalidatePath("/clientes");
  revalidatePath("/atendimento");
  if (id) revalidatePath(`/clientes/${id}`);
}

async function mudarSituacao(id: string, situacao: "cliente" | "contato"): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const { error } = await supabase.from("clientes").update({ situacao }).eq("id", id);
  if (error) return { erro: semColunaContato(error.message) ? SEM_COLUNA_CONTATO : error.message, ok: null };
  atualizarTelas(id);
  return { erro: null, ok: situacao === "cliente" ? "Agora é cliente: já aparece na lista de Clientes." : "Voltou a ser contato." };
}

/** O contato fechou com o escritório: passa para a lista de Clientes. */
export async function tornarCliente(id: string) {
  return mudarSituacao(id, "cliente");
}

/** Desfaz o "Tornar cliente". */
export async function voltarAContato(id: string) {
  return mudarSituacao(id, "contato");
}

export async function mudarTipoContato(id: string, tipo: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const { error } = await supabase.from("clientes").update({ contato_tipo: tipo.trim() || null }).eq("id", id);
  if (error) return { erro: semColunaContato(error.message) ? SEM_COLUNA_CONTATO : error.message, ok: null };
  atualizarTelas(id);
  return { erro: null, ok: tipo ? `Tipo: ${tipo}.` : "Tipo retirado." };
}

/** Grava a lista de tipos de contato. Qualquer pessoa da equipe pode mudar. */
async function gravarTipos(lista: string[]): Promise<Resultado> {
  const { papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const limpos = [...new Map(lista.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()];
  // configuracoes só aceita escrita do administrador (RLS): grava pela chave secreta
  const db = (await import("@/lib/supabase/admin")).supabaseAdmin();
  const { error } = await db.from("configuracoes").upsert({ chave: "tipos_contato", valor: limpos });
  if (error) return { erro: error.message, ok: null };
  atualizarTelas();
  return { erro: null, ok: "Tipos de contato salvos." };
}

export async function adicionarTipoContato(nome: string): Promise<Resultado> {
  const { supabase } = await quemSou();
  const tipo = nome.replace(/\s+/g, " ").trim();
  if (!tipo) return { erro: "Escreva o nome do tipo.", ok: null };
  const atuais = await lerTiposContato(supabase);
  if (atuais.some((t) => t.toLowerCase() === tipo.toLowerCase())) return { erro: null, ok: `“${tipo}” já existe.` };
  const r = await gravarTipos([...atuais, tipo]);
  return r.erro ? r : { erro: null, ok: `Tipo “${tipo}” criado.` };
}

export async function removerTipoContato(nome: string): Promise<Resultado> {
  const { supabase } = await quemSou();
  const atuais = await lerTiposContato(supabase);
  const r = await gravarTipos(atuais.filter((t) => t !== nome));
  return r.erro ? r : { erro: null, ok: `Tipo “${nome}” removido. Quem já tinha esse tipo continua com ele até você trocar.` };
}

/** Formulário "Novo tipo" da lista de contatos. */
export async function criarTipoContato(_: Resultado, f: FormData): Promise<Resultado> {
  return adicionarTipoContato(String(f.get("tipo") ?? ""));
}
