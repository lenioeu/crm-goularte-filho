"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { camposDoResumo, consultarDataJud, formatarCNJ, numerosCNJNoTexto, somenteDigitos, validarCNJ } from "@/lib/datajud";
import { listarNomesDeArquivos, tokenDeAcesso } from "@/lib/google";
import { lerLista, sugerir, type Sugestao } from "@/lib/importarProcessos";
import { quemSou } from "@/lib/permissoes";

type Db = Awaited<ReturnType<typeof quemSou>>["supabase"];

/** Cadastra um processo já validado: consulta o DataJud e, sem caso escolhido, cria um para o cliente. */
async function registrar(supabase: Db, userId: string, numero: string, casoId: string, clienteId: string, parteContraria?: string): Promise<Resultado> {
  let campos: Record<string, unknown> = {};
  let aviso = "";
  try {
    const r = await consultarDataJud(numero);
    if (r) campos = camposDoResumo(r);
    else aviso = " O DataJud ainda não tem esse processo (ou ele é sigiloso); vou tentar de novo nas atualizações diárias.";
  } catch (e) {
    aviso = ` Não consegui consultar o DataJud agora (${e instanceof Error ? e.message : e}).`;
  }

  // Sem caso escolhido: cria um para o cliente, já como contrato assinado, com o nome da ação
  let casoNovo = false;
  if (!casoId) {
    const { data: cli } = await supabase.from("clientes").select("area_id").eq("id", clienteId).maybeSingle();
    if (!cli) return { erro: "Cliente não encontrado.", ok: null };
    const { data: caso, error: erroCaso } = await supabase
      .from("casos")
      .insert({
        cliente_id: clienteId,
        area_id: cli.area_id,
        titulo: (campos.classe as string | undefined) ?? `Processo ${formatarCNJ(numero)}`,
        etapa: "contrato_assinado",
        responsavel_id: userId,
        parte_contraria: parteContraria?.trim() || null,
      })
      .select("id")
      .single();
    if (erroCaso) return { erro: erroCaso.message, ok: null };
    casoId = caso.id;
    casoNovo = true;
  }

  const { error } = await supabase.from("processos").insert({ caso_id: casoId, numero_cnj: formatarCNJ(numero), ...campos });
  if (error) {
    if (casoNovo) await supabase.from("casos").delete().eq("id", casoId);
    if (/duplicate key/i.test(error.message)) return { erro: "Esse processo já está cadastrado.", ok: null };
    if (/row-level security/i.test(error.message)) return { erro: "Você não tem permissão para esse caso.", ok: null };
    return { erro: error.message, ok: null };
  }
  return { erro: null, ok: `Processo ${formatarCNJ(numero)} cadastrado${casoNovo ? " (caso criado no funil, como contrato assinado)" : ""}.${aviso}` };
}

export async function cadastrarProcesso(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const casoId = String(f.get("caso_id") ?? "");
  const clienteId = String(f.get("cliente_id") ?? "");
  const numero = somenteDigitos(String(f.get("numero") ?? ""));
  if (!casoId && !clienteId) return { erro: "Escolha o cliente (ou um caso que já exista).", ok: null };
  if (numero.length !== 20) return { erro: "O número do processo precisa ter 20 dígitos (formato 0000000-00.0000.0.00.0000).", ok: null };
  if (!validarCNJ(numero)) return { erro: "Esse número não confere com os dígitos verificadores do CNJ. Confira se não houve erro de digitação.", ok: null };

  const r = await registrar(supabase, user.id, numero, casoId, clienteId);
  if (r.ok) {
    revalidatePath("/processos");
    revalidatePath("/atendimento");
    if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  }
  return r;
}

// ------------------------------------------------------------------ Procurar nas pastas do Drive
export type Achado = { clienteId: string; cliente: string; numero: string; arquivos: string[]; jaCadastrado: boolean; outrosClientes: string[] };

/** Percorre as pastas dos clientes no Drive e acha números de processo nos nomes dos arquivos. Não grava nada. */
export async function procurarNasPastas(): Promise<{ erro: string | null; achados: Achado[]; pastas: number }> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador" && papel !== "advogado") return { erro: "Só administradores e advogados fazem essa busca.", achados: [], pastas: 0 };
  const token = await tokenDeAcesso();
  if (!token) return { erro: "A conta Google do escritório não está conectada (Integrações).", achados: [], pastas: 0 };

  const { data: clientes } = await supabase.from("clientes").select("id, nome, pasta_drive_id").not("pasta_drive_id", "is", null).order("nome").limit(3000);
  const fila = [...(clientes ?? [])];
  const porCliente: { id: string; nome: string; numeros: Map<string, string[]> }[] = [];
  let falhas = 0;

  async function trabalhador() {
    for (let c = fila.shift(); c; c = fila.shift()) {
      try {
        const nomes = await listarNomesDeArquivos(token!, c.pasta_drive_id as string);
        const numeros = new Map<string, string[]>();
        for (const nome of nomes) for (const n of numerosCNJNoTexto(nome)) numeros.set(n, [...(numeros.get(n) ?? []), nome]);
        if (numeros.size) porCliente.push({ id: c.id, nome: c.nome, numeros });
      } catch {
        falhas++;
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, trabalhador));

  const todos = porCliente.flatMap((c) => [...c.numeros.keys()].map(formatarCNJ));
  const { data: existentes } = todos.length ? await supabase.from("processos").select("numero_cnj").in("numero_cnj", todos) : { data: [] };
  const cadastrados = new Set((existentes ?? []).map((p) => p.numero_cnj));
  const donos = new Map<string, string[]>();
  for (const c of porCliente) for (const n of c.numeros.keys()) donos.set(n, [...(donos.get(n) ?? []), c.nome]);

  const achados: Achado[] = porCliente
    .flatMap((c) =>
      [...c.numeros.entries()].map(([n, arquivos]) => ({
        clienteId: c.id,
        cliente: c.nome,
        numero: formatarCNJ(n),
        arquivos: arquivos.slice(0, 3),
        jaCadastrado: cadastrados.has(formatarCNJ(n)),
        outrosClientes: (donos.get(n) ?? []).filter((x) => x !== c.nome),
      })),
    )
    .sort((a, b) => a.cliente.localeCompare(b.cliente) || a.numero.localeCompare(b.numero));
  return { erro: falhas ? `${falhas} pasta(s) não puderam ser lidas; rode de novo para tentar outra vez.` : null, achados, pastas: clientes?.length ?? 0 };
}

/** Cadastra um lote de processos achados (o navegador manda de pouco em pouco). */
export async function cadastrarAchados(lote: { clienteId: string; numero: string }[]): Promise<{ ok: number; erros: { numero: string; erro: string }[] }> {
  const { supabase, user, papel } = await quemSou();
  if (!user || (papel !== "administrador" && papel !== "advogado")) return { ok: 0, erros: lote.map((x) => ({ numero: x.numero, erro: "Sem permissão." })) };
  let ok = 0;
  const erros: { numero: string; erro: string }[] = [];
  const fila = lote.slice(0, 30);
  async function trabalhador() {
    for (let x = fila.shift(); x; x = fila.shift()) {
      const d = somenteDigitos(x.numero);
      if (d.length !== 20 || !validarCNJ(d)) {
        erros.push({ numero: x.numero, erro: "número inválido" });
        continue;
      }
      const r = await registrar(supabase, user!.id, d, "", x.clienteId);
      if (r.erro) erros.push({ numero: x.numero, erro: r.erro });
      else ok++;
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabalhador));
  revalidatePath("/processos");
  revalidatePath("/funil");
  return { ok, erros };
}

async function sincronizar(ids?: string[]) {
  const { supabase } = await quemSou();
  let q = supabase.from("processos").select("id, numero_cnj").eq("arquivado", false).order("sincronizado_em", { ascending: true, nullsFirst: true }).limit(60);
  if (ids) q = q.in("id", ids);
  const { data } = await q;
  let atualizados = 0, sem = 0, falhas = 0;
  const fila = [...(data ?? [])];
  async function trabalhador() {
    for (let p = fila.shift(); p; p = fila.shift()) {
      try {
        const r = await consultarDataJud(somenteDigitos(p.numero_cnj));
        if (r) {
          await supabase.from("processos").update(camposDoResumo(r)).eq("id", p.id);
          atualizados++;
        } else {
          await supabase.from("processos").update({ sincronizado_em: new Date().toISOString() }).eq("id", p.id);
          sem++;
        }
      } catch {
        falhas++;
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, trabalhador));
  revalidatePath("/processos");
  return { atualizados, sem, falhas, total: data?.length ?? 0 };
}

export async function atualizarProcesso(id: string): Promise<Resultado> {
  const { papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const r = await sincronizar([id]);
  if (r.falhas) return { erro: "O DataJud não respondeu. Tente de novo em alguns minutos.", ok: null };
  if (r.sem) return { erro: null, ok: "O DataJud ainda não tem dados desse processo." };
  return { erro: null, ok: "Atualizado." };
}

export async function atualizarTodos(): Promise<Resultado> {
  const { papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const r = await sincronizar();
  if (r.total === 0) return { erro: null, ok: "Nenhum processo para atualizar." };
  const partes = [`${r.atualizados} atualizados`];
  if (r.sem) partes.push(`${r.sem} sem dados no DataJud`);
  if (r.falhas) partes.push(`${r.falhas} com falha`);
  return { erro: null, ok: partes.join(", ") + "." };
}

// ------------------------------------------------------------------ Importar lista (PJe ou planilha)
export type LinhaAnalisada = { numero: string; nome: string; parteContraria: string; jaCadastrado: boolean; sugestoes: Sugestao[]; escolhido: string };

/** Lê a lista colada e sugere o cliente de cada processo. Não grava nada. */
export async function analisarLista(texto: string): Promise<{ erro: string | null; linhas: LinhaAnalisada[]; clientes: { id: string; nome: string }[] }> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador" && papel !== "advogado") return { erro: "Só administradores e advogados importam processos.", linhas: [], clientes: [] };
  const lidas = lerLista(texto.slice(0, 500_000));
  if (!lidas.length) return { erro: "Não achei números de processo nesse texto.", linhas: [], clientes: [] };
  const [{ data: clientes }, { data: existentes }] = await Promise.all([
    supabase.from("clientes").select("id, nome").order("nome").limit(5000),
    supabase.from("processos").select("numero_cnj").in("numero_cnj", lidas.map((l) => l.numero)),
  ]);
  const ja = new Set((existentes ?? []).map((p) => p.numero_cnj));
  const lista = clientes ?? [];
  const linhas = lidas.map((l) => {
    const sugestoes = l.nome ? sugerir(l.nome, lista) : [];
    // Escolhe sozinho só quando a semelhança é alta e não há empate
    const certo = sugestoes[0] && sugestoes[0].nota >= 0.85 && (!sugestoes[1] || sugestoes[1].nota < sugestoes[0].nota) ? sugestoes[0].id : "";
    return { ...l, jaCadastrado: ja.has(l.numero), sugestoes, escolhido: ja.has(l.numero) ? "" : certo || (l.nome ? "novo" : "") };
  });
  return { erro: null, linhas, clientes: lista };
}

/** Cadastra um lote revisado. clienteId "novo" cria o cliente com o nome da lista. */
export async function cadastrarLista(
  lote: { numero: string; clienteId: string; nome: string; parteContraria: string }[],
): Promise<{ ok: number; erros: { numero: string; erro: string }[] }> {
  const { supabase, user, papel } = await quemSou();
  if (!user || (papel !== "administrador" && papel !== "advogado")) return { ok: 0, erros: lote.map((x) => ({ numero: x.numero, erro: "Sem permissão." })) };
  let ok = 0;
  const erros: { numero: string; erro: string }[] = [];
  const criados = new Map<string, string>(); // mesmo nome novo em dois processos = um cliente só
  for (const x of lote.slice(0, 30)) {
    const d = somenteDigitos(x.numero);
    if (d.length !== 20 || !validarCNJ(d)) {
      erros.push({ numero: x.numero, erro: "número inválido" });
      continue;
    }
    let clienteId = x.clienteId;
    if (clienteId === "novo") {
      const nome = x.nome.trim().toUpperCase();
      if (!nome) {
        erros.push({ numero: x.numero, erro: "sem nome para criar o cliente" });
        continue;
      }
      clienteId = criados.get(nome) ?? "";
      if (!clienteId) {
        const { data: existente } = await supabase.from("clientes").select("id").eq("nome", nome).limit(1).maybeSingle();
        if (existente) clienteId = existente.id;
        else {
          const { data, error } = await supabase.from("clientes").insert({ nome, origem: "IMPORTADO DO PJE" }).select("id").single();
          if (error) {
            erros.push({ numero: x.numero, erro: error.message });
            continue;
          }
          clienteId = data.id;
        }
        criados.set(nome, clienteId);
      }
    }
    const r = await registrar(supabase, user.id, d, "", clienteId, x.parteContraria);
    if (r.erro) erros.push({ numero: x.numero, erro: r.erro });
    else ok++;
  }
  revalidatePath("/processos");
  revalidatePath("/clientes");
  revalidatePath("/funil");
  return { ok, erros };
}
