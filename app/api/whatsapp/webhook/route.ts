import { NextResponse } from "next/server";
import { registrarMensagem } from "@/lib/atendimento";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lerMensagem, lerRecibo, tokenWebhook, whatsappConfigurado } from "@/lib/whatsapp";

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
