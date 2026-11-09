import { perfilAtual, usuarioAtual } from "@/lib/sessao";
import { supabaseServer } from "@/lib/supabase/server";

/** Usuário logado e o papel dele; papel é null para quem não está ativo. */
export async function quemSou() {
  const [supabase, user, perfil] = await Promise.all([supabaseServer(), usuarioAtual(), perfilAtual()]);
  if (!user) return { supabase, user: null, papel: null as string | null };
  return { supabase, user, papel: perfil?.ativo ? (perfil.papel as string) : null };
}
