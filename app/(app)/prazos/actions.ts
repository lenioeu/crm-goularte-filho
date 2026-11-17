"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { lerFeriadosLocais } from "@/lib/feriadosLocais";
import { atualizarEvento, criarEvento, excluirEvento, tokenDeAcesso } from "@/lib/google";
import { quemSou } from "@/lib/permissoes";
import { calcularVencimento, type Contagem, dataBR, diasSemExpediente, feriadosSugeridos, prazoInterno } from "@/lib/prazos";

const SEM_TABELA = "Falta rodar o script supabase/018_prazos.sql no Supabase.";
const traduzir = (msg: string) => (/prazos|feriados|does not exist|schema cache/i.test(msg) ? SEM_TABELA : msg);
type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);

function atualizarTelas() {
  revalidatePath("/prazos");
  revalidatePath("/publicacoes");
  revalidatePath("/");
}

/** Lê e confere os campos do formulário de prazo e calcula fatal e interno com os feriados do escritório. */
async function lerFormulario(f: FormData, db: Awaited<ReturnType<typeof quemSou>>["supabase"]) {
  const descricao = String(f.get("descricao") ?? "").trim();
  const publicado = String(f.get("publicado_em") ?? "");
  const dias = Math.round(Number(f.get("dias")));
  const contagem: Contagem = f.get("contagem") === "corridos" ? "corridos" : "uteis";
  const antes = Math.min(30, Math.max(0, Math.round(Number(f.get("interno_dias") ?? 2))));
  if (!descricao) return { erro: "Diga que prazo é (ex.: Contestação)." } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publicado)) return { erro: "Informe a data da publicação ou intimação." } as const;
  if (!Number.isFinite(dias) || dias < 0 || dias > 365) return { erro: "Informe quantos dias tem o prazo." } as const;
  const locais = await lerFeriadosLocais(db);
  const feriados = diasSemExpediente(locais.map((x) => x.dia));
  const { fatal } = calcularVencimento(publicado, dias, contagem, feriados);
  const interno = prazoInterno(fatal, antes, feriados);
  return {
    dados: {
      descricao,
      publicado_em: publicado,
      dias,
      contagem,
      vence_em: fatal,
      vence_interno: interno < publicado ? publicado : interno,
      responsavel_id: String(f.get("responsavel_id") ?? "") || null,
      observacao: String(f.get("observacao") ?? "").trim() || null,
    },
  } as const;
}

/** Evento do prazo fatal na Google Agenda do escritório (9h, meia hora). */
function eventoDoPrazo(p: { descricao: string; vence_em: string; vence_interno: string; observacao: string | null }, cliente: string, processo: string | null) {
  return {
    titulo: `PRAZO FATAL · ${p.descricao}${cliente ? ` · ${cliente}` : ""}`,
    inicio: `${p.vence_em}T09:00:00-03:00`,
    fim: `${p.vence_em}T09:30:00-03:00`,
    descricao: [processo ? `Processo: ${processo}` : "", `Prazo interno: ${dataBR(p.vence_interno)}`, p.observacao ?? "", "Registrado pelo Órion CRM"].filter(Boolean).join("\n"),
  };
}

async function clienteEProcesso(db: Awaited<ReturnType<typeof quemSou>>["supabase"], processoId: string | null) {
  if (!processoId) return { clienteId: null, cliente: "", processo: null };
  const { data } = await db.from("processos").select("numero_cnj, casos(cliente_id, clientes(nome))").eq("id", processoId).maybeSingle();
  const caso = um(data?.casos as Rel<{ cliente_id: string; clientes: Rel<{ nome: string }> }>);
  return { clienteId: caso?.cliente_id ?? null, cliente: um(caso?.clientes ?? null)?.nome ?? "", processo: (data?.numero_cnj as string) ?? null };
}

export async function criarPrazo(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const lido = await lerFormulario(f, supabase);
  if ("erro" in lido) return { erro: lido.erro ?? "Confira os campos.", ok: null };
  const processoId = String(f.get("processo_id") ?? "") || null;
  const publicacaoId = String(f.get("publicacao_id") ?? "") || null;
  const { clienteId, cliente, processo } = await clienteEProcesso(supabase, processoId);

  const { data: novo, error } = await supabase
    .from("prazos")
    .insert({ ...lido.dados, processo_id: processoId, publicacao_id: publicacaoId, cliente_id: clienteId, responsavel_id: lido.dados.responsavel_id ?? user.id, criado_por: user.id })
    .select("id")
    .single();
  if (error) return { erro: traduzir(error.message), ok: null };

  if (publicacaoId) {
    await supabase.from("publicacoes").update({ situacao: "prazo", tratada_por: user.id, tratada_em: new Date().toISOString() }).eq("id", publicacaoId);
  }
  let agenda = "";
  try {
    const token = await tokenDeAcesso();
    if (token) {
      const ev = await criarEvento(token, eventoDoPrazo(lido.dados, cliente, processo));
      await supabase.from("prazos").update({ google_event_id: ev.id }).eq("id", novo.id);
      agenda = " Na Google Agenda.";
    }
  } catch {
    agenda = " Não foi possível pôr na Google Agenda agora.";
  }
  atualizarTelas();
  return { erro: null, ok: `Prazo criado: vence em ${dataBR(lido.dados.vence_em)} (interno ${dataBR(lido.dados.vence_interno)}).${agenda}` };
}

export async function editarPrazo(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const id = String(f.get("id") ?? "");
  const { data: atual } = await supabase.from("prazos").select("processo_id, google_event_id").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Prazo não encontrado. Recarregue a página.", ok: null };
  const lido = await lerFormulario(f, supabase);
  if ("erro" in lido) return { erro: lido.erro ?? "Confira os campos.", ok: null };
  const { error } = await supabase.from("prazos").update({ ...lido.dados, responsavel_id: lido.dados.responsavel_id ?? user.id }).eq("id", id);
  if (error) return { erro: traduzir(error.message), ok: null };
  try {
    const token = await tokenDeAcesso();
    if (token) {
      const { cliente, processo } = await clienteEProcesso(supabase, atual.processo_id);
      const ev = eventoDoPrazo(lido.dados, cliente, processo);
      if (atual.google_event_id) await atualizarEvento(token, atual.google_event_id, ev).catch(async () => {
        const novo = await criarEvento(token, ev);
        await supabase.from("prazos").update({ google_event_id: novo.id }).eq("id", id);
      });
      else {
        const novo = await criarEvento(token, ev);
        await supabase.from("prazos").update({ google_event_id: novo.id }).eq("id", id);
      }
    }
  } catch {
    // a agenda é complemento: o prazo já foi salvo
  }
  atualizarTelas();
  return { erro: null, ok: `Prazo atualizado: vence em ${dataBR(lido.dados.vence_em)} (interno ${dataBR(lido.dados.vence_interno)}).` };
}

async function mudarSituacao(id: string, situacao: "aberto" | "cumprido"): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const extra = situacao === "cumprido" ? { cumprido_em: new Date().toISOString(), cumprido_por: user.id } : { cumprido_em: null, cumprido_por: null };
  const { error } = await supabase.from("prazos").update({ situacao, ...extra }).eq("id", id);
  if (error) return { erro: traduzir(error.message), ok: null };
  atualizarTelas();
  return { erro: null, ok: situacao === "cumprido" ? "Prazo cumprido." : "Prazo reaberto." };
}

export async function cumprirPrazo(id: string) {
  return mudarSituacao(id, "cumprido");
}

export async function reabrirPrazo(id: string) {
  return mudarSituacao(id, "aberto");
}

/** Apaga o prazo (e o evento da Google Agenda). A publicação de origem volta para "Para tratar". */
export async function excluirPrazo(id: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const { data: p } = await supabase.from("prazos").select("google_event_id, publicacao_id").eq("id", id).maybeSingle();
  if (p?.google_event_id) {
    try {
      const token = await tokenDeAcesso();
      if (token) await excluirEvento(token, p.google_event_id);
    } catch {
      // o evento pode já ter sido apagado na agenda
    }
  }
  const { error } = await supabase.from("prazos").delete().eq("id", id);
  if (error) return { erro: traduzir(error.message), ok: null };
  if (p?.publicacao_id) await supabase.from("publicacoes").update({ situacao: "nova", tratada_por: null, tratada_em: null }).eq("id", p.publicacao_id).eq("situacao", "prazo");
  atualizarTelas();
  return { erro: null, ok: "Prazo excluído." };
}

// ------------------------------------------------------------------ Feriados do escritório
export async function adicionarFeriado(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const dia = String(f.get("dia") ?? "");
  const descricao = String(f.get("descricao") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { erro: "Escolha o dia.", ok: null };
  if (!descricao) return { erro: "Diga que dia é (ex.: Nossa Senhora da Penha).", ok: null };
  const { error } = await supabase.from("feriados").upsert({ dia, descricao, criado_por: user.id });
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/prazos");
  return { erro: null, ok: `${dataBR(dia)} cadastrado. Vale para os prazos criados ou editados daqui em diante.` };
}

/** Confirma um dia sugerido (botão da lista de sugestões). */
export async function confirmarFeriado(dia: string, descricao: string): Promise<Resultado> {
  const f = new FormData();
  f.set("dia", dia);
  f.set("descricao", descricao);
  return adicionarFeriado({ erro: null, ok: null }, f);
}

export async function removerFeriado(dia: string): Promise<Resultado> {
  const { supabase, papel } = await quemSou();
  if (!papel) return { erro: "Sem permissão.", ok: null };
  const { error } = await supabase.from("feriados").delete().eq("dia", dia);
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/prazos");
  return { erro: null, ok: `${dataBR(dia)} removido.` };
}

/** Confirma de uma vez os dias sem expediente sugeridos de um ano (Carnaval, Semana Santa, Corpus Christi…). */
export async function confirmarSugeridos(ano: number): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const linhas = feriadosSugeridos(ano).map((x) => ({ dia: x.dia, descricao: x.nome, criado_por: user.id }));
  const { error } = await supabase.from("feriados").upsert(linhas, { onConflict: "dia", ignoreDuplicates: true });
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidatePath("/prazos");
  return { erro: null, ok: `Dias sem expediente de ${ano} confirmados.` };
}
