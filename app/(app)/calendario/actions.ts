"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { rotuloDoTipo, TIPOS_COMPROMISSO, type TipoCompromisso } from "@/lib/calendario";
import { atualizarEvento, criarEvento, excluirEvento, tokenDeAcesso } from "@/lib/google";
import { quemSou } from "@/lib/permissoes";

const SEM_TABELA = "Falta rodar o script supabase/019_calendario_partes_vinculos.sql no Supabase.";
const traduzir = (m: string) =>
  /compromissos|does not exist|schema cache/i.test(m) ? SEM_TABELA : /row-level security/i.test(m) ? "Você não tem permissão para fazer isso." : m;
const texto = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

type Dados = { tipo: TipoCompromisso; titulo: string; inicio: string; fim: string; local: string | null; observacoes: string | null; cliente_id: string | null; processo_id: string | null; responsavel_id: string | null };

function ler(f: FormData): Dados | string {
  const tipo = texto(f, "tipo") as TipoCompromisso | null;
  const titulo = texto(f, "titulo");
  const data = texto(f, "data");
  const hora = texto(f, "hora") ?? "09:00";
  const duracao = Math.min(12 * 60, Math.max(15, Number(texto(f, "duracao") ?? 60) || 60));
  if (!tipo || !TIPOS_COMPROMISSO.some((t) => t.id === tipo)) return "Escolha o tipo.";
  if (!titulo) return "Escreva o que é (ex.: reunião com o cliente).";
  if (!data) return "Informe o dia.";
  const inicio = `${data}T${hora}:00-03:00`;
  if (Number.isNaN(new Date(inicio).getTime())) return "Data ou hora inválida.";
  return {
    tipo,
    titulo,
    inicio,
    fim: new Date(new Date(inicio).getTime() + duracao * 60_000).toISOString(),
    local: texto(f, "local"),
    observacoes: texto(f, "observacoes"),
    cliente_id: texto(f, "cliente_id"),
    processo_id: texto(f, "processo_id"),
    responsavel_id: texto(f, "responsavel_id"),
  };
}

async function descricaoGoogle(supabase: Awaited<ReturnType<typeof quemSou>>["supabase"], d: Dados) {
  const [{ data: cli }, { data: proc }] = await Promise.all([
    d.cliente_id ? supabase.from("clientes").select("nome").eq("id", d.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    d.processo_id ? supabase.from("processos").select("numero_cnj").eq("id", d.processo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    titulo: `${rotuloDoTipo(d.tipo)}: ${d.titulo}${cli?.nome ? ` · ${cli.nome}` : ""}`,
    inicio: d.inicio,
    fim: d.fim,
    local: d.local ?? undefined,
    descricao: [cli?.nome && `Cliente: ${cli.nome}`, proc?.numero_cnj && `Processo: ${proc.numero_cnj}`, d.observacoes, "Registrado pelo Órion CRM"].filter(Boolean).join("\n"),
  };
}

function revalidar() {
  revalidatePath("/calendario");
  revalidatePath("/");
}

export async function criarCompromisso(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const d = ler(f);
  if (typeof d === "string") return { erro: d, ok: null };
  const { data: novo, error } = await supabase.from("compromissos").insert({ ...d, criado_por: user.id }).select("id").single();
  if (error) return { erro: traduzir(error.message), ok: null };

  let agenda = "";
  try {
    const token = await tokenDeAcesso();
    if (token) {
      const ev = await criarEvento(token, await descricaoGoogle(supabase, d));
      await supabase.from("compromissos").update({ google_event_id: ev.id }).eq("id", novo.id);
      agenda = " Adicionado ao Google Agenda.";
    }
  } catch {
    agenda = " Não foi possível adicionar ao Google Agenda agora.";
  }
  revalidar();
  return { erro: null, ok: `Agendado: ${rotuloDoTipo(d.tipo).toLowerCase()} em ${d.inicio.slice(8, 10)}/${d.inicio.slice(5, 7)} às ${d.inicio.slice(11, 16)}.${agenda}` };
}

export async function editarCompromisso(_: Resultado, f: FormData): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const id = texto(f, "id");
  const d = ler(f);
  if (!id) return { erro: "Compromisso não encontrado.", ok: null };
  if (typeof d === "string") return { erro: d, ok: null };
  const { data: atual } = await supabase.from("compromissos").select("google_event_id").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Compromisso não encontrado. Recarregue a página.", ok: null };
  const { error } = await supabase.from("compromissos").update(d).eq("id", id);
  if (error) return { erro: traduzir(error.message), ok: null };

  let agenda = "";
  try {
    const token = await tokenDeAcesso();
    if (token) {
      const ev = await descricaoGoogle(supabase, d);
      let feito = false;
      if (atual.google_event_id) {
        try {
          await atualizarEvento(token, atual.google_event_id, ev);
          feito = true;
        } catch {
          // apagado direto na Google Agenda: cria de novo
        }
      }
      if (!feito) {
        const novo = await criarEvento(token, ev);
        await supabase.from("compromissos").update({ google_event_id: novo.id }).eq("id", id);
      }
      agenda = " Google Agenda atualizada.";
    }
  } catch {
    agenda = " Não foi possível atualizar a Google Agenda agora.";
  }
  revalidar();
  return { erro: null, ok: `Alterações salvas.${agenda}` };
}

export async function excluirCompromisso(id: string): Promise<Resultado> {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const { data: atual } = await supabase.from("compromissos").select("google_event_id").eq("id", id).maybeSingle();
  if (atual?.google_event_id) {
    try {
      const token = await tokenDeAcesso();
      if (token) await excluirEvento(token, atual.google_event_id);
    } catch {
      // já apagado na Google Agenda
    }
  }
  const { error } = await supabase.from("compromissos").delete().eq("id", id);
  if (error) return { erro: traduzir(error.message), ok: null };
  revalidar();
  return { erro: null, ok: "Compromisso excluído." };
}
