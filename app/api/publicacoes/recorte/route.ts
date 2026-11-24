import { NextResponse } from "next/server";
import { tokenRecorte } from "@/lib/recorte";
import { processarEmailRecorte } from "@/lib/recorteImportar";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Recebe o e-mail diário do Recorte Digital, mandado pelo script do Gmail (docs/recorte-digital.md).
// Corpo: { assunto, data, html }. Pode receber o mesmo e-mail mais de uma vez: o que já entrou é pulado.
// Quem ligou o Gmail em Meu perfil não precisa do script: o Órion lê o Gmail direto (lib/recorteImportar).
export async function POST(request: Request) {
  const token = tokenRecorte();
  if (!token || request.headers.get("x-orion-token") !== token) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as { assunto?: string; data?: string; html?: string } | null;
  if (!corpo?.html) return NextResponse.json({ erro: "e-mail sem conteúdo" }, { status: 400 });
  try {
    const r = await processarEmailRecorte(supabaseAdmin(), { assunto: corpo.assunto, data: corpo.data, html: corpo.html });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
