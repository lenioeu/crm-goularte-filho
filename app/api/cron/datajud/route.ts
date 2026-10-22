import { NextResponse } from "next/server";
import { camposDoResumo, consultarDataJud, somenteDigitos } from "@/lib/datajud";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Chamado pela Vercel todo dia (ver "crons" em vercel.json).
// A Vercel envia "Authorization: Bearer <CRON_SECRET>" quando a variável existe.
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("processos")
    .select("id, numero_cnj")
    .eq("arquivado", false)
    .order("sincronizado_em", { ascending: true, nullsFirst: true })
    .limit(150);

  const fila = [...(data ?? [])];
  let atualizados = 0, falhas = 0;
  async function trabalhador() {
    for (let p = fila.shift(); p; p = fila.shift()) {
      try {
        const r = await consultarDataJud(somenteDigitos(p.numero_cnj));
        await admin
          .from("processos")
          .update(r ? camposDoResumo(r) : { sincronizado_em: new Date().toISOString() })
          .eq("id", p.id);
        if (r) atualizados++;
      } catch {
        falhas++;
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, trabalhador));
  return NextResponse.json({ processos: data?.length ?? 0, atualizados, falhas });
}
