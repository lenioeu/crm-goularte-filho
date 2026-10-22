"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarEvento, excluirEvento, tokenDeAcesso } from "@/lib/google";
import { supabaseServer } from "@/lib/supabase/server";

export type Resultado = { erro: string | null; ok: string | null };

function traduzirErro(msg: string) {
  if (/row-level security/i.test(msg)) return "Você não tem permissão para fazer isso.";
  if (/duplicate key/i.test(msg)) return "Já existe um cadastro com esses dados.";
  return msg;
}

export async function sair() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

const texto = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export async function criarCliente(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o nome do cliente.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("clientes").insert({
    nome: nome.toUpperCase(),
    telefone_whatsapp: texto(f, "telefone")?.replace(/\D/g, "") || null,
    cpf_cnpj: texto(f, "cpf"),
    email: texto(f, "email"),
    area_id: texto(f, "area_id"),
  });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/clientes");
  revalidatePath("/");
  return { erro: null, ok: `${nome.toUpperCase()} cadastrado.` };
}

export async function criarArea(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o nome da área.", ok: null };
  const supabase = await supabaseServer();
  const { data: ultima } = await supabase.from("areas").select("ordem_bot").order("ordem_bot", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("areas").insert({
    nome,
    cor: texto(f, "cor") ?? "#1967d2",
    documentos_pedidos: texto(f, "documentos"),
    ordem_bot: (ultima?.ordem_bot ?? 0) + 1,
  });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/areas");
  return { erro: null, ok: `Área “${nome}” criada.` };
}

export async function atualizarMembro(_: Resultado, f: FormData): Promise<Resultado> {
  const id = texto(f, "id");
  if (!id) return { erro: "Pessoa não encontrada.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("perfis")
    .update({ papel: texto(f, "papel"), cargo_id: texto(f, "cargo_id"), ativo: f.get("ativo") === "on" })
    .eq("id", id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/equipe");
  return { erro: null, ok: "Salvo." };
}

export async function criarCargo(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o nome do cargo.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("cargos").insert({ nome });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/equipe");
  return { erro: null, ok: `Cargo “${nome}” criado.` };
}

export async function salvarPerfil(_: Resultado, f: FormData): Promise<Resultado> {
  const nome = texto(f, "nome");
  if (!nome) return { erro: "Informe o seu nome.", ok: null };
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre de novo.", ok: null };
  const { error } = await supabase
    .from("perfis")
    .update({ nome, oab: texto(f, "oab"), telefone: texto(f, "telefone"), assinatura: texto(f, "assinatura") })
    .eq("id", user.id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/", "layout");
  return { erro: null, ok: "Perfil salvo." };
}

const ETAPAS = ["primeiro_contato", "triagem", "consulta_agendada", "proposta", "contrato_assinado", "nao_viavel"] as const;
type Etapa = (typeof ETAPAS)[number];
const etapaValida = (v: string | null): v is Etapa => !!v && (ETAPAS as readonly string[]).includes(v);

export async function criarCaso(_: Resultado, f: FormData): Promise<Resultado> {
  const titulo = texto(f, "titulo");
  if (!titulo) return { erro: "Descreva o caso em poucas palavras (ex.: “Verbas rescisórias”).", ok: null };
  const supabase = await supabaseServer();
  const areaId = texto(f, "area_id");

  let clienteId = texto(f, "cliente_id");
  if (!clienteId) {
    const nomeNovo = texto(f, "cliente_novo");
    if (!nomeNovo) return { erro: "Escolha um cliente da lista ou digite o nome de um cliente novo.", ok: null };
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nome: nomeNovo.toUpperCase(), telefone_whatsapp: texto(f, "telefone")?.replace(/\D/g, "") || null, area_id: areaId })
      .select("id")
      .single();
    if (error) return { erro: traduzirErro(error.message), ok: null };
    clienteId = data.id;
  }

  const etapa = texto(f, "etapa");
  const { error } = await supabase.from("casos").insert({
    cliente_id: clienteId,
    titulo,
    area_id: areaId,
    resumo: texto(f, "resumo"),
    parte_contraria: texto(f, "parte_contraria"),
    responsavel_id: texto(f, "responsavel_id"),
    etapa: etapaValida(etapa) ? etapa : "primeiro_contato",
    sigiloso: f.get("sigiloso") === "on",
  });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/funil");
  revalidatePath("/clientes");
  revalidatePath("/");
  return { erro: null, ok: "Caso criado no funil." };
}

export async function moverCaso(id: string, etapa: string, motivo: string | null): Promise<Resultado> {
  if (!etapaValida(etapa)) return { erro: "Etapa inválida.", ok: null };
  if (etapa === "nao_viavel" && !motivo?.trim()) return { erro: "Informe o motivo de o caso não ser viável.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("casos")
    .update({ etapa, motivo_nao_viavel: etapa === "nao_viavel" ? motivo!.trim() : null })
    .eq("id", id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/funil");
  revalidatePath("/");
  return { erro: null, ok: "Movido." };
}

// ---------------------------------------------------------------- tarefas
const COLUNAS = ["a_fazer", "em_andamento", "revisao", "concluida"] as const;

export async function criarTarefa(_: Resultado, f: FormData): Promise<Resultado> {
  const titulo = texto(f, "titulo");
  if (!titulo) return { erro: "Descreva a tarefa.", ok: null };
  const supabase = await supabaseServer();
  const casoId = texto(f, "caso_id");
  let clienteId: string | null = null;
  if (casoId) {
    const { data } = await supabase.from("casos").select("cliente_id").eq("id", casoId).maybeSingle();
    clienteId = data?.cliente_id ?? null;
  }
  const { error } = await supabase.from("tarefas").insert({
    titulo,
    caso_id: casoId,
    cliente_id: clienteId,
    responsavel_id: texto(f, "responsavel_id"),
    revisor_id: texto(f, "revisor_id"),
    vence_em: texto(f, "vence_em"),
  });
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/tarefas");
  return { erro: null, ok: "Tarefa criada." };
}

export async function moverTarefa(id: string, coluna: string): Promise<Resultado> {
  if (!(COLUNAS as readonly string[]).includes(coluna)) return { erro: "Coluna inválida.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("tarefas").update({ coluna }).eq("id", id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/tarefas");
  return { erro: null, ok: "Movida." };
}

// ---------------------------------------------------------------- audiências
const nomeProprio = (nome: string) =>
  nome
    .toLowerCase()
    .split(/\s+/)[0]
    .replace(/^./, (c) => c.toUpperCase());

export async function criarAudiencia(_: Resultado, f: FormData): Promise<Resultado> {
  const casoId = texto(f, "caso_id");
  const tipo = texto(f, "tipo_outro") ?? texto(f, "tipo");
  const data = texto(f, "data");
  const hora = texto(f, "hora");
  if (!casoId) return { erro: "Escolha o caso da audiência.", ok: null };
  if (!tipo) return { erro: "Informe o tipo da audiência.", ok: null };
  if (!data || !hora) return { erro: "Informe o dia e a hora.", ok: null };

  // Horário de Brasília (o Brasil não tem horário de verão desde 2019).
  const inicio = `${data}T${hora}:00-03:00`;
  if (Number.isNaN(new Date(inicio).getTime())) return { erro: "Data ou hora inválida.", ok: null };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const modalidade = texto(f, "modalidade") === "video" ? "video" : "presencial";
  const local = texto(f, "local");

  const { data: aud, error } = await supabase
    .from("audiencias")
    .insert({
      caso_id: casoId,
      tipo,
      inicio,
      local,
      modalidade,
      responsavel_id: texto(f, "responsavel_id"),
      observacoes: texto(f, "observacoes"),
    })
    .select("id")
    .single();
  if (error) return { erro: traduzirErro(error.message), ok: null };

  const { data: caso } = await supabase.from("casos").select("cliente_id, titulo, clientes(nome)").eq("id", casoId).maybeSingle();
  const rel = caso?.clientes as { nome: string } | { nome: string }[] | null | undefined;
  const nomeCliente = (Array.isArray(rel) ? rel[0]?.nome : rel?.nome) ?? "";

  // Google Agenda (só quando a conta Google do escritório estiver conectada)
  let agenda = "";
  try {
    const token = await tokenDeAcesso();
    if (token) {
      const fim = new Date(new Date(inicio).getTime() + 60 * 60 * 1000).toISOString();
      const ev = await criarEvento(token, {
        titulo: `Audiência de ${tipo.toLowerCase()} · ${nomeCliente}`,
        inicio,
        fim,
        local: local ?? (modalidade === "video" ? "Por vídeo" : undefined),
        descricao: `Caso: ${caso?.titulo ?? ""}\n${texto(f, "observacoes") ?? ""}\nRegistrado pelo Órion CRM`.trim(),
      });
      await supabase.from("audiencias").update({ google_event_id: ev.id }).eq("id", aud.id);
      agenda = " Adicionada ao Google Agenda.";
    }
  } catch {
    agenda = " Não foi possível adicionar ao Google Agenda agora.";
  }

  let lembrete = "";
  if (f.get("lembrete") === "on") {
    const vespera = new Date(`${data}T12:00:00-03:00`);
    vespera.setUTCDate(vespera.getUTCDate() - 1);
    const dia = vespera.toISOString().slice(0, 10);
    const enviarEm = `${dia}T18:00:00-03:00`;
    if (new Date(enviarEm).getTime() > Date.now()) {
      const [, m, d] = data.split("-");
      const onde = local ? `, em ${local}` : modalidade === "video" ? ", por vídeo (o link foi enviado)" : "";
      const mensagem =
        `Olá, ${nomeProprio(nomeCliente) || "tudo bem"}! Passando para lembrar da sua audiência de ${tipo.toLowerCase()} amanhã, ${d}/${m}, às ${hora}${onde}. ` +
        `Chegue com 30 minutos de antecedência e leve um documento com foto. Qualquer dúvida, é só responder aqui.\nGoularte Filho Advocacia`;
      if (caso?.cliente_id) {
        const { error: e2 } = await supabase.from("mensagens_agendadas").insert({
          cliente_id: caso.cliente_id,
          audiencia_id: aud.id,
          tipo: "lembrete_audiencia",
          texto: mensagem,
          enviar_em: enviarEm,
          automatico: true,
          criado_por: user?.id ?? null,
        });
        if (!e2) {
          const [, mv, dv] = dia.split("-");
          lembrete = ` Lembrete ao cliente programado para ${dv}/${mv} às 18:00.`;
        }
      }
    }
  }

  revalidatePath("/audiencias");
  revalidatePath("/");
  return { erro: null, ok: `Audiência agendada.${agenda}${lembrete}` };
}

export async function excluirAudiencia(id: string): Promise<Resultado> {
  const supabase = await supabaseServer();
  const { data: aud } = await supabase.from("audiencias").select("google_event_id").eq("id", id).maybeSingle();
  if (aud?.google_event_id) {
    try {
      const token = await tokenDeAcesso();
      if (token) await excluirEvento(token, aud.google_event_id);
    } catch {
      // O evento pode já ter sido apagado direto no Google Agenda.
    }
  }
  const { error } = await supabase.from("audiencias").delete().eq("id", id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath("/audiencias");
  revalidatePath("/");
  return { erro: null, ok: "Audiência excluída." };
}

// ---------------------------------------------------------------- ficha do cliente
export async function atualizarCliente(_: Resultado, f: FormData): Promise<Resultado> {
  const id = texto(f, "id");
  const nome = texto(f, "nome");
  if (!id) return { erro: "Cliente não encontrado.", ok: null };
  if (!nome) return { erro: "O nome não pode ficar vazio.", ok: null };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("clientes")
    .update({
      nome: nome.toUpperCase(),
      telefone_whatsapp: texto(f, "telefone")?.replace(/\D/g, "") || null,
      cpf_cnpj: texto(f, "cpf"),
      email: texto(f, "email"),
      area_id: texto(f, "area_id"),
      responsavel_id: texto(f, "responsavel_id"),
      origem: texto(f, "origem"),
      observacoes: texto(f, "observacoes"),
    })
    .eq("id", id);
  if (error) return { erro: traduzirErro(error.message), ok: null };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return { erro: null, ok: "Dados salvos." };
}
