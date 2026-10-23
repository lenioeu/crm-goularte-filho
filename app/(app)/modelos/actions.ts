"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Resultado } from "@/app/(app)/actions";
import { MODELOS_PADRAO } from "@/lib/modelos";
import { quemSou } from "@/lib/permissoes";

const PODEM = ["administrador", "advogado"];
const SEM_TABELA = "Falta rodar o script supabase/005_modelos_editaveis.sql no Supabase.";
const traduzir = (msg: string) => (/relation .*modelos|does not exist|schema cache/i.test(msg) ? SEM_TABELA : msg);

export async function salvarModelo(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel || !PODEM.includes(papel)) return { erro: "Só administradores e advogados editam modelos.", ok: null };
  const id = String(f.get("id") ?? "");
  const nome = String(f.get("nome") ?? "").trim();
  const conteudo = String(f.get("conteudo") ?? "").replace(/\r\n/g, "\n").trim();
  if (!nome) return { erro: "Dê um nome ao modelo.", ok: null };
  if (!conteudo) return { erro: "Escreva o texto do modelo.", ok: null };
  const dados = {
    nome,
    arquivo: (String(f.get("arquivo") ?? "").trim() || nome).toUpperCase(),
    descricao: String(f.get("descricao") ?? "").trim() || null,
    conteudo,
    ordem: Number(f.get("ordem")) || 0,
  };

  if (id) {
    const { error } = await supabase.from("modelos").update(dados).eq("id", id);
    if (error) return { erro: traduzir(error.message), ok: null };
    revalidatePath("/modelos");
    return { erro: null, ok: "Modelo salvo." };
  }
  const { data, error } = await supabase.from("modelos").insert({ ...dados, criado_por: user.id }).select("id").single();
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/modelos");
  redirect(`/modelos/${data.id}`);
}

export async function excluirModelo(id: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel || !PODEM.includes(papel)) return { erro: "Só administradores e advogados editam modelos.", ok: null };
  const { error } = await supabase.from("modelos").delete().eq("id", id);
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/modelos");
  redirect("/modelos");
}

export async function duplicarModelo(id: string): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel || !PODEM.includes(papel)) return { erro: "Só administradores e advogados editam modelos.", ok: null };
  const { data: m } = await supabase.from("modelos").select("nome, arquivo, descricao, conteudo, ordem").eq("id", id).maybeSingle();
  if (!m) return { erro: "Modelo não encontrado.", ok: null };
  const { data, error } = await supabase.from("modelos").insert({ ...m, nome: `${m.nome} (cópia)`, criado_por: user.id }).select("id").single();
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/modelos");
  redirect(`/modelos/${data.id}`);
}

/** Copia os modelos de fábrica para a tabela, para poderem ser editados. */
export async function importarPadroes(): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel || !PODEM.includes(papel)) return { erro: "Só administradores e advogados editam modelos.", ok: null };
  const linhas = MODELOS_PADRAO.map((m, i) => ({ nome: m.nome, arquivo: m.arquivo, descricao: m.descricao, conteudo: m.conteudo, ordem: (i + 1) * 10, criado_por: user.id }));
  const { error } = await supabase.from("modelos").insert(linhas);
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/modelos");
  return { erro: null, ok: "Modelos do escritório prontos para editar." };
}
