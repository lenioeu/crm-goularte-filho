import type { SupabaseClient } from "@supabase/supabase-js";
import { ETAPA, TIPO_AGENDAMENTO, TZ } from "@/lib/rotulos";

// Tudo o que aconteceu com o cliente, em ordem de data (ficha do cliente).

export type Evento = { em: string; tipo: string; icone: string; texto: string; detalhe?: string; link?: string; futuro?: boolean };

export async function linhaDoTempo(db: SupabaseClient, clienteId: string): Promise<Evento[]> {
  const ev: Evento[] = [];
  const [{ data: cli }, { data: casos }, { data: conversas }, { data: documentos }, { data: agendadas }, { data: tarefas }] = await Promise.all([
    db.from("clientes").select("criado_em, origem").eq("id", clienteId).maybeSingle(),
    db.from("casos").select("id, titulo, criado_em").eq("cliente_id", clienteId),
    db.from("conversas").select("id, criado_em, status").eq("cliente_id", clienteId),
    db.from("documentos").select("nome_salvo, drive_url, salvo_em").eq("cliente_id", clienteId),
    db.from("mensagens_agendadas").select("tipo, enviada_em, status").eq("cliente_id", clienteId).eq("status", "enviada"),
    db.from("tarefas").select("titulo, criado_em, coluna").eq("cliente_id", clienteId),
  ]);
  const idsCasos = (casos ?? []).map((c) => c.id);
  const idsConv = (conversas ?? []).map((c) => c.id);
  const nenhum = ["00000000-0000-0000-0000-000000000000"];
  const tituloCaso = new Map((casos ?? []).map((c) => [c.id, c.titulo]));

  const [{ data: historico }, { data: processos }, { data: audiencias }, { data: mensagens }] = await Promise.all([
    db.from("casos_historico").select("caso_id, para_etapa, em").in("caso_id", idsCasos.length ? idsCasos : nenhum),
    db.from("processos").select("numero_cnj, classe, criado_em, movimentos").in("caso_id", idsCasos.length ? idsCasos : nenhum),
    db.from("audiencias").select("tipo, inicio, local").in("caso_id", idsCasos.length ? idsCasos : nenhum),
    db.from("mensagens").select("conversa_id, direcao, criado_em, nota_interna").in("conversa_id", idsConv.length ? idsConv : nenhum).order("criado_em", { ascending: false }).limit(3000),
  ]);

  if (cli) ev.push({ em: cli.criado_em, tipo: "cadastro", icone: "👤", texto: "Cliente cadastrado", detalhe: cli.origem ? `origem: ${cli.origem}` : undefined });
  for (const c of casos ?? []) ev.push({ em: c.criado_em, tipo: "caso", icone: "📂", texto: `Caso aberto: ${c.titulo}` });
  for (const h of historico ?? []) ev.push({ em: h.em, tipo: "etapa", icone: "➜", texto: `${tituloCaso.get(h.caso_id) ?? "Caso"} passou para ${ETAPA[h.para_etapa] ?? h.para_etapa}` });
  for (const p of processos ?? []) {
    ev.push({ em: p.criado_em, tipo: "processo", icone: "⚖", texto: `Processo cadastrado: ${p.numero_cnj}`, detalhe: p.classe ?? undefined });
    for (const m of ((p.movimentos ?? []) as { data: string; nome: string }[]).slice(0, 15)) {
      ev.push({ em: m.data, tipo: "movimentacao", icone: "🏛", texto: m.nome, detalhe: p.numero_cnj });
    }
  }
  const agora = Date.now();
  for (const a of audiencias ?? []) {
    ev.push({ em: a.inicio, tipo: "audiencia", icone: "📅", texto: `Audiência: ${a.tipo}`, detalhe: a.local ?? undefined, futuro: new Date(a.inicio).getTime() > agora });
  }
  for (const d of documentos ?? []) ev.push({ em: d.salvo_em, tipo: "documento", icone: "📄", texto: d.nome_salvo, link: d.drive_url ?? undefined });
  for (const m of agendadas ?? []) if (m.enviada_em) ev.push({ em: m.enviada_em, tipo: "agendada", icone: "⏰", texto: `Mensagem programada enviada: ${TIPO_AGENDAMENTO[m.tipo] ?? m.tipo}` });
  for (const t of tarefas ?? []) ev.push({ em: t.criado_em, tipo: "tarefa", icone: "✓", texto: `Tarefa: ${t.titulo}`, detalhe: t.coluna === "concluida" ? "concluída" : "aberta" });

  // Conversas do WhatsApp: um item por dia, com o total de mensagens
  const porDia = new Map<string, { em: string; conversa: string; entrada: number; saida: number; notas: number }>();
  for (const m of mensagens ?? []) {
    const dia = new Date(m.criado_em).toLocaleDateString("sv-SE", { timeZone: TZ });
    const k = `${m.conversa_id}|${dia}`;
    const x = porDia.get(k) ?? { em: m.criado_em, conversa: m.conversa_id, entrada: 0, saida: 0, notas: 0 };
    if (m.nota_interna) x.notas++;
    else if (m.direcao === "entrada") x.entrada++;
    else x.saida++;
    porDia.set(k, x);
  }
  for (const x of porDia.values()) {
    const partes = [x.entrada && `${x.entrada} recebida${x.entrada > 1 ? "s" : ""}`, x.saida && `${x.saida} enviada${x.saida > 1 ? "s" : ""}`, x.notas && `${x.notas} nota${x.notas > 1 ? "s" : ""} interna${x.notas > 1 ? "s" : ""}`].filter(Boolean);
    ev.push({ em: x.em, tipo: "whatsapp", icone: "💬", texto: "Conversa no WhatsApp", detalhe: partes.join(", "), link: `/atendimento?c=${x.conversa}` });
  }

  return ev.filter((e) => e.em).sort((a, b) => (a.em < b.em ? 1 : -1));
}
