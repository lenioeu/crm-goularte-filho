"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { criarPastaCliente } from "@/app/(app)/integracoes/actions";
import { advogadosDaEquipe, carregarCliente, dadosDoEscritorio, escolherAdvogados } from "@/lib/documentos";
import { enviarArquivo, tokenDeAcesso } from "@/lib/google";
import { emHtml, modeloPorId } from "@/lib/modelos";
import { quemSou } from "@/lib/permissoes";
import { TZ } from "@/lib/rotulos";

const txt = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Gera o documento e salva como Google Docs na pasta do cliente. */
export async function gerarDocumento(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const clienteId = String(f.get("cliente_id") ?? "");
  const modelo = modeloPorId(String(f.get("modelo") ?? ""));
  const extra = Object.fromEntries(modelo.campos.map((c) => [c.nome, String(f.get(c.nome) ?? "")]));
  const faltaCampo = modelo.campos.find((c) => c.obrigatorio && !extra[c.nome].trim());
  if (faltaCampo) return { erro: `Preencha “${faltaCampo.rotulo}”.`, ok: null };
  const data = txt(f, "data") ?? new Date().toLocaleDateString("sv-SE", { timeZone: TZ });

  const { cliente, erro } = await carregarCliente(supabase, clienteId);
  if (erro || !cliente) return { erro: erro ?? "Cliente não encontrado.", ok: null };
  const [equipe, escritorio] = await Promise.all([advogadosDaEquipe(supabase), dadosDoEscritorio(supabase)]);
  const advogados = escolherAdvogados(equipe, f.getAll("advogado").map(String));

  const token = await tokenDeAcesso();
  if (!token) return { erro: "A conta Google do escritório não está conectada. Use “Imprimir” enquanto isso.", ok: null };
  let pastaId = (cliente as unknown as { pasta_drive_id: string | null }).pasta_drive_id;
  if (!pastaId) {
    const r = await criarPastaCliente(clienteId);
    if (r.erro) return r;
    const { data: c } = await supabase.from("clientes").select("pasta_drive_id").eq("id", clienteId).maybeSingle();
    pastaId = c?.pasta_drive_id ?? null;
    if (!pastaId) return { erro: "Não consegui achar a pasta do cliente.", ok: null };
  }

  const html = emHtml(modelo.gerar({ cliente, advogados, escritorio, data, extra }), escritorio);
  const nome = `${data} ${modelo.arquivo} - ${cliente.nome.toUpperCase()}`;
  try {
    const salvo = await enviarArquivo(token, {
      nome,
      mimetype: "text/html; charset=UTF-8",
      base64: Buffer.from(html, "utf8").toString("base64"),
      paiId: pastaId,
      converterPara: "application/vnd.google-apps.document",
    });
    await supabase.from("documentos").insert({
      cliente_id: clienteId,
      nome_salvo: nome,
      tipo_documento: modelo.arquivo,
      drive_file_id: salvo.id,
      drive_url: salvo.webViewLink ?? `https://docs.google.com/document/d/${salvo.id}/edit`,
      salvo_por: user.id,
    });
  } catch (e) {
    return { erro: `Não consegui salvar no Drive: ${e instanceof Error ? e.message : e}`, ok: null };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { erro: null, ok: `Salvo na pasta do cliente como “${nome}”. Abra pela ficha para revisar antes de assinar.` };
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
      rg: txt(f, "rg"),
      nacionalidade: txt(f, "nacionalidade")?.toLowerCase() ?? null,
      estado_civil: txt(f, "estado_civil")?.toLowerCase() ?? null,
      profissao: txt(f, "profissao")?.toLowerCase() ?? null,
      endereco: txt(f, "endereco"),
      cep: txt(f, "cep"),
      genero: genero === "m" || genero === "f" ? genero : null,
    })
    .eq("id", id);
  if (error) return { erro: /column|coluna/i.test(error.message) ? "Falta rodar o script supabase/004_modelos.sql no Supabase." : error.message, ok: null };
  revalidatePath(`/clientes/${id}`);
  return { erro: null, ok: "Qualificação salva." };
}
