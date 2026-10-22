"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro: string | null; ok: string | null };

function traduzirErro(msg: string) {
  if (/row-level security/i.test(msg)) return "Você não tem permissão para fazer isso.";
  if (/duplicate key/i.test(msg)) return "Já existe um cadastro com esses dados.";
  return msg;
}

export async function sair() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

const texto = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export async function criarCliente(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o nome do cliente.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("clientes").insert({
    nome: nome.toUpperCase(),
    telefone_whatsapp: texto(f, "telefone")?.replace(/\D/g, "") || null,
    cpf_cnpj: texto(f, "cpf"),
    email: texto(f, "email"),
    area_id: texto(f, "area_id"),
  });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/clientes");
  revalidatePath("/");
  return { erro: null, ok: `${nome.toUpperCase()} cadastrado.` };
}

export async function criarArea(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o nome da área.", ok: null };
  const supabase = await supabaseServer();
  const { data: ultima } = await supabase.from("areas").select("ordem_bot").order("ordem_bot", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("areas").insert({
    nome,
    cor: texto(f, "cor") ?? "#1967d2",
    documentos_pedidos: texto(f, "documentos"),
    ordem_bot: (ultima?.ordem_bot ?? 0) + 1,
  });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/areas");
  return { erro: null, ok: `Área “${nome}” criada.` };
}

export async function atualizarMembro(_: Resultado, f: FormData): Promise<Resultado> {
  const id = texto(f, "id");
  if (!id) return { erro: "Pessoa não encontrada.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("perfis")
    .update({ papel: texto(f, "papel"), cargo_id: texto(f, "cargo_id"), ativo: f.get("ativo") === "on" })
    .eq("id", id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/equipe");
  return { erro: null, ok: "Salvo." };
}

export async function criarCargo(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o nome do cargo.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("cargos").insert({ nome });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/equipe");
  return { erro: null, ok: `Cargo “${nome}” criado.` };
}

export async function salvarPerfil(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o seu nome.", ok: null };
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre de novo.", ok: null };
  const { error } = await supabase
    .from("perfis")
    .update({ nome, oab: texto(f, "oab"), telefone: texto(f, "telefone"), assinatura: texto(f, "assinatura") })
    .eq("id", user.id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/", "layout");
  return { erro: null, ok: "Perfil salvo." };
}
