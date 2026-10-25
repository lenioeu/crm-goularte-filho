import { NextResponse } from "next/server";
import { registrarMensagem } from "@/lib/atendimento";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lerApagada, lerEdicao, lerMensagem, lerRecibo, tokenWebhook, whatsappConfigurado } from "@/lib/whatsapp";

export const maxDuration = 60;

// O Evolution API chama este endereço a cada mensagem (configurado pelo botão
// "Conectar WhatsApp" em Integrações, com a senha no cabeçalho x-crm-token).
export async function POST(request: Request) {
  if (!whatsappConfigurado() || request.headers.get("x-crm-token") !== tokenWebhook()) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as { event?: string; data?: unknown } | null;
  // O Evolution pode mandar um item só ou uma lista
  const lista = Array.isArray(corpo?.data) ? corpo.data : [corpo?.data];
  const db = supabaseAdmin();

  // Recibos de entrega e leitura (tiques); só sobe de nível: enviada → entregue → lida
  if (corpo?.event === "messages.update") {
    for (const item of lista) {
      const r = lerRecibo(item);
      if (!r) continue;
      const abaixo = r.status === "lida" ? ["enviada", "entregue"] : r.status === "entregue" ? ["enviada"] : [];
      await db
        .from("mensagens")
        .update({ status_envio: r.status })
        .eq("whatsapp_id", r.whatsappId)
        .or(`status_envio.is.null${abaixo.length ? `,status_envio.in.(${abaixo.join(",")})` : ""}`);
    }
    return NextResponse.json({ ok: true });
  }
  // Mensagem apagada para todos: o CRM guarda o texto e marca quem apagou (colunas do script 015)
  if (corpo?.event === "messages.delete") {
    for (const item of lista) {
      const a = lerApagada(item);
      if (!a) continue;
      await db
        .from("mensagens")
        .update({ apagada_em: new Date().toISOString(), apagada_por: a.deMim ? "escritorio" : "cliente" })
        .eq("whatsapp_id", a.whatsappId)
        .is("apagada_em", null);
    }
    return NextResponse.json({ ok: true });
  }
  // Mensagem editada: troca o texto e guarda o original
  if (corpo?.event === "messages.edited") {
    for (const item of lista) {
      const e = lerEdicao(item);
      if (!e) continue;
      const { data: m } = await db.from("mensagens").select("id, texto, texto_original").eq("whatsapp_id", e.whatsappId).maybeSingle();
      if (!m || m.texto === e.texto) continue;
      await db.from("mensagens").update({ texto: e.texto, texto_original: m.texto_original ?? m.texto, editada_em: new Date().toISOString() }).eq("id", m.id);
    }
    return NextResponse.json({ ok: true });
  }
  if (corpo?.event !== "messages.upsert") return NextResponse.json({ ok: true });

  for (const item of lista) {
    const m = lerMensagem(item);
    if (!m) continue;
    try {
      await registrarMensagem(db, m);
    } catch (e) {
      console.error("whatsapp webhook:", e instanceof Error ? e.message : e);
      return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
