"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Resultado } from "@/app/(app)/actions";
import { criarPastaCliente } from "@/app/(app)/integracoes/actions";
import { acharCliente, conversaAberta, enviarERegistrar } from "@/lib/atendimento";
import { enviarArquivo, tokenDeAcesso } from "@/lib/google";
import { semColunaContato, TIPO_NOVO_CONTATO } from "@/lib/contatos";
import { quemSou } from "@/lib/permissoes";
import { TZ } from "@/lib/rotulos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  apagarParaTodos, baixarMidia, conectar, conversasNoServidor, desconectar, editarNoWhatsApp, enviarAudio, enviarMidia, estadoConexao, INSTANCIA,
  lerMensagem, mensagensNoServidor, pedirHistoricoCompleto, reaplicarWebhook, tipoDoArquivo, whatsappConfigurado, type Estado,
} from "@/lib/whatsapp";

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
  await supabase.from("conversas").update({ aguardando_resposta: false }).eq("id", id);
  revalidatePath("/atendimento");
  return { erro: null, ok: "Conversa encerrada. Se o cliente escrever de novo, abre outra." };
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

/** Regrava a ligação do Evolution com o CRM (eventos novos, como os tiques de leitura). */
export async function atualizarLigacaoWhatsApp(): Promise<Resultado> {
  const { papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador mexe na ligação do WhatsApp.", ok: null };
  if (!whatsappConfigurado()) return { erro: "Faltam as variáveis do WhatsApp na Vercel.", ok: null };
  const h = await headers();
  try {
    await reaplicarWebhook(`https://${h.get("x-forwarded-host") ?? h.get("host")}/api/whatsapp/webhook`);
  } catch (e) {
    return { erro: `O servidor do WhatsApp não respondeu: ${falha(e)}`, ok: null };
  }
  return { erro: null, ok: "Ligação atualizada. Os tiques de entregue e lido passam a aparecer nas próximas mensagens." };
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
    await supabase.from("conversas").update({ aguardando_resposta: false }).eq("id", dados.conversaId);
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
  const provisorio = (de.origem ?? "").toUpperCase() === "WHATSAPP" && !de.pasta_drive_id && !casosDe;

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

/** Cadastra um contato novo (nome + WhatsApp) e abre a conversa com ele. */
export async function criarContato(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const nome = String(f.get("nome") ?? "").trim();
  const telefone = String(f.get("telefone") ?? "").replace(/\D/g, "");
  if (!nome) return { erro: "Informe o nome.", ok: null };
  if (telefone.length < 10) return { erro: "Informe o WhatsApp com DDD.", ok: null };
  // Entra como contato; vira cliente pelo botão "Tornar cliente". Sem o script 012, já como cliente
  const novo = { nome: nome.toUpperCase(), telefone_whatsapp: telefone, origem: "ATENDIMENTO" };
  const inserir = (dados: Record<string, unknown>) => supabase.from("clientes").insert(dados).select("id").single();
  let { data, error } = await inserir({ ...novo, situacao: "contato", contato_tipo: TIPO_NOVO_CONTATO });
  if (error && semColunaContato(error.message)) ({ data, error } = await inserir(novo));
  if (error || !data) return { erro: /duplicate key/i.test(error?.message ?? "") ? "Esse WhatsApp já está na ficha de outro cliente; procure pelo nome acima." : error?.message ?? "Não foi possível cadastrar.", ok: null };
  redirect(`/atendimento?cliente=${data.id}`);
}

/** Lembrete deixado na conversa: vira uma tarefa ligada ao cliente, com você como responsável. */
export async function criarLembrete(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const clienteId = String(f.get("cliente_id") ?? "");
  const titulo = String(f.get("titulo") ?? "").trim();
  const vence = String(f.get("vence_em") ?? "").trim() || null;
  if (!titulo) return { erro: "Escreva o lembrete.", ok: null };
  const { error } = await supabase.from("tarefas").insert({ titulo, cliente_id: clienteId, responsavel_id: user.id, vence_em: vence });
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/atendimento");
  revalidatePath("/tarefas");
  return { erro: null, ok: "Lembrete criado (aparece também em Tarefas)." };
}

// ------------------------------------------------------------------ Notificações no celular/computador
export async function salvarInscricaoPush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { erro: "Inscrição inválida.", ok: null };
  const { error } = await supabase
    .from("push_inscricoes")
    .upsert({ perfil_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) return { erro: /relation|does not exist|schema cache/i.test(error.message) ? "Falta rodar o script supabase/008_avisos.sql no Supabase." : error.message, ok: null };
  return { erro: null, ok: "Notificações ligadas neste aparelho." };
}

export async function removerInscricaoPush(endpoint: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
  return { erro: null, ok: "Notificações desligadas neste aparelho." };
}

/** Procura clientes pelo nome, CPF ou telefone ("Vincular a cliente" e "Nova conversa"), sem baixar a lista inteira. */
export async function procurarClientes(bruto: string): Promise<{ id: string; nome: string; cpf_cnpj: string | null; telefone_whatsapp: string | null }[]> {
  const { supabase, papel } = await quemSou();
  if (!papel) return [];
  const q = bruto.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return [];
  const d = q.replace(/\D/g, "");
  const filtros = [`nome.ilike.%${q}%`];
  if (d.length >= 3) filtros.push(`cpf_cnpj.ilike.%${d.split("").join("%")}%`);
  if (d.length >= 4) filtros.push(`telefone_whatsapp.ilike.%${d}%`);
  const { data } = await supabase.from("clientes").select("id, nome, cpf_cnpj, telefone_whatsapp").or(filtros.join(",")).order("nome").limit(8);
  return data ?? [];
}

// ------------------------------------------------------------------ Apagar e editar mensagens
const SEM_COLUNAS_015 = "Falta rodar o script supabase/015_mensagens_apagadas_editadas.sql no Supabase.";
const traduzir015 = (msg: string) => (/apagada_|editada_em|texto_original|column|schema cache/i.test(msg) ? SEM_COLUNAS_015 : msg);
const LIMITE_EDITAR_MIN = 15; // o WhatsApp só deixa editar nos primeiros 15 minutos
const LIMITE_APAGAR_H = 48; // e apagar para todos por cerca de 2 dias

type MsgDoEscritorio = {
  id: string; conversa_id: string; direcao: string; nota_interna: boolean; enviada_pelo_bot: boolean; whatsapp_id: string | null;
  texto: string | null; midia_tipo: string | null; criado_em: string; texto_original?: string | null; conversas: unknown;
};

async function mensagemDoEscritorio(id: string) {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão." } as const;
  const { data } = await supabase
    .from("mensagens")
    .select("id, conversa_id, direcao, nota_interna, enviada_pelo_bot, whatsapp_id, texto, midia_tipo, criado_em, conversas(clientes(telefone_whatsapp))")
    .eq("id", id)
    .maybeSingle();
  const m = data as unknown as MsgDoEscritorio | null;
  if (!m) return { erro: "Mensagem não encontrada." } as const;
  if (m.direcao !== "saida") return { erro: "Só dá para apagar ou editar mensagens enviadas pelo escritório." } as const;
  const telefone = um(um(m.conversas as Rel<{ clientes: Rel<{ telefone_whatsapp: string | null }> }>)?.clientes ?? null)?.telefone_whatsapp ?? null;
  return { supabase, m, telefone } as const;
}

/** Apaga uma mensagem do escritório: para todos no WhatsApp e marcada como apagada no CRM. Nota interna só some do CRM. */
export async function apagarMensagem(id: string): Promise<Resultado> {
  const r = await mensagemDoEscritorio(id);
  if ("erro" in r) return { erro: r.erro ?? "Erro.", ok: null };
  const { supabase, m, telefone } = r;
  if (!m.nota_interna) {
    if (!m.whatsapp_id || !telefone) return { erro: "Esta mensagem não tem registro no WhatsApp para apagar.", ok: null };
    if (Date.now() - new Date(m.criado_em).getTime() > LIMITE_APAGAR_H * 3_600_000) {
      return { erro: "O WhatsApp só deixa apagar para todos até uns 2 dias depois do envio.", ok: null };
    }
    try {
      await apagarParaTodos(telefone, m.whatsapp_id);
    } catch (e) {
      return { erro: `Não consegui apagar no WhatsApp: ${falha(e)}`, ok: null };
    }
  }
  const { error } = await supabase.from("mensagens").update({ apagada_em: new Date().toISOString(), apagada_por: "escritorio" }).eq("id", id);
  if (error) return { erro: m.nota_interna ? traduzir015(error.message) : `Apagada no WhatsApp, mas o CRM não registrou: ${traduzir015(error.message)}`, ok: null };
  revalidatePath("/atendimento");
  return { erro: null, ok: m.nota_interna ? "Nota apagada." : "Mensagem apagada para todos." };
}

/** Edita o texto de uma mensagem do escritório (no WhatsApp até 15 min depois; nota interna, a qualquer hora). */
export async function editarMensagem(id: string, novoTexto: string): Promise<Resultado> {
  const texto = novoTexto.replace(/\r\n/g, "\n").trim();
  if (!texto) return { erro: "A mensagem não pode ficar vazia.", ok: null };
  const r = await mensagemDoEscritorio(id);
  if ("erro" in r) return { erro: r.erro ?? "Erro.", ok: null };
  const { supabase, m, telefone } = r;
  if (texto === m.texto) return { erro: null, ok: "Nada mudou." };
  if (!m.nota_interna) {
    if (m.midia_tipo) return { erro: "Por enquanto só dá para editar mensagens de texto.", ok: null };
    if (!m.whatsapp_id || !telefone) return { erro: "Esta mensagem não tem registro no WhatsApp para editar.", ok: null };
    if (Date.now() - new Date(m.criado_em).getTime() > LIMITE_EDITAR_MIN * 60_000) {
      return { erro: `O WhatsApp só deixa editar nos primeiros ${LIMITE_EDITAR_MIN} minutos.`, ok: null };
    }
    try {
      await editarNoWhatsApp(telefone, m.whatsapp_id, texto);
    } catch (e) {
      return { erro: `Não consegui editar no WhatsApp: ${falha(e)}`, ok: null };
    }
  }
  const { data: atual } = await supabase.from("mensagens").select("texto_original").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("mensagens")
    .update({ texto, texto_original: atual?.texto_original ?? m.texto, editada_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { erro: m.nota_interna ? traduzir015(error.message) : `Editada no WhatsApp, mas o CRM não registrou: ${traduzir015(error.message)}`, ok: null };
  revalidatePath("/atendimento");
  return { erro: null, ok: "Mensagem editada." };
}

// ------------------------------------------------------------------ Histórico de conversas antigas
// O servidor do WhatsApp (Evolution) guarda as mensagens que o celular manda ao conectar. Daqui elas
// entram no CRM direto no banco: sem triagem automática, sem notificação e sem duplicar (whatsapp_id).
async function soAdmin() {
  const { papel } = await quemSou();
  if (papel !== "administrador") return "Só o administrador importa o histórico.";
  if (!whatsappConfigurado()) return "Faltam as variáveis do WhatsApp na Vercel.";
  return null;
}

/** Passo 1: pede ao WhatsApp o histórico completo (vale na próxima conexão pelo QR Code). */
export async function prepararHistorico(): Promise<Resultado> {
  const erro = await soAdmin();
  if (erro) return { erro, ok: null };
  try {
    await pedirHistoricoCompleto();
  } catch (e) {
    return { erro: `O servidor do WhatsApp não respondeu: ${falha(e)}`, ok: null };
  }
  return { erro: null, ok: "Pronto. Agora desconecte e conecte o WhatsApp de novo (lendo o QR Code) para o celular mandar o histórico." };
}

/** Passo 2a: lista as conversas individuais que o servidor do WhatsApp tem guardadas. */
export async function listarConversasAntigas(): Promise<{ erro: string | null; conversas: { jid: string; nome: string | null }[] }> {
  const erro = await soAdmin();
  if (erro) return { erro, conversas: [] };
  try {
    return { erro: null, conversas: await conversasNoServidor() };
  } catch (e) {
    return { erro: `O servidor do WhatsApp não respondeu: ${falha(e)}`, conversas: [] };
  }
}

/** Passo 2b: traz as mensagens de uma conversa antiga para o CRM. Pode rodar de novo: o que já veio é pulado. */
export async function importarConversaAntiga(jid: string, nome: string | null): Promise<{ erro: string | null; novas: number }> {
  const erro = await soAdmin();
  if (erro) return { erro, novas: 0 };
  const db = supabaseAdmin();
  try {
    // Até 2.000 mensagens por conversa (10 páginas de 200), da mais nova para a mais antiga
    const lidas = [];
    for (let pagina = 1; pagina <= 10; pagina++) {
      const { registros, paginas } = await mensagensNoServidor(jid, pagina);
      for (const r of registros) {
        const m = lerMensagem(r);
        if (m) lidas.push(m);
      }
      if (pagina >= paginas) break;
    }
    if (!lidas.length) return { erro: null, novas: 0 };

    // Cliente: acha pelo telefone; se não existir, entra como contato
    const numero = lidas[0].numero;
    let cliente = await acharCliente(db, numero);
    if (!cliente) {
      const nomeContato = (lidas.find((m) => m.nomeContato)?.nomeContato ?? nome ?? numero).toUpperCase();
      const novo = { nome: nomeContato, telefone_whatsapp: numero, origem: "WHATSAPP" };
      const inserir = (dados: Record<string, unknown>) => db.from("clientes").insert(dados).select("id, nome, telefone_whatsapp, area_id").single();
      let { data, error } = await inserir({ ...novo, situacao: "contato", contato_tipo: TIPO_NOVO_CONTATO });
      if (error && semColunaContato(error.message)) ({ data, error } = await inserir(novo));
      if (error || !data) return { erro: error?.message ?? "Não consegui cadastrar o contato.", novas: 0 };
      cliente = data;
    }

    // Só o que ainda não está no CRM
    const ids = lidas.map((m) => m.whatsappId);
    const jaTem = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db.from("mensagens").select("whatsapp_id").in("whatsapp_id", ids.slice(i, i + 300));
      (data ?? []).forEach((x) => x.whatsapp_id && jaTem.add(x.whatsapp_id));
    }
    const novas = lidas.filter((m) => !jaTem.has(m.whatsappId));
    if (!novas.length) return { erro: null, novas: 0 };

    // Conversa: a mais recente do cliente; sem nenhuma, cria uma já encerrada (é histórico)
    const ultima = novas.reduce((a, m) => (m.em > a ? m.em : a), novas[0].em);
    const { data: existente } = await db.from("conversas").select("id, ultima_mensagem_em").eq("cliente_id", cliente.id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    let conversaId = existente?.id as string | undefined;
    if (!conversaId) {
      const primeira = novas.reduce((a, m) => (m.em < a ? m.em : a), novas[0].em);
      const { data, error } = await db
        .from("conversas")
        .insert({ cliente_id: cliente.id, numero_conexao: INSTANCIA, status: "resolvida", area_id: cliente.area_id, ultima_mensagem_em: ultima, criado_em: primeira })
        .select("id")
        .single();
      if (error || !data) return { erro: error?.message ?? "Não consegui criar a conversa.", novas: 0 };
      conversaId = data.id;
    } else if (!existente?.ultima_mensagem_em || existente.ultima_mensagem_em < ultima) {
      await db.from("conversas").update({ ultima_mensagem_em: ultima }).eq("id", conversaId);
    }

    for (let i = 0; i < novas.length; i += 500) {
      const { error } = await db.from("mensagens").upsert(
        novas.slice(i, i + 500).map((m) => ({
          conversa_id: conversaId,
          direcao: m.deMim ? "saida" : "entrada",
          texto: m.texto,
          midia_tipo: m.midiaTipo,
          midia_nome: m.midiaNome,
          whatsapp_id: m.whatsappId,
          criado_em: m.em,
        })),
        { onConflict: "whatsapp_id", ignoreDuplicates: true },
      );
      if (error) return { erro: error.message, novas: i };
    }
    return { erro: null, novas: novas.length };
  } catch (e) {
    return { erro: falha(e), novas: 0 };
  }
}
