import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

// Quem está logado, lido uma vez por página: a moldura (layout) e a página dividem o mesmo resultado,
// em vez de cada uma perguntar de novo ao Supabase. getClaims confere a assinatura do token; com as
// chaves de assinatura novas do Supabase isso nem sai do servidor, e com as antigas faz uma consulta só.
export const usuarioAtual = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: typeof c.email === "string" ? c.email : null } : null;
});

/** Perfil de quem está logado (nome, papel, ativo, cargo); null se não entrou ou ainda não foi liberado para ler. */
export const perfilAtual = cache(async () => {
  const user = await usuarioAtual();
  if (!user) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("perfis").select("nome, papel, ativo, cargos(nome)").eq("id", user.id).maybeSingle();
  return data;
});
