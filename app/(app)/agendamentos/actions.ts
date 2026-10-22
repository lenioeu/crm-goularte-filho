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
  return { erro: null, ok: "Envio cancelado." };
}
