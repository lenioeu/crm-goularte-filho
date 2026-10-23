import { NextResponse } from "next/server";
import { quemSou } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

// Contador de conversas esperando resposta (consultado pelo menu a cada 15 segundos).
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
  if (error) return NextResponse.json({ total: 0, minhas: 0, ultima: null }); // script 008 ainda não rodou
  const lista = data ?? [];
  const u = lista[0] as unknown as { id: string; ultima_mensagem_em: string | null; clientes: { nome: string } | { nome: string }[] | null } | undefined;
  const nome = u ? (Array.isArray(u.clientes) ? u.clientes[0]?.nome : u.clientes?.nome) : null;
  return NextResponse.json(
    {
      total: lista.length,
      minhas: lista.filter((c) => c.atendente_id === user.id).length,
      ultima: u ? { id: u.id, nome, em: u.ultima_mensagem_em } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
