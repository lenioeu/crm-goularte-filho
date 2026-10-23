"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { listarPastas, normalizar, obterOuCriarPasta, procurarPastaClientes, tokenDeAcesso } from "@/lib/google";
import { quemSou } from "@/lib/permissoes";
import { supabaseAdmin } from "@/lib/supabase/admin";

type PastaConfig = { id: string; url: string | null; caminho: string };

async function pastaClientes(): Promise<PastaConfig | null> {
  const { supabase } = await quemSou();
  const { data } = await supabase.from("configuracoes").select("valor").eq("chave", "pasta_clientes").maybeSingle();
  return (data?.valor as PastaConfig | undefined) ?? null;
}

export async function procurarPastaDeNovo(): Promise<Resultado> {
  const { papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador pode fazer isso.", ok: null };
  const token = await tokenDeAcesso();
  if (!token) return { erro: "Conecte a conta Google primeiro.", ok: null };
  const pasta = await procurarPastaClientes(token);
  if (!pasta) return { erro: "Não achei a pasta “Goularte Filho › Clientes” no Meu Drive.", ok: null };
  await supabaseAdmin()
    .from("configuracoes")
    .upsert({ chave: "pasta_clientes", valor: { id: pasta.id, url: pasta.webViewLink ?? null, caminho: pasta.caminho }, atualizado_em: new Date().toISOString() });
  revalidatePath("/integracoes");
  return { erro: null, ok: `Pasta encontrada: ${pasta.caminho}.` };
}

/** Lê Clientes › ÁREA › NOME no Drive: vincula quem já existe e cadastra quem falta. */
export async function importarClientesDoDrive(_: Resultado, _f: FormData): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador pode importar.", ok: null };
  const token = await tokenDeAcesso();
  if (!token) return { erro: "Conecte a conta Google primeiro.", ok: null };
  const raiz = await pastaClientes();
  if (!raiz) return { erro: "Defina a pasta de clientes primeiro (“Procurar a pasta de novo”).", ok: null };

  try {
    const [{ data: areas }, { data: clientes }] = await Promise.all([
      supabase.from("areas").select("id, nome"),
      supabase.from("clientes").select("id, nome, pasta_drive_id, area_id").limit(10000),
    ]);
    const areaPorNome = new Map((areas ?? []).map((a) => [normalizar(a.nome), a.id as string]));
    const clientePorNome = new Map((clientes ?? []).map((c) => [normalizar(c.nome), c]));

    const novos: Record<string, unknown>[] = [];
    let vinculados = 0;
    const ignoradas: string[] = [];

    for (const pastaArea of await listarPastas(token, raiz.id)) {
      const areaId = areaPorNome.get(normalizar(pastaArea.name));
      if (!areaId) {
        ignoradas.push(pastaArea.name);
        continue;
      }
      for (const p of await listarPastas(token, pastaArea.id)) {
        const chave = normalizar(p.name);
        const existente = clientePorNome.get(chave);
        if (existente) {
          if (!existente.pasta_drive_id) {
            await supabase
              .from("clientes")
              .update({ pasta_drive_id: p.id, pasta_drive_url: p.webViewLink ?? null, area_id: existente.area_id ?? areaId })
              .eq("id", existente.id);
            vinculados++;
          }
        } else {
          novos.push({ nome: p.name.trim().toUpperCase(), area_id: areaId, pasta_drive_id: p.id, pasta_drive_url: p.webViewLink ?? null, origem: "IMPORTADO DO DRIVE" });
          clientePorNome.set(chave, { id: "", nome: p.name, pasta_drive_id: p.id, area_id: areaId });
        }
      }
    }

    for (let i = 0; i < novos.length; i += 500) {
      const { error } = await supabase.from("clientes").insert(novos.slice(i, i + 500));
      if (error) return { erro: `Parei no meio da importação: ${error.message}`, ok: null };
    }

    revalidatePath("/clientes");
    revalidatePath("/integracoes");
    revalidatePath("/");
    const extra = ignoradas.length ? ` Pastas que não são áreas e ficaram de fora: ${ignoradas.join(", ")}.` : "";
    return { erro: null, ok: `${novos.length} clientes cadastrados a partir do Drive e ${vinculados} vinculados a cadastros que já existiam.${extra}` };
  } catch (e) {
    return { erro: `O Google não respondeu como esperado: ${e instanceof Error ? e.message : e}`, ok: null };
  }
}

export async function desconectarGoogle(): Promise<Resultado> {
  const { papel } = await quemSou();
  if (papel !== "administrador") return { erro: "Só o administrador pode desconectar.", ok: null };
  const admin = supabaseAdmin();
  await admin.from("google_conexao").delete().eq("id", 1);
  await admin.from("configuracoes").delete().eq("chave", "google_email");
  revalidatePath("/integracoes");
  return { erro: null, ok: "Conta Google desconectada." };
}

/** Cria Clientes › ÁREA › NOME DO CLIENTE (qualquer pessoa da equipe pode). */
export async function criarPastaCliente(clienteId: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const token = await tokenDeAcesso();
  if (!token) return { erro: "A conta Google do escritório não está conectada.", ok: null };
  const raiz = await pastaClientes();
  if (!raiz) return { erro: "A pasta de clientes ainda não foi definida em Integrações.", ok: null };

  const { data: c } = await supabase.from("clientes").select("nome, areas(nome)").eq("id", clienteId).maybeSingle();
  if (!c) return { erro: "Cliente não encontrado.", ok: null };
  const rel = c.areas as { nome: string } | { nome: string }[] | null;
  const area = Array.isArray(rel) ? rel[0]?.nome : rel?.nome;
  if (!area) return { erro: "Defina a área do cliente antes de criar a pasta.", ok: null };

  try {
    const pastaArea = await obterOuCriarPasta(token, area.toUpperCase(), raiz.id);
    const pasta = await obterOuCriarPasta(token, c.nome.toUpperCase(), pastaArea.id);
    const { error } = await supabase.from("clientes").update({ pasta_drive_id: pasta.id, pasta_drive_url: pasta.webViewLink ?? null }).eq("id", clienteId);
    if (error) return { erro: error.message, ok: null };
  } catch (e) {
    return { erro: `Não consegui criar a pasta: ${e instanceof Error ? e.message : e}`, ok: null };
  }
  revalidatePath("/clientes");
  return { erro: null, ok: "Pasta criada." };
}
