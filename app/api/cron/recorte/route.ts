import { NextResponse } from "next/server";
import { enviarPush } from "@/lib/push";
import { importarRecorteDoGmail } from "@/lib/recorteImportar";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Chamado pela Vercel às 10h (ver "crons" em vercel.json). Lê o Recorte nos Gmails ligados e, em dia útil, avisa os administradores se o
// e-mail do Recorte Digital de hoje não chegou ao Órion (o Recorte manda todo dia, mesmo sem publicação).
// Só vale depois que a integração começou a funcionar.
export const maxDuration = 60;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  // Antes de conferir, lê o Recorte direto do Gmail de quem ligou o Gmail em Meu perfil
  await importarRecorteDoGmail(admin).catch(() => null);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const semana = new Date(`${hoje}T12:00:00-03:00`).getDay();
  if (semana === 0 || semana === 6) return NextResponse.json({ ok: true, conferido: false, motivo: "fim de semana" });

  const { data: ultimo, error } = await admin.from("recortes_recebidos").select("dia").order("dia", { ascending: false }).limit(1);
  if (error || !ultimo?.length) return NextResponse.json({ ok: true, conferido: false, motivo: "integração ainda não ligada" });
  if (ultimo[0].dia >= hoje) return NextResponse.json({ ok: true, conferido: true, chegou: true });

  const { data: admins } = await admin.from("perfis").select("id").eq("papel", "administrador").eq("ativo", true);
  await enviarPush(admin, (admins ?? []).map((a) => a.id), {
    titulo: "O e-mail do Recorte de hoje não chegou ao Órion",
    texto: "Confira o histórico no site do Recorte Digital e o script do Gmail (Integrações › Recorte Digital).",
    url: "/publicacoes",
    tag: "recorte-faltando",
  });
  return NextResponse.json({ ok: true, conferido: true, chegou: false });
}
