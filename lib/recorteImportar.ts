import type { SupabaseClient } from "@supabase/supabase-js";
import { emailsDoRecorte } from "@/lib/googleUsuario";
import { enviarPush } from "@/lib/push";
import { diaDoAssunto, lerEmailRecorte } from "@/lib/recorte";

const SEM_TABELA = "Falta rodar o script supabase/017_publicacoes.sql no Supabase.";

/**
 * Grava em Publicações um e-mail do Recorte Digital (vindo do script do Gmail ou da leitura direta do Gmail).
 * Pode receber o mesmo e-mail mais de uma vez: o que já entrou é pulado. Avisa a equipe das novas.
 */
export async function processarEmailRecorte(db: SupabaseClient, corpo: { assunto?: string; data?: string; html: string }, avisar = true) {
  const lidas = lerEmailRecorte(corpo.html);
  const dia = diaDoAssunto(corpo.assunto ?? "", corpo.data ? new Date(corpo.data) : new Date());

  // Liga cada publicação ao processo (e ao cliente) pelo número
  const numeros = [...new Set(lidas.map((p) => p.numeroCnj).filter((n): n is string => Boolean(n)))];
  const { data: procs } = numeros.length ? await db.from("processos").select("id, numero_cnj, casos(cliente_id)").in("numero_cnj", numeros) : { data: [] };
  type Proc = { id: string; numero_cnj: string; casos: { cliente_id: string } | { cliente_id: string }[] | null };
  const porNumero = new Map(((procs ?? []) as Proc[]).map((p) => [p.numero_cnj, { id: p.id, cliente: (Array.isArray(p.casos) ? p.casos[0] : p.casos)?.cliente_id ?? null }]));

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
    if (error) throw new Error(/publicacoes|does not exist|schema cache/i.test(error.message) ? SEM_TABELA : error.message);
    novas = data?.length ?? 0;
  }
  const { error: e2 } = await db.from("recortes_recebidos").upsert({ dia, assunto: corpo.assunto ?? null, publicacoes: lidas.length, recebido_em: new Date().toISOString() });
  if (e2 && /recortes_recebidos|does not exist|schema cache/i.test(e2.message)) throw new Error(SEM_TABELA);

  if (novas && avisar) {
    await enviarPush(db, "equipe", {
      titulo: `${novas} ${novas === 1 ? "publicação nova" : "publicações novas"} no Recorte`,
      texto: "Abra Publicações para tratar (ciência, prazo, tarefa ou audiência).",
      url: "/publicacoes",
      tag: "publicacoes",
    }).catch(() => null);
  }
  return { dia, lidas: lidas.length, novas };
}

/**
 * Lê o Recorte direto do Gmail de quem ligou o Gmail em Meu perfil (sem precisar do script do Google).
 * db precisa ser o cliente de servidor (service role). Devolve quantas publicações novas entraram.
 */
export async function importarRecorteDoGmail(db: SupabaseClient, apenas?: string) {
  let consulta = db.from("google_usuarios").select("perfil_id").eq("gmail", true);
  if (apenas) consulta = consulta.eq("perfil_id", apenas);
  const { data: contas, error } = await consulta;
  if (error || !contas?.length) return { contas: 0, emails: 0, novas: 0, erros: [] as string[] };

  const { data: lidos } = await db.from("recorte_gmail_lidos").select("mensagem_id").gte("lido_em", new Date(Date.now() - 20 * 86_400_000).toISOString()).limit(5000);
  const jaLidos = new Set((lidos ?? []).map((x) => x.mensagem_id as string));
  let emails = 0;
  let novas = 0;
  const erros: string[] = [];
  for (const c of contas) {
    try {
      const lista = await emailsDoRecorte(c.perfil_id, jaLidos);
      if (lista === null) continue;
      for (const e of lista) {
        const r = await processarEmailRecorte(db, e, false);
        novas += r.novas;
        emails++;
        jaLidos.add(e.id);
        await db.from("recorte_gmail_lidos").upsert({ mensagem_id: e.id, perfil_id: c.perfil_id });
      }
      await db.from("google_usuarios").update({ gmail_lido_em: new Date().toISOString() }).eq("perfil_id", c.perfil_id);
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (novas) {
    await enviarPush(db, "equipe", {
      titulo: `${novas} ${novas === 1 ? "publicação nova" : "publicações novas"} no Recorte`,
      texto: "Abra Publicações para tratar (ciência, prazo, tarefa ou audiência).",
      url: "/publicacoes",
      tag: "publicacoes",
    }).catch(() => null);
  }
  return { contas: contas.length, emails, novas, erros };
}
