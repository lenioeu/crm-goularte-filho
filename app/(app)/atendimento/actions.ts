"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Resultado } from "@/app/(app)/actions";
import { criarPastaCliente } from "@/app/(app)/integracoes/actions";
import { conversaAberta, enviarERegistrar } from "@/lib/atendimento";
import { enviarArquivo, tokenDeAcesso } from "@/lib/google";
import { quemSou } from "@/lib/permissoes";
import { TZ } from "@/lib/rotulos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { baixarMidia, conectar, desconectar, enviarAudio, enviarMidia, estadoConexao, tipoDoArquivo, whatsappConfigurado, type Estado } from "@/lib/whatsapp";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);
const falha = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function enviarMensagem(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const texto = String(f.get("texto") ?? "").trim();
  if (!texto) return { erro: "Escreva a mensagem.", ok: null };
  const nota = f.get("nota") === "on";
  let conversaId = String(f.get("conversa_id") ?? "");
  const clienteId = String(f.get("cliente_id") ?? "");

  // Primeira mensagem para um cliente sem conversa aberta
  let novaConversa = false;
  if (!conversaId && clienteId) {
    const { data: c } = await supabase.from("clientes").select("id, area_id").eq("id", clienteId).maybeSingle();
    if (!c) return { erro: "Cliente não encontrado.", ok: null };
    try {
      conversaId = (await conversaAberta(supabase, c, "aguardando")).id;
      novaConversa = true;
    } catch (e) {
      return { erro: falha(e), ok: null };
    }
  }

  const { data: conv } = await supabase.from("conversas").select("id, status, atendente_id, clientes(telefone_whatsapp)").eq("id", conversaId).maybeSingle();
  if (!conv) return { erro: "Conversa não encontrada.", ok: null };

  if (nota) {
    const { error } = await supabase.from("mensagens").insert({ conversa_id: conversaId, direcao: "saida", autor_id: user.id, nota_interna: true, texto });
    if (error) return { erro: error.message, ok: null };
  } else {
    const telefone = um(conv.clientes as Rel<{ telefone_whatsapp: string | null }>)?.telefone_whatsapp;
    if (!telefone) return { erro: "O cliente não tem WhatsApp cadastrado. Preencha na ficha dele.", ok: null };
    if (!whatsappConfigurado()) return { erro: "O WhatsApp do escritório ainda não está ligado ao sistema (Integrações).", ok: null };
    try {
      await enviarERegistrar(supabase, conversaId, telefone, texto, { autorId: user.id });
    } catch (e) {
      return { erro: `Não foi enviada: ${falha(e)}`, ok: null };
    }
    // Quem responde assume a conversa, se ninguém tiver assumido
    if (conv.status !== "em_atendimento" || !conv.atendente_id) {
      await supabase.from("conversas").update({ status: "em_atendimento", atendente_id: conv.atendente_id ?? user.id }).eq("id", conversaId);
    }
  }
  revalidatePath("/atendimento");
  if (novaConversa) redirect(`/atendimento?c=${conversaId}`);
  return { erro: null, ok: nota ? "Nota registrada." : "Enviada." };
}

export async function assumirConversa(id: string): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const { error } = await supabase.from("conversas").update({ status: "em_atendimento", atendente_id: user.id }).eq("id", id);
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/atendimento");
  return { erro: null, ok: "Conversa assumida." };
}

export async function encerrarConversa(id: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const { error } = await supabase.from("conversas").update({ status: "resolvida" }).eq("id", id);
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/atendimento");
  return { erro: null, ok: "Conversa encerrada." };
}

export async function reabrirConversa(id: string): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const { data: c } = await supabase.from("conversas").select("cliente_id").eq("id", id).maybeSingle();
  const { count } = await supabase.from("conversas").select("id", { count: "exact", head: true }).eq("cliente_id", c?.cliente_id ?? "").neq("status", "resolvida");
  if (count) return { erro: "Este cliente já tem outra conversa aberta.", ok: null };
  const { error } = await supabase.from("conversas").update({ status: "em_atendimento", atendente_id: user.id }).eq("id", id);
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/atendimento");
  return { erro: null, ok: "Conversa reaberta." };
}

export async function mudarArea(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const id = String(f.get("conversa_id") ?? "");
  const areaId = String(f.get("area_id") ?? "") || null;
  const { data: conv, error } = await supabase.from("conversas").update({ area_id: areaId }).eq("id", id).select("cliente_id, status").maybeSingle();
  if (error || !conv) return { erro: error?.message ?? "Conversa não encontrada.", ok: null };
  if (conv.status === "bot") await supabase.from("conversas").update({ status: "aguardando" }).eq("id", id);
  if (areaId) await supabase.from("clientes").update({ area_id: areaId }).eq("id", conv.cliente_id).is("area_id", null);
  revalidatePath("/atendimento");
  return { erro: null, ok: "Área atualizada." };
}

/** Baixa o arquivo recebido e grava na pasta do cliente com o nome no padrão do escritório. */
export async function salvarDocumento(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const mensagemId = String(f.get("mensagem_id") ?? "");
  const tipo = String(f.get("tipo") ?? "").trim().toUpperCase();
  if (!tipo) return { erro: "Diga que documento é (ex.: RG, CTPS).", ok: null };

  const { data: m } = await supabase
    .from("mensagens")
    .select("id, whatsapp_id, midia_nome, midia_url, conversas(cliente_id)")
    .eq("id", mensagemId)
    .maybeSingle();
  if (!m?.whatsapp_id) return { erro: "Mensagem não encontrada.", ok: null };
  if (m.midia_url) return { erro: "Este arquivo já foi salvo.", ok: null };
  const clienteId = um(m.conversas as Rel<{ cliente_id: string }>)?.cliente_id;
  if (!clienteId) return { erro: "Conversa sem cliente.", ok: null };

  const token = await tokenDeAcesso();
  if (!token) return { erro: "A conta Google do escritório não está conectada.", ok: null };

  let { data: cliente } = await supabase.from("clientes").select("nome, pasta_drive_id").eq("id", clienteId).maybeSingle();
  if (!cliente) return { erro: "Cliente não encontrado.", ok: null };
  if (!cliente.pasta_drive_id) {
    const r = await criarPastaCliente(clienteId);
    if (r.erro) return r;
    ({ data: cliente } = await supabase.from("clientes").select("nome, pasta_drive_id").eq("id", clienteId).maybeSingle());
    if (!cliente?.pasta_drive_id) return { erro: "Não consegui achar a pasta do cliente.", ok: null };
  }

  try {
    const arq = await baixarMidia(m.whatsapp_id);
    const original = arq.fileName || m.midia_nome || "";
    const extensao = original.includes(".") ? original.slice(original.lastIndexOf(".")) : arq.mimetype?.includes("pdf") ? ".pdf" : arq.mimetype?.startsWith("image/") ? `.${arq.mimetype.slice(6).replace("jpeg", "jpg")}` : "";
    const data = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
    const nome = `${data} ${tipo} - ${cliente.nome.toUpperCase()}${extensao}`;
    const salvo = await enviarArquivo(token, { nome, mimetype: arq.mimetype || "application/octet-stream", base64: arq.base64, paiId: cliente.pasta_drive_id });
    await supabase.from("documentos").insert({
      cliente_id: clienteId,
      mensagem_id: m.id,
      nome_original: original || null,
      nome_salvo: nome,
      tipo_documento: tipo,
      drive_file_id: salvo.id,
      drive_url: salvo.webViewLink ?? null,
      salvo_por: user.id,
    });
    await supabase.from("mensagens").update({ midia_url: salvo.webViewLink ?? `https://drive.google.com/file/d/${salvo.id}/view` }).eq("id", m.id);
    revalidatePath("/atendimento");
    return { erro: null, ok: `Salvo como “${nome}”.` };
  } catch (e) {
    return { erro: `Não consegui salvar: ${falha(e)}`, ok: null };
  }
}

// ------------------------------------------------------------------ Conexão (Integrações)
export async function conectarWhatsApp(): Promise<{ erro: string | null; qr: string | null; estado: Estado | null }> {
  const { papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador conecta o WhatsApp.", qr: null, estado: null };
  if (!whatsappConfigurado()) return { erro: "Faltam as variáveis do WhatsApp na Vercel.", qr: null, estado: null };
  const h = await headers();
  const url = `https://${h.get("x-forwarded-host") ?? h.get("host")}/api/whatsapp/webhook`;
  try {
    if ((await estadoConexao()) === "open") return { erro: null, qr: null, estado: "open" };
    return { erro: null, qr: await conectar(url), estado: "connecting" };
  } catch (e) {
    return { erro: `O servidor do WhatsApp não respondeu: ${falha(e)}`, qr: null, estado: null };
  }
}

export async function lerEstadoWhatsApp(): Promise<Estado | null> {
  const { papel } = await quemSou();
  if (!papel || !whatsappConfigurado()) return null;
  return estadoConexao().catch(() => null);
}

export async function desconectarWhatsApp(): Promise<Resultado> {
  const { papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador desconecta o WhatsApp.", ok: null };
  try {
    await desconectar();
  } catch (e) {
    return { erro: falha(e), ok: null };
  }
  revalidatePath("/integracoes");
  return { erro: null, ok: "WhatsApp desconectado. O celular sai da lista de aparelhos conectados." };
}

export async function alternarBot(ligar: boolean): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador muda isso.", ok: null };
  const { error } = await supabase.from("configuracoes").upsert({ chave: "whatsapp_bot", valor: ligar });
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/integracoes");
  return { erro: null, ok: ligar ? "Triagem automática ligada." : "Triagem automática desligada." };
}

// ------------------------------------------------------------------ Arquivos (áudio, vídeo, foto, documento)
const ROTULO_MIDIA = { image: "imagem", video: "video", audio: "audio", document: "documento" } as const;

/** Envia um arquivo que o navegador já subiu para o armazenamento (pasta "whatsapp"). */
export async function enviarArquivoNaConversa(dados: {
  conversaId: string;
  caminho: string;
  nome: string;
  mimetype: string;
  legenda?: string;
  voz?: boolean;
}): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  if (!whatsappConfigurado()) return { erro: "O WhatsApp do escritório ainda não está ligado ao sistema.", ok: null };
  if (!dados.caminho.startsWith(`${dados.conversaId}/`)) return { erro: "Arquivo inválido.", ok: null };

  const { data: conv } = await supabase.from("conversas").select("id, status, atendente_id, clientes(telefone_whatsapp)").eq("id", dados.conversaId).maybeSingle();
  if (!conv) return { erro: "Conversa não encontrada.", ok: null };
  const telefone = um(conv.clientes as Rel<{ telefone_whatsapp: string | null }>)?.telefone_whatsapp;
  if (!telefone) return { erro: "O cliente não tem WhatsApp cadastrado.", ok: null };

  // Link temporário para o Evolution baixar o arquivo
  const { data: link, error: erroLink } = await supabase.storage.from("whatsapp").createSignedUrl(dados.caminho, 60 * 60);
  if (erroLink || !link) return { erro: /bucket|not found/i.test(erroLink?.message ?? "") ? "Falta rodar o script supabase/007_arquivos_whatsapp.sql no Supabase." : erroLink?.message ?? "Arquivo não encontrado.", ok: null };

  try {
    const legenda = dados.legenda?.trim() || undefined;
    const whatsappId = dados.voz
      ? await enviarAudio(telefone, link.signedUrl)
      : await enviarMidia(telefone, { url: link.signedUrl, mimetype: dados.mimetype, nome: dados.nome, legenda });
    const tipo = dados.voz ? "audio" : ROTULO_MIDIA[tipoDoArquivo(dados.mimetype)];
    await supabase.from("mensagens").insert({
      conversa_id: dados.conversaId,
      direcao: "saida",
      autor_id: user.id,
      texto: dados.voz ? null : legenda ?? null,
      midia_tipo: tipo,
      midia_nome: dados.voz ? null : dados.nome,
      arquivo_caminho: dados.caminho,
      whatsapp_id: whatsappId,
    });
    const atualizar: Record<string, unknown> = { ultima_mensagem_em: new Date().toISOString() };
    if (conv.status !== "em_atendimento" || !conv.atendente_id) Object.assign(atualizar, { status: "em_atendimento", atendente_id: conv.atendente_id ?? user.id });
    await supabase.from("conversas").update(atualizar).eq("id", dados.conversaId);
  } catch (e) {
    return { erro: `Não foi enviado: ${falha(e)}`, ok: null };
  }
  revalidatePath("/atendimento");
  return { erro: null, ok: "Enviado." };
}

// ------------------------------------------------------------------ Vincular conversa a um cliente já cadastrado
/**
 * Liga a conversa a um cliente que já existe. Se o contato tinha sido cadastrado sozinho
 * pelo WhatsApp (sem pasta e sem caso), junta tudo no cliente escolhido e apaga o cadastro
 * provisório; o número passa para o cliente, para as próximas mensagens já caírem nele.
 */
export async function vincularCliente(conversaId: string, clienteId: string): Promise<Resultado> {
  const { user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  let db;
  try {
    db = supabaseAdmin();
  } catch (e) {
    return { erro: falha(e), ok: null };
  }
  const { data: conv } = await db.from("conversas").select("id, cliente_id").eq("id", conversaId).maybeSingle();
  if (!conv) return { erro: "Conversa não encontrada.", ok: null };
  if (conv.cliente_id === clienteId) return { erro: "A conversa já está com esse cliente.", ok: null };

  const [{ data: de }, { data: para }] = await Promise.all([
    db.from("clientes").select("id, nome, telefone_whatsapp, origem, pasta_drive_id").eq("id", conv.cliente_id).maybeSingle(),
    db.from("clientes").select("id, nome, telefone_whatsapp, area_id").eq("id", clienteId).maybeSingle(),
  ]);
  if (!de || !para) return { erro: "Cliente não encontrado.", ok: null };
  const { count: casosDe } = await db.from("casos").select("id", { count: "exact", head: true }).eq("cliente_id", de.id);
  const provisorio = de.origem === "WhatsApp" && !de.pasta_drive_id && !casosDe;

  if (provisorio) {
    // Junta tudo do cadastro provisório no cliente escolhido
    for (const tabela of ["conversas", "documentos", "mensagens_agendadas", "tarefas"]) {
      const { error } = await db.from(tabela).update({ cliente_id: para.id }).eq("cliente_id", de.id);
      if (error) return { erro: error.message, ok: null };
    }
    const { error: e1 } = await db.from("clientes").delete().eq("id", de.id);
    if (e1) return { erro: e1.message, ok: null };
  } else {
    const { error } = await db.from("conversas").update({ cliente_id: para.id }).eq("id", conversaId);
    if (error) return { erro: error.message, ok: null };
  }
  await db.from("conversas").update({ area_id: para.area_id }).eq("id", conversaId).is("area_id", null);

  let aviso = "";
  if (!para.telefone_whatsapp && de.telefone_whatsapp) {
    if (!provisorio) await db.from("clientes").update({ telefone_whatsapp: null }).eq("id", de.id);
    const { error } = await db.from("clientes").update({ telefone_whatsapp: de.telefone_whatsapp }).eq("id", para.id);
    aviso = error ? ` Não consegui gravar o WhatsApp na ficha (${error.message}).` : " O número do WhatsApp foi gravado na ficha dele.";
  } else if (para.telefone_whatsapp && de.telefone_whatsapp && para.telefone_whatsapp !== de.telefone_whatsapp) {
    aviso = " Atenção: a ficha dele tem outro WhatsApp; mensagens novas deste número podem abrir um cadastro provisório de novo. Ajuste o número na ficha se for o caso.";
  }
  revalidatePath("/atendimento");
  revalidatePath("/clientes");
  return { erro: null, ok: `Conversa ligada a ${para.nome}.${provisorio ? " O cadastro provisório foi juntado e apagado." : ""}${aviso}` };
}
