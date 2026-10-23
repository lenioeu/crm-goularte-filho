import type { SupabaseClient } from "@supabase/supabase-js";
import { primeiroNome } from "@/lib/rotulos";
import { chaveTelefone, enviarTexto, INSTANCIA, type MensagemRecebida } from "@/lib/whatsapp";

// Regras do atendimento pelo WhatsApp. Roda no servidor com a chave secreta
// (o aviso do Evolution não tem usuário logado).

type Db = SupabaseClient;

export const MENSAGEM_ENCAMINHADO = (area: string, docs: string | null) =>
  `Obrigado! Seu atendimento foi encaminhado para a área ${area}.` +
  (docs ? `\n\nPara adiantar, se tiver, envie por aqui: ${docs}.` : "") +
  "\n\nEm breve uma pessoa da equipe responde.";

async function acharCliente(db: Db, numero: string) {
  const chave = chaveTelefone(numero);
  const { data } = await db.from("clientes").select("id, nome, telefone_whatsapp, area_id").ilike("telefone_whatsapp", `%${chave.slice(-8)}`).limit(20);
  return (data ?? []).find((c) => c.telefone_whatsapp && chaveTelefone(c.telefone_whatsapp) === chave) ?? null;
}

/** Conversa aberta do cliente; cria uma se não houver. */
export async function conversaAberta(db: Db, cliente: { id: string; area_id: string | null }, statusInicial: "bot" | "aguardando") {
  const { data: aberta } = await db
    .from("conversas")
    .select("id, status, area_id")
    .eq("cliente_id", cliente.id)
    .neq("status", "resolvida")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aberta) return aberta;
  const { data, error } = await db
    .from("conversas")
    .insert({ cliente_id: cliente.id, numero_conexao: INSTANCIA, status: statusInicial, area_id: cliente.area_id })
    .select("id, status, area_id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Envia pelo WhatsApp e guarda no histórico da conversa. */
export async function enviarERegistrar(
  db: Db,
  conversaId: string,
  telefone: string,
  texto: string,
  quem: { autorId?: string | null; bot?: boolean } = {},
) {
  const whatsappId = await enviarTexto(telefone, texto);
  await db.from("mensagens").insert({
    conversa_id: conversaId,
    direcao: "saida",
    autor_id: quem.autorId ?? null,
    enviada_pelo_bot: Boolean(quem.bot),
    texto,
    whatsapp_id: whatsappId,
  });
  await db.from("conversas").update({ ultima_mensagem_em: new Date().toISOString() }).eq("id", conversaId);
}

/** Trata uma mensagem que chegou (ou que o escritório mandou pelo próprio celular). */
export async function registrarMensagem(db: Db, m: MensagemRecebida) {
  // Já registrada (ex.: eco de uma mensagem enviada pelo próprio CRM)
  const { data: existe } = await db.from("mensagens").select("id").eq("whatsapp_id", m.whatsappId).maybeSingle();
  if (existe) return;

  let cliente = await acharCliente(db, m.numero);
  if (!cliente) {
    if (m.deMim) return; // conversa do celular com quem não é cliente: fica fora do CRM
    const { data, error } = await db
      .from("clientes")
      .insert({ nome: (m.nomeContato || m.numero).toUpperCase(), telefone_whatsapp: m.numero, origem: "WhatsApp" })
      .select("id, nome, telefone_whatsapp, area_id")
      .single();
    if (error) throw new Error(error.message);
    cliente = data;
  }

  // Quem já tem área definida não passa pelo menu de novo
  const conversa = await conversaAberta(db, cliente, cliente.area_id ? "aguardando" : "bot");
  const { error } = await db.from("mensagens").insert({
    conversa_id: conversa.id,
    direcao: m.deMim ? "saida" : "entrada",
    texto: m.texto,
    midia_tipo: m.midiaTipo,
    midia_nome: m.midiaNome,
    whatsapp_id: m.whatsappId,
    criado_em: m.em,
  });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  await db.from("conversas").update({ ultima_mensagem_em: m.em }).eq("id", conversa.id);
  if (m.deMim) return;

  // O cliente respondeu: cancela follow-ups marcados para isso
  await db
    .from("mensagens_agendadas")
    .update({ status: "cancelada", erro: "cliente respondeu" })
    .eq("cliente_id", cliente.id)
    .eq("status", "programada")
    .eq("cancelar_se_responder", true);

  if (conversa.status === "bot") await triagem(db, conversa.id, cliente, m.texto);
}

/** Menu de áreas: o cliente responde com o número e a conversa vai para a fila da área. */
async function triagem(db: Db, conversaId: string, cliente: { id: string; nome: string; telefone_whatsapp: string | null }, texto: string | null) {
  const { data: cfg } = await db.from("configuracoes").select("valor").eq("chave", "whatsapp_bot").maybeSingle();
  const telefone = cliente.telefone_whatsapp;
  if (cfg?.valor === false || !telefone) {
    await db.from("conversas").update({ status: "aguardando" }).eq("id", conversaId);
    return;
  }

  const { data: areas } = await db.from("areas").select("id, nome, documentos_pedidos").eq("ativa", true).order("ordem_bot");
  const lista = areas ?? [];
  const resposta = (texto ?? "").trim().match(/^\d{1,2}\b/)?.[0];
  const escolhida = resposta ? lista[Number(resposta) - 1] : undefined;

  if (escolhida) {
    await db.from("conversas").update({ status: "aguardando", area_id: escolhida.id }).eq("id", conversaId);
    await db.from("clientes").update({ area_id: escolhida.id }).eq("id", cliente.id).is("area_id", null);
    await enviarERegistrar(db, conversaId, telefone, MENSAGEM_ENCAMINHADO(escolhida.nome, escolhida.documentos_pedidos), { bot: true });
    return;
  }
  if (resposta === "0") {
    await db.from("conversas").update({ status: "aguardando" }).eq("id", conversaId);
    await enviarERegistrar(db, conversaId, telefone, "Certo! Em breve uma pessoa da equipe responde por aqui.", { bot: true });
    return;
  }

  // Manda o menu; depois de duas tentativas sem resposta válida, passa para a equipe
  const { count } = await db.from("mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", conversaId).eq("enviada_pelo_bot", true);
  if ((count ?? 0) >= 2) {
    await db.from("conversas").update({ status: "aguardando" }).eq("id", conversaId);
    return;
  }
  const nome = cliente.nome && !/^\d+$/.test(cliente.nome) ? `, ${primeiroNome(cliente.nome)}` : "";
  const menu =
    `Olá${nome}! Você está falando com o escritório Goularte Filho Advocacia.\n\n` +
    "Para direcionar seu atendimento, responda com o número do assunto:\n" +
    lista.map((a, i) => `${i + 1} - ${a.nome}`).join("\n") +
    "\n0 - Outro assunto";
  await enviarERegistrar(db, conversaId, telefone, menu, { bot: true });
}
