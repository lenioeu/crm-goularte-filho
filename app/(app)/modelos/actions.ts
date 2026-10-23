"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Resultado } from "@/app/(app)/actions";
import { MODELOS_PADRAO } from "@/lib/modelos";
import { quemSou } from "@/lib/permissoes";

const PODEM = ["administrador", "advogado"];
const SEM_TABELA = "Falta rodar o script supabase/005_modelos_editaveis.sql no Supabase.";
const SEM_RODAPE = "Para tirar o rodapé, falta rodar o script supabase/011_modelos_rodape.sql no Supabase.";
const semColunaRodape = (msg: string) => /rodape/.test(msg);
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
    rodape: f.get("rodape") === "on",
  };
  // Sem o script 011 a coluna "rodape" não existe: com rodapé (o padrão) salva sem ela
  const semRodape = ({ rodape: _, ...resto }: typeof dados) => resto;

  if (id) {
    let { error } = await supabase.from("modelos").update(dados).eq("id", id);
    if (error && semColunaRodape(error.message)) {
      if (!dados.rodape) return { erro: SEM_RODAPE, ok: null };
      ({ error } = await supabase.from("modelos").update(semRodape(dados)).eq("id", id));
    }
    if (error) return { erro: traduzir(error.message), ok: null };
    revalidatePath("/modelos");
    return { erro: null, ok: "Modelo salvo." };
  }
  let { data, error } = await supabase.from("modelos").insert({ ...dados, criado_por: user.id }).select("id").single();
  if (error && semColunaRodape(error.message)) {
    if (!dados.rodape) return { erro: SEM_RODAPE, ok: null };
    ({ data, error } = await supabase.from("modelos").insert({ ...semRodape(dados), criado_por: user.id }).select("id").single());
  }
  if (error || !data) return { erro: traduzir(error?.message ?? "Não foi possível salvar."), ok: null };
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
  let { data: m, error: e } = await supabase.from("modelos").select("nome, arquivo, descricao, conteudo, ordem, rodape").eq("id", id).maybeSingle();
  if (e && semColunaRodape(e.message)) ({ data: m } = await supabase.from("modelos").select("nome, arquivo, descricao, conteudo, ordem").eq("id", id).maybeSingle());
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
