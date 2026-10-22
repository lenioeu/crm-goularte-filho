import { supabaseServer } from "@/lib/supabase/server";

/** Usuário logado e o papel dele; papel é null para quem não está ativo. */
export async function quemSou() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, papel: null as string | null };
  const { data } = await supabase.from("perfis").select("papel, ativo").eq("id", user.id).maybeSingle();
  return { supabase, user, papel: data?.ativo ? (data.papel as string) : null };
}
