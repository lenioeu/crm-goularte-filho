"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { criarPastaCliente } from "@/app/(app)/integracoes/actions";
import { advogadosDaEquipe, carregarCliente, dadosDoEscritorio, escolherAdvogados, listarModelos } from "@/lib/documentos";
import { conversaAberta } from "@/lib/atendimento";
import { enviarArquivo, exportarPdf, tokenDeAcesso } from "@/lib/google";
import { camposDoModelo, emHtml, renderizar } from "@/lib/modelos";
import { quemSou } from "@/lib/permissoes";
import { TZ } from "@/lib/rotulos";
import { enviarMidia, whatsappConfigurado } from "@/lib/whatsapp";

const txt = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

type Gerado = { erro: string; ok?: undefined } | { erro?: undefined; ok: { docId: string; url: string; nome: string; clienteId: string } };

/** Monta o documento com os dados do formulário e grava como Google Docs na pasta do cliente. */
async function gerarNoDrive(f: FormData): Promise<Gerado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão." };
  const clienteId = String(f.get("cliente_id") ?? "");
  const { modelos } = await listarModelos(supabase);
  const modelo = modelos.find((m) => m.id === String(f.get("modelo") ?? ""));
  if (!modelo) return { erro: "Modelo não encontrado. Recarregue a página." };
  const campos = camposDoModelo(modelo.conteudo);
  const extra = Object.fromEntries(campos.map((c) => [c.chave, String(f.get(`campo_${c.chave}`) ?? "")]));
  const faltaCampo = campos.find((c) => !c.opcional && !extra[c.chave].trim());
  if (faltaCampo) return { erro: `Preencha “${faltaCampo.rotulo}”.` };
  const data = txt(f, "data") ?? new Date().toLocaleDateString("sv-SE", { timeZone: TZ });

  const { cliente, erro } = await carregarCliente(supabase, clienteId);
  if (erro || !cliente) return { erro: erro ?? "Cliente não encontrado." };
  const [equipe, escritorio] = await Promise.all([advogadosDaEquipe(supabase), dadosDoEscritorio(supabase)]);
  const advogados = escolherAdvogados(equipe, f.getAll("advogado").map(String));

  const token = await tokenDeAcesso();
  if (!token) return { erro: "A conta Google do escritório não está conectada. Use “Imprimir” enquanto isso." };
  let pastaId = (cliente as unknown as { pasta_drive_id: string | null }).pasta_drive_id;
  if (!pastaId) {
    const r = await criarPastaCliente(clienteId);
    if (r.erro) return { erro: r.erro };
    const { data: c } = await supabase.from("clientes").select("pasta_drive_id").eq("id", clienteId).maybeSingle();
    pastaId = c?.pasta_drive_id ?? null;
    if (!pastaId) return { erro: "Não consegui achar a pasta do cliente." };
  }

  const html = emHtml(renderizar(modelo.conteudo, { cliente, advogados, escritorio, data, extra }), escritorio, modelo.rodape !== false);
  const nome = `${data} ${modelo.arquivo} - ${cliente.nome.toUpperCase()}`;
  try {
    const salvo = await enviarArquivo(token, {
      nome,
      mimetype: "text/html; charset=UTF-8",
      base64: Buffer.from(html, "utf8").toString("base64"),
      paiId: pastaId,
      converterPara: "application/vnd.google-apps.document",
    });
    const url = salvo.webViewLink ?? `https://docs.google.com/document/d/${salvo.id}/edit`;
    await supabase.from("documentos").insert({
      cliente_id: clienteId,
      nome_salvo: nome,
      tipo_documento: modelo.arquivo,
      drive_file_id: salvo.id,
      drive_url: url,
      salvo_por: user.id,
    });
    revalidatePath(`/clientes/${clienteId}`);
    return { ok: { docId: salvo.id, url, nome, clienteId } };
  } catch (e) {
    return { erro: `Não consegui salvar no Drive: ${e instanceof Error ? e.message : e}` };
  }
}

/** Gera o documento e salva como Google Docs na pasta do cliente. */
export async function gerarDocumento(_: Resultado, f: FormData): Promise<Resultado> {
  const r = await gerarNoDrive(f);
  if (r.erro) return { erro: r.erro, ok: null };
  return { erro: null, ok: `Salvo na pasta do cliente como “${r.ok!.nome}”. Abra pela ficha para revisar antes de assinar.` };
}

/** Gera, salva no Drive e manda o PDF para o cliente pelo WhatsApp, na conversa aberta. */
export async function enviarDocumentoWhatsApp(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  if (!whatsappConfigurado()) return { erro: "O WhatsApp do escritório ainda não está ligado ao sistema.", ok: null };
  const clienteId = String(f.get("cliente_id") ?? "");
  const { data: cli } = await supabase.from("clientes").select("telefone_whatsapp, area_id").eq("id", clienteId).maybeSingle();
  if (!cli?.telefone_whatsapp) return { erro: "O cliente não tem WhatsApp cadastrado.", ok: null };

  const r = await gerarNoDrive(f);
  if (r.erro) return { erro: r.erro, ok: null };
  const { docId, nome } = r.ok!;
  try {
    const token = await tokenDeAcesso();
    const pdf = await exportarPdf(token!, docId);
    const conversa = await conversaAberta(supabase, { id: clienteId, area_id: cli.area_id }, "aguardando");
    const caminho = `${conversa.id}/${Date.now()}-documento.pdf`;
    const { error } = await supabase.storage.from("whatsapp").upload(caminho, pdf, { contentType: "application/pdf" });
    if (error) throw new Error(/bucket|not found/i.test(error.message) ? "falta rodar o script supabase/007_arquivos_whatsapp.sql" : error.message);
    const { data: link } = await supabase.storage.from("whatsapp").createSignedUrl(caminho, 60 * 60);
    if (!link) throw new Error("não consegui criar o link do arquivo");
    const legenda = String(f.get("legenda") ?? "").trim() || undefined;
    const whatsappId = await enviarMidia(cli.telefone_whatsapp, { url: link.signedUrl, mimetype: "application/pdf", nome: `${nome}.pdf`, legenda });
    await supabase.from("mensagens").insert({
      conversa_id: conversa.id,
      direcao: "saida",
      autor_id: user.id,
      texto: legenda ?? null,
      midia_tipo: "documento",
      midia_nome: `${nome}.pdf`,
      arquivo_caminho: caminho,
      whatsapp_id: whatsappId,
    });
    await supabase.from("conversas").update({ ultima_mensagem_em: new Date().toISOString() }).eq("id", conversa.id);
    await supabase.from("conversas").update({ aguardando_resposta: false }).eq("id", conversa.id);
  } catch (e) {
    return { erro: `Salvei no Drive, mas não consegui mandar pelo WhatsApp: ${e instanceof Error ? e.message : e}`, ok: null };
  }
  revalidatePath("/atendimento");
  return { erro: null, ok: `Enviado pelo WhatsApp em PDF e salvo na pasta como “${nome}”.` };
}

/** Endereço, contatos, foro e conta para pagamento, usados em todos os modelos. Só o administrador altera. */
export async function salvarEscritorio(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador altera os dados do escritório.", ok: null };
  const valor = Object.fromEntries(["endereco", "telefone", "email", "cidade", "foro", "pagamento"].map((k) => [k, String(f.get(k) ?? "").trim()]));
  const { error } = await supabase.from("configuracoes").upsert({ chave: "escritorio_documentos", valor });
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/clientes");
  return { erro: null, ok: "Dados do escritório salvos." };
}

/** Dados de qualificação do cliente (RG, estado civil, endereço…). */
export async function atualizarQualificacao(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const id = String(f.get("id") ?? "");
  const genero = txt(f, "genero");
  const { error } = await supabase
    .from("clientes")
    .update({
      rg: txt(f, "rg")?.toUpperCase() ?? null,
      nacionalidade: txt(f, "nacionalidade")?.toUpperCase() ?? null,
      estado_civil: txt(f, "estado_civil")?.toUpperCase() ?? null,
      profissao: txt(f, "profissao")?.toUpperCase() ?? null,
      endereco: txt(f, "endereco")?.toUpperCase() ?? null,
      cep: txt(f, "cep"),
      genero: genero === "m" || genero === "f" ? genero : null,
    })
    .eq("id", id);
  if (error) return { erro: /column|coluna/i.test(error.message) ? "Falta rodar o script supabase/004_modelos.sql no Supabase." : error.message, ok: null };
  revalidatePath(`/clientes/${id}`);
  return { erro: null, ok: "Qualificação salva." };
}
