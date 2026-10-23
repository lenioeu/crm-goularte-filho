import { NextResponse } from "next/server";
import { registrarMensagem } from "@/lib/atendimento";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lerMensagem, tokenWebhook, whatsappConfigurado } from "@/lib/whatsapp";

export const maxDuration = 60;

// O Evolution API chama este endereço a cada mensagem (configurado pelo botão
// "Conectar WhatsApp" em Integrações, com a senha no cabeçalho x-crm-token).
export async function POST(request: Request) {
  if (!whatsappConfigurado() || request.headers.get("x-crm-token") !== tokenWebhook()) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as { event?: string; data?: unknown } | null;
  if (corpo?.event !== "messages.upsert") return NextResponse.json({ ok: true });

  // O Evolution pode mandar uma mensagem só ou uma lista
  const lista = Array.isArray(corpo.data) ? corpo.data : [corpo.data];
  const db = supabaseAdmin();
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
