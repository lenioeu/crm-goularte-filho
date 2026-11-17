import type { SupabaseClient } from "@supabase/supabase-js";

/** Dias sem expediente cadastrados pelo escritório (sem o script 018, nenhum). */
export async function lerFeriadosLocais(db: SupabaseClient): Promise<{ dia: string; descricao: string }[]> {
  const { data, error } = await db.from("feriados").select("dia, descricao").order("dia");
  return error ? [] : (data ?? []);
}
