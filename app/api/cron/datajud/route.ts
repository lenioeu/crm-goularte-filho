import { NextResponse } from "next/server";
import { camposDoResumo, consultarDataJud, somenteDigitos } from "@/lib/datajud";
import { enviarPush } from "@/lib/push";
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
  const prazos = await avisarPrazos(admin).catch(() => 0);
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
  return NextResponse.json({ processos: data?.length ?? 0, atualizados, falhas, prazos });
}

/**
 * Às 7h de dia útil, cada responsável recebe no celular o resumo dos prazos dele: vencidos, que vencem
 * hoje e com prazo interno chegando. Sem o script 018, não faz nada.
 */
async function avisarPrazos(admin: ReturnType<typeof supabaseAdmin>) {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const semana = new Date(`${hoje}T12:00:00-03:00`).getDay();
  if (semana === 0 || semana === 6) return 0;
  const { data, error } = await admin.from("prazos").select("responsavel_id, vence_em").eq("situacao", "aberto").lte("vence_interno", hoje).not("responsavel_id", "is", null);
  if (error || !data?.length) return 0;
  const porPessoa = new Map<string, { vencidos: number; hoje: number; internos: number }>();
  for (const p of data) {
    const c = porPessoa.get(p.responsavel_id as string) ?? { vencidos: 0, hoje: 0, internos: 0 };
    if (p.vence_em < hoje) c.vencidos++;
    else if (p.vence_em === hoje) c.hoje++;
    else c.internos++;
    porPessoa.set(p.responsavel_id as string, c);
  }
  for (const [pessoa, c] of porPessoa) {
    const partes = [
      c.vencidos && `${c.vencidos} ${c.vencidos === 1 ? "vencido" : "vencidos"}`,
      c.hoje && `${c.hoje} ${c.hoje === 1 ? "vence" : "vencem"} hoje`,
      c.internos && `${c.internos} com prazo interno hoje`,
    ].filter(Boolean);
    await enviarPush(admin, [pessoa], { titulo: "Seus prazos de hoje", texto: partes.join(" · "), url: "/prazos?quem=meus", tag: "prazos-dia" }).catch(() => null);
  }
  return data.length;
}
