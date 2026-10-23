"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { quemSou } from "@/lib/permissoes";
import { primeiroNome } from "@/lib/rotulos";

const TIPOS = ["follow_up", "livre", "lembrete_audiencia"];

export async function criarAgendamento(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };

  const clienteId = String(f.get("cliente_id") ?? "");
  const tipo = String(f.get("tipo") ?? "");
  const data = String(f.get("data") ?? "");
  const hora = String(f.get("hora") ?? "");
  const textoBruto = String(f.get("texto") ?? "").trim();
  if (!clienteId) return { erro: "Escolha o cliente.", ok: null };
  if (!TIPOS.includes(tipo)) return { erro: "Escolha o tipo da mensagem.", ok: null };
  if (!data || !hora) return { erro: "Escolha o dia e a hora do envio.", ok: null };
  if (!textoBruto) return { erro: "Escreva a mensagem.", ok: null };

  const enviarEm = new Date(`${data}T${hora}:00-03:00`);
  if (Number.isNaN(enviarEm.getTime())) return { erro: "Data ou hora inválida.", ok: null };
  if (enviarEm.getTime() < Date.now() + 60_000) return { erro: "Escolha um horário no futuro.", ok: null };

  const { data: cliente } = await supabase.from("clientes").select("nome").eq("id", clienteId).maybeSingle();
  if (!cliente) return { erro: "Cliente não encontrado.", ok: null };
  const texto = textoBruto.replace(/\{nome\}/g, primeiroNome(cliente.nome));

  const { error } = await supabase.from("mensagens_agendadas").insert({
    cliente_id: clienteId,
    tipo,
    texto,
    enviar_em: enviarEm.toISOString(),
    cancelar_se_responder: f.get("cancelar") === "on",
    criado_por: user.id,
  });
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/agendamentos");
  revalidatePath("/atendimento");
  revalidatePath(`/clientes/${clienteId}`);
  const [, m, d] = data.split("-");
  return { erro: null, ok: `Mensagem para ${primeiroNome(cliente.nome)} programada para ${d}/${m} às ${hora}.` };
}

export async function cancelarAgendamento(id: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const { error } = await supabase.from("mensagens_agendadas").update({ status: "cancelada" }).eq("id", id).eq("status", "programada");
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/agendamentos");
  revalidatePath("/atendimento");
  return { erro: null, ok: "Envio cancelado." };
}

/** Desfaz o cancelamento (volta a ficar programada, se ainda não passou do horário). */
export async function reativarAgendamento(id: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const { data, error } = await supabase
    .from("mensagens_agendadas")
    .update({ status: "programada", erro: null })
    .eq("id", id)
    .eq("status", "cancelada")
    .gt("enviar_em", new Date().toISOString())
    .select("id");
  if (error) return { erro: error.message, ok: null };
  if (!data?.length) return { erro: "Não dá para reativar: o horário de envio já passou.", ok: null };
  revalidatePath("/agendamentos");
  revalidatePath("/atendimento");
  return { erro: null, ok: "Envio reativado." };
}

// ------------------------------------------------------------------ Modelos de mensagem
const SEM_TABELA_MODELOS = "Falta rodar o script supabase/013_modelos_mensagem.sql no Supabase.";
const traduzirModelo = (msg: string) => (/modelos_mensagem|does not exist|schema cache/i.test(msg) ? SEM_TABELA_MODELOS : msg);

export async function salvarModeloMensagem(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const id = String(f.get("id") ?? "");
  if (id.startsWith("padrao-")) return { erro: SEM_TABELA_MODELOS, ok: null };
  const nome = String(f.get("nome") ?? "").trim();
  const texto = String(f.get("texto") ?? "").replace(/\r\n/g, "\n").trim();
  const gatilho = String(f.get("gatilho") ?? "livre");
  const hora = String(f.get("hora") ?? "10:00");
  if (!nome) return { erro: "Dê um nome ao modelo.", ok: null };
  if (!texto) return { erro: "Escreva o texto da mensagem.", ok: null };
  if (!["antes_audiencia", "depois_audiencia", "depois_de_hoje", "livre"].includes(gatilho)) return { erro: "Escolha quando a mensagem sai.", ok: null };
  if (!/^\d{2}:\d{2}$/.test(hora)) return { erro: "Hora inválida.", ok: null };
  const dados = {
    nome,
    texto,
    gatilho,
    hora,
    dias: Math.min(365, Math.max(0, Math.round(Number(f.get("dias")) || 0))),
    marcado: f.get("marcado") === "on",
    cancelar_se_responder: f.get("cancelar") === "on",
    ordem: Number(f.get("ordem")) || 0,
  };
  const { error } = id ? await supabase.from("modelos_mensagem").update(dados).eq("id", id) : await supabase.from("modelos_mensagem").insert(dados);
  if (error) return { erro: traduzirModelo(error.message), ok: null };
  revalidatePath("/agendamentos");
  revalidatePath("/audiencias");
  revalidatePath("/atendimento");
  return { erro: null, ok: id ? "Modelo salvo." : `Modelo “${nome}” criado.` };
}

export async function excluirModeloMensagem(id: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  if (id.startsWith("padrao-")) return { erro: SEM_TABELA_MODELOS, ok: null };
  const { error } = await supabase.from("modelos_mensagem").delete().eq("id", id);
  if (error) return { erro: traduzirModelo(error.message), ok: null };
  revalidatePath("/agendamentos");
  revalidatePath("/audiencias");
  return { erro: null, ok: "Modelo apagado." };
}
