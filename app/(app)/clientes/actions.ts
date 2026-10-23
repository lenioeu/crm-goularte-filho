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

/** "Tornar cliente" pela conversa: completa o cadastro do contato e passa para a lista de Clientes. */
export async function cadastrarComoCliente(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const valor = (k: string) => {
    const v = f.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const id = valor("id");
  const nome = valor("nome");
  if (!id) return { erro: "Cadastro não encontrado.", ok: null };
  if (!nome) return { erro: "Informe o nome completo.", ok: null };
  const basicos = {
    nome: nome.toUpperCase(),
    cpf_cnpj: valor("cpf")?.toUpperCase() ?? null,
    email: valor("email"),
    area_id: valor("area_id"),
    origem: valor("origem")?.toUpperCase() ?? null,
  };
  const endereco = { cep: valor("cep"), endereco: valor("endereco")?.toUpperCase() ?? null };
  // Tenta tudo; sem o script 004 (endereço) ou 012 (situação), grava o que der
  const tentativas: Record<string, unknown>[] = [
    { ...basicos, ...endereco, situacao: "cliente" },
    { ...basicos, situacao: "cliente" },
    { ...basicos, ...endereco },
    basicos,
  ];
  let erro: string | null = null;
  for (const dados of tentativas) {
    const { error } = await supabase.from("clientes").update(dados).eq("id", id);
    if (!error) {
      erro = null;
      break;
    }
    erro = error.message;
    if (!/column|schema cache|situacao|cep|endereco/i.test(error.message)) break;
  }
  if (erro) return { erro: /duplicate key/i.test(erro) ? "Já existe outro cadastro com esse WhatsApp ou CPF. Use “Vincular a cliente”." : erro, ok: null };
  atualizarTelas(id);
  return { erro: null, ok: `${nome.toUpperCase()} agora é cliente.` };
}
