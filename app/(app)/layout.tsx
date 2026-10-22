import { redirect } from "next/navigation";
import { Marca } from "@/components/Marca";
import { Shell } from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase/server";
import { sair } from "./actions";

export const dynamic = "force-dynamic";

const PAPEL: Record<string, string> = {
  administrador: "Administrador",
  advogado: "Advogado",
  estagiario: "Estagiário",
  atendimento: "Atendimento",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Quem ainda não foi liberado não consegue ler o próprio perfil (regra do banco).
  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome, papel, ativo, cargos(nome)")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || !perfil.ativo) {
    return (
      <main className="login-wrap">
        <div className="login card" style={{ textAlign: "center" }}>
          <Marca />
          <h1 style={{ fontSize: 20 }}>Acesso aguardando liberação</h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Seu cadastro ({user.email}) foi recebido. Peça ao administrador do escritório para liberar o seu acesso em
            “Equipe e cargos”.
          </p>
          <form action={sair}>
            <button className="btn" type="submit">
              Sair
            </button>
          </form>
        </div>
      </main>
    );
  }

  const cargoRel = perfil.cargos as { nome: string } | { nome: string }[] | null;
  const cargo = (Array.isArray(cargoRel) ? cargoRel[0]?.nome : cargoRel?.nome) ?? PAPEL[perfil.papel] ?? "";

  return (
    <Shell nome={perfil.nome} cargo={cargo}>
      {children}
    </Shell>
  );
}
