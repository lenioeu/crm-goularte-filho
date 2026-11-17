import { NextResponse } from "next/server";
import { quemSou } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

// Contadores do menu (consultados a cada 15 segundos): conversas esperando resposta e publicações para tratar.
export async function GET() {
  const { supabase, user, papel } = await quemSou();
  if (!user || !papel) return NextResponse.json({ total: 0, minhas: 0, ultima: null }, { status: 401 });
  const { data, error } = await supabase
    .from("conversas")
    .select("id, atendente_id, ultima_mensagem_em, clientes(nome)")
    .eq("aguardando_resposta", true)
    .in("status", ["aguardando", "em_atendimento"])
    .order("ultima_mensagem_em", { ascending: false })
    .limit(200);
  // Publicações do Recorte para tratar (sem o script 017, zero)
  const { count: publicacoes } = await supabase.from("publicacoes").select("id", { count: "exact", head: true }).eq("situacao", "nova");
  if (error) return NextResponse.json({ total: 0, minhas: 0, ultima: null, publicacoes: publicacoes ?? 0 }); // script 008 ainda não rodou
  const lista = data ?? [];
  const u = lista[0] as unknown as { id: string; ultima_mensagem_em: string | null; clientes: { nome: string } | { nome: string }[] | null } | undefined;
  const nome = u ? (Array.isArray(u.clientes) ? u.clientes[0]?.nome : u.clientes?.nome) : null;
  return NextResponse.json(
    {
      total: lista.length,
      minhas: lista.filter((c) => c.atendente_id === user.id).length,
      ultima: u ? { id: u.id, nome, em: u.ultima_mensagem_em } : null,
      publicacoes: publicacoes ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
