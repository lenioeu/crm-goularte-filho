import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/config";

// Cliente com a chave secreta: ignora as permissões do banco.
// Usar SOMENTE no servidor, e só para o que a equipe não pode ver
// diretamente (ex.: a autorização do Google).
export function supabaseAdmin() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error("A variável SUPABASE_SECRET_KEY não está configurada na Vercel.");
  return createClient(SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
