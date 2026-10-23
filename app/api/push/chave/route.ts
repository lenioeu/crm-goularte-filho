import { NextResponse } from "next/server";
import { quemSou } from "@/lib/permissoes";
import { chavesPush } from "@/lib/push";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Chave pública que o navegador precisa para se inscrever nas notificações.
export async function GET() {
  const { papel } = await quemSou();
  if (!papel) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    const chaves = await chavesPush(supabaseAdmin());
    if (!chaves) return NextResponse.json({ erro: "Falta rodar o script supabase/008_avisos.sql no Supabase." }, { status: 503 });
    return NextResponse.json({ publica: chaves.publica });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
