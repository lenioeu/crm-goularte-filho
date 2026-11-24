import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Volta do login com Google (e do link de confirmação de e-mail): troca o código pela sessão.
// Quem entra com Google pela primeira vez ganha um perfil inativo, que o administrador libera em Equipe e cargos.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (searchParams.get("error")) return NextResponse.redirect(`${origin}/login?erro=google`);
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?erro=google`);
  }
  return NextResponse.redirect(`${origin}/`);
}
