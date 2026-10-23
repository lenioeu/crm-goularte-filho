import type { SupabaseClient } from "@supabase/supabase-js";

// Quem escreve no WhatsApp e ainda não é cliente fica como "contato", com um tipo.
// A lista de tipos é editável (configuracoes.tipos_contato); sem nada salvo, vale a de fábrica.
export const TIPOS_CONTATO_PADRAO = ["Interessado", "Parte contrária", "Advogado da outra parte", "Fornecedor ou parceiro", "Pessoal"];
export const TIPO_NOVO_CONTATO = "Interessado";
export const SEM_COLUNA_CONTATO = "Falta rodar o script supabase/012_contatos.sql no Supabase.";

/** A coluna "situacao" ainda não existe (script 012 não rodado). */
export const semColunaContato = (msg?: string) => /situacao|contato_tipo/.test(msg ?? "");

export async function lerTiposContato(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("configuracoes").select("valor").eq("chave", "tipos_contato").maybeSingle();
  return Array.isArray(data?.valor) ? (data.valor as string[]) : TIPOS_CONTATO_PADRAO;
}
