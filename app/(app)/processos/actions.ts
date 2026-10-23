"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { camposDoResumo, consultarDataJud, formatarCNJ, somenteDigitos, validarCNJ } from "@/lib/datajud";
import { quemSou } from "@/lib/permissoes";

export async function cadastrarProcesso(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  let casoId = String(f.get("caso_id") ?? "");
  const clienteId = String(f.get("cliente_id") ?? "");
  const numero = somenteDigitos(String(f.get("numero") ?? ""));
  if (!casoId && !clienteId) return { erro: "Escolha o cliente (ou um caso que já exista).", ok: null };
  if (numero.length !== 20) return { erro: "O número do processo precisa ter 20 dígitos (formato 0000000-00.0000.0.00.0000).", ok: null };
  if (!validarCNJ(numero)) return { erro: "Esse número não confere com os dígitos verificadores do CNJ. Confira se não houve erro de digitação.", ok: null };

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
        responsavel_id: user.id,
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
  revalidatePath("/processos");
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  return { erro: null, ok: `Processo ${formatarCNJ(numero)} cadastrado${casoNovo ? " (caso criado no funil, como contrato assinado)" : ""}.${aviso}` };
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
