import type { SupabaseClient } from "@supabase/supabase-js";
import { dentroDoExpediente, lerConfigBot, montarTexto } from "@/lib/bot";
import { enviarPush } from "@/lib/push";
import { primeiroNome } from "@/lib/rotulos";
import { chaveTelefone, enviarTexto, INSTANCIA, type MensagemRecebida } from "@/lib/whatsapp";

// Regras do atendimento pelo WhatsApp. Roda no servidor com a chave secreta
// (o aviso do Evolution não tem usuário logado).

type Db = SupabaseClient;

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
  // Resposta de gente (não do bot) tira a conversa da lista de "esperando resposta" (script 008)
  if (!quem.bot) await db.from("conversas").update({ aguardando_resposta: false }).eq("id", conversaId);
}

const ROTULO_MIDIA: Record<string, string> = { documento: "📄 Documento", imagem: "📷 Foto", audio: "🎤 Áudio", video: "🎥 Vídeo", figurinha: "Figurinha" };

/** Avisa a equipe de mensagem nova: quem atende a conversa ou, se ninguém assumiu, todo mundo. */
async function avisarEquipe(db: Db, conversaId: string, nome: string, m: MensagemRecebida) {
  const { data: conv } = await db.from("conversas").select("status, atendente_id").eq("id", conversaId).maybeSingle();
  if (!conv || conv.status === "bot" || conv.status === "resolvida") return;
  const texto = m.texto ?? (m.midiaTipo ? ROTULO_MIDIA[m.midiaTipo] ?? "Arquivo" : "Mensagem nova");
  await enviarPush(db, conv.atendente_id ? [conv.atendente_id] : "equipe", {
    titulo: nome,
    texto: texto.length > 140 ? texto.slice(0, 140) + "…" : texto,
    url: `/atendimento?c=${conversaId}`,
    tag: conversaId,
  }).catch(() => null);
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
  if (m.deMim) {
    await db.from("conversas").update({ aguardando_resposta: false }).eq("id", conversa.id);
    return;
  }

  // O cliente respondeu: cancela follow-ups marcados para isso
  await db
    .from("mensagens_agendadas")
    .update({ status: "cancelada", erro: "cliente respondeu" })
    .eq("cliente_id", cliente.id)
    .eq("status", "programada")
    .eq("cancelar_se_responder", true);

  if (conversa.status === "bot") await triagem(db, conversa.id, cliente, m.texto);
  else await avisoForaDoExpediente(db, conversa.id, cliente.telefone_whatsapp, cliente.nome);

  await db.from("conversas").update({ aguardando_resposta: true }).eq("id", conversa.id);
  await avisarEquipe(db, conversa.id, cliente.nome, m);
}

/** Menu de áreas: o cliente responde com o número e a conversa vai para a fila da área. Regras em lib/bot.ts. */
async function triagem(db: Db, conversaId: string, cliente: { id: string; nome: string; telefone_whatsapp: string | null }, texto: string | null) {
  const cfg = await lerConfigBot(db);
  const telefone = cliente.telefone_whatsapp;
  const fora = !dentroDoExpediente(cfg);
  if (cfg.modo === "desligado" || (cfg.modo === "fora" && !fora) || !telefone) {
    await db.from("conversas").update({ status: "aguardando" }).eq("id", conversaId);
    return;
  }

  const { data: areas } = await db.from("areas").select("id, nome, documentos_pedidos").eq("ativa", true).order("ordem_bot");
  const lista = (areas ?? []).filter((a) => !cfg.areasMenu || cfg.areasMenu.includes(a.id));
  const resposta = (texto ?? "").trim().match(/^\d{1,2}\b/)?.[0];
  const escolhida = resposta ? lista[Number(resposta) - 1] : undefined;
  const nome = cliente.nome && !/^\d+$/.test(cliente.nome) ? primeiroNome(cliente.nome) : "";

  if (escolhida) {
    await db.from("conversas").update({ status: "aguardando", area_id: escolhida.id }).eq("id", conversaId);
    await db.from("clientes").update({ area_id: escolhida.id }).eq("id", cliente.id).is("area_id", null);
    await enviarERegistrar(db, conversaId, telefone, montarTexto(cfg.encaminhado, { nome, area: escolhida.nome, documentos: escolhida.documentos_pedidos }), { bot: true });
    return;
  }
  if (resposta === "0") {
    await db.from("conversas").update({ status: "aguardando" }).eq("id", conversaId);
    await enviarERegistrar(db, conversaId, telefone, montarTexto(cfg.outro, { nome }), { bot: true });
    return;
  }

  // Manda o menu; depois de N tentativas sem resposta válida, passa para a equipe
  const { count } = await db.from("mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", conversaId).eq("enviada_pelo_bot", true);
  if ((count ?? 0) >= Math.max(1, cfg.tentativas)) {
    await db.from("conversas").update({ status: "aguardando" }).eq("id", conversaId);
    return;
  }
  const menu = [...lista.map((a, i) => `${i + 1} - ${a.nome}`), "0 - Outro assunto"].join("\n");
  let mensagem = montarTexto(cfg.saudacao.includes("{menu}") ? cfg.saudacao : `${cfg.saudacao}\n\n{menu}`, { nome, menu });
  if (fora && cfg.foraExpediente.trim() && !count) mensagem = `${montarTexto(cfg.foraExpediente, { nome })}\n\n${mensagem}`;
  await enviarERegistrar(db, conversaId, telefone, mensagem, { bot: true });
}

/** Fora do expediente, avisa quem já é cliente (no máximo uma vez a cada 12 horas por conversa). */
async function avisoForaDoExpediente(db: Db, conversaId: string, telefone: string | null, nome: string) {
  if (!telefone) return;
  const cfg = await lerConfigBot(db);
  if (cfg.modo === "desligado" || !cfg.avisarForaSempre || !cfg.foraExpediente.trim() || dentroDoExpediente(cfg)) return;
  const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { count } = await db.from("mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", conversaId).eq("enviada_pelo_bot", true).gte("criado_em", desde);
  if (count) return;
  await enviarERegistrar(db, conversaId, telefone, montarTexto(cfg.foraExpediente, { nome: /^\d+$/.test(nome) ? "" : primeiroNome(nome) }), { bot: true });
}
