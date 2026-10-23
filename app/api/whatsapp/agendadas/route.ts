import { NextResponse } from "next/server";
import { conversaAberta, enviarERegistrar } from "@/lib/atendimento";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { estadoConexao, whatsappConfigurado } from "@/lib/whatsapp";

export const maxDuration = 60;

// Envia as mensagens agendadas que já venceram. Chamado a cada minuto pelo
// pg_cron do Supabase (supabase/003_whatsapp.sql), com "Authorization: Bearer <CRON_SECRET>".
// Manda no máximo 8 por vez, com intervalo, para não parecer disparo em massa.
async function enviar(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (!whatsappConfigurado()) return NextResponse.json({ ok: true, aviso: "WhatsApp não configurado" });
  if ((await estadoConexao().catch(() => "close")) !== "open") return NextResponse.json({ ok: true, aviso: "WhatsApp desconectado" });

  const db = supabaseAdmin();
  const agora = new Date().toISOString();

  // Envio interrompido no meio (ex.: queda da função) há mais de 10 minutos
  await db
    .from("mensagens_agendadas")
    .update({ status: "falhou", erro: "envio interrompido; confira e agende de novo" })
    .eq("status", "enviando")
    .lt("enviar_em", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: vencidas } = await db
    .from("mensagens_agendadas")
    .select("id")
    .eq("status", "programada")
    .lte("enviar_em", agora)
    .order("enviar_em")
    .limit(8);

  let enviadas = 0, falhas = 0;
  for (const [i, v] of (vencidas ?? []).entries()) {
    // Reserva a mensagem; se outra chamada já pegou, pula
    const { data: m } = await db
      .from("mensagens_agendadas")
      .update({ status: "enviando" })
      .eq("id", v.id)
      .eq("status", "programada")
      .select("id, texto, clientes(id, area_id, telefone_whatsapp)")
      .maybeSingle();
    if (!m) continue;
    const rel = m.clientes as unknown as { id: string; area_id: string | null; telefone_whatsapp: string | null } | null;
    const cliente = Array.isArray(rel) ? rel[0] : rel;
    try {
      if (!cliente?.telefone_whatsapp) throw new Error("cliente sem WhatsApp cadastrado");
      if (i > 0) await new Promise((ok) => setTimeout(ok, 2500 + Math.random() * 3000));
      const conversa = await conversaAberta(db, cliente, "aguardando");
      await enviarERegistrar(db, conversa.id, cliente.telefone_whatsapp, m.texto);
      await db.from("mensagens_agendadas").update({ status: "enviada", enviada_em: new Date().toISOString(), erro: null }).eq("id", m.id);
      enviadas++;
    } catch (e) {
      await db.from("mensagens_agendadas").update({ status: "falhou", erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).eq("id", m.id);
      falhas++;
    }
  }
  return NextResponse.json({ ok: true, enviadas, falhas });
}

export const GET = enviar;
export const POST = enviar;
