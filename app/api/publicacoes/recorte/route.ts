import { NextResponse } from "next/server";
import { enviarPush } from "@/lib/push";
import { diaDoAssunto, lerEmailRecorte, tokenRecorte } from "@/lib/recorte";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

const SEM_TABELA = "Falta rodar o script supabase/017_publicacoes.sql no Supabase.";

// Recebe o e-mail diário do Recorte Digital, mandado pelo script do Gmail (docs/recorte-digital.md).
// Corpo: { assunto, data, html }. Pode receber o mesmo e-mail mais de uma vez: o que já entrou é pulado.
export async function POST(request: Request) {
  const token = tokenRecorte();
  if (!token || request.headers.get("x-orion-token") !== token) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as { assunto?: string; data?: string; html?: string } | null;
  if (!corpo?.html) return NextResponse.json({ erro: "e-mail sem conteúdo" }, { status: 400 });

  const db = supabaseAdmin();
  const lidas = lerEmailRecorte(corpo.html);
  const dia = diaDoAssunto(corpo.assunto ?? "", corpo.data ? new Date(corpo.data) : new Date());

  // Liga cada publicação ao processo (e ao cliente) pelo número
  const numeros = [...new Set(lidas.map((p) => p.numeroCnj).filter((n): n is string => Boolean(n)))];
  const { data: procs } = numeros.length
    ? await db.from("processos").select("id, numero_cnj, casos(cliente_id)").in("numero_cnj", numeros)
    : { data: [] };
  type Proc = { id: string; numero_cnj: string; casos: { cliente_id: string } | { cliente_id: string }[] | null };
  const porNumero = new Map(
    ((procs ?? []) as Proc[]).map((p) => [p.numero_cnj, { id: p.id, cliente: (Array.isArray(p.casos) ? p.casos[0] : p.casos)?.cliente_id ?? null }]),
  );

  const linhas = lidas.map((p) => ({
    chave: p.chave,
    origem: "recorte",
    numero_cnj: p.numeroCnj,
    processo_id: p.numeroCnj ? porNumero.get(p.numeroCnj)?.id ?? null : null,
    cliente_id: p.numeroCnj ? porNumero.get(p.numeroCnj)?.cliente ?? null : null,
    disponibilizada_em: p.disponibilizacao,
    publicada_em: p.publicacao,
    jornal: p.jornal,
    caderno: p.caderno,
    orgao: p.orgao,
    texto: p.texto,
    link: p.link,
    tipo: p.tipo,
    audiencia_em: p.audiencia ? `${p.audiencia.data}T${p.audiencia.hora}:00-03:00` : null,
  }));

  let novas = 0;
  if (linhas.length) {
    const { data, error } = await db.from("publicacoes").upsert(linhas, { onConflict: "chave", ignoreDuplicates: true }).select("id");
    if (error) return NextResponse.json({ erro: /publicacoes|does not exist|schema cache/i.test(error.message) ? SEM_TABELA : error.message }, { status: 500 });
    novas = data?.length ?? 0;
  }
  const { error: e2 } = await db.from("recortes_recebidos").upsert({ dia, assunto: corpo.assunto ?? null, publicacoes: lidas.length, recebido_em: new Date().toISOString() });
  if (e2 && /recortes_recebidos|does not exist|schema cache/i.test(e2.message)) return NextResponse.json({ erro: SEM_TABELA }, { status: 500 });

  if (novas) {
    await enviarPush(db, "equipe", {
      titulo: `${novas} ${novas === 1 ? "publicação nova" : "publicações novas"} no Recorte`,
      texto: "Abra Publicações para tratar (ciência, tarefa ou audiência).",
      url: "/publicacoes",
      tag: "publicacoes",
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true, dia, lidas: lidas.length, novas });
}
