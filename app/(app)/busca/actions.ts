"use server";

import { quemSou } from "@/lib/permissoes";

export type Achado = { tipo: "cliente" | "processo" | "caso"; titulo: string; detalhe: string; href: string };

/** Busca rápida da caixa Ctrl+K: clientes (nome, CPF, telefone), processos (número) e casos (assunto, parte contrária). */
export async function buscaRapida(bruto: string): Promise<Achado[]> {
  const { supabase, papel } = await quemSou();
  if (!papel) return [];
  const q = bruto.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return [];
  const d = q.replace(/\D/g, "");

  const filtros = [`nome.ilike.%${q}%`];
  if (d.length >= 4) filtros.push(`cpf_cnpj.ilike.%${d.split("").join("%")}%`, `telefone_whatsapp.ilike.%${d}%`);
  const [{ data: clientes }, { data: processos }, { data: casos }] = await Promise.all([
    supabase.from("clientes").select("id, nome, cpf_cnpj, telefone_whatsapp").or(filtros.join(",")).order("nome").limit(6),
    d.length >= 5
      ? supabase.from("processos").select("id, numero_cnj, classe, casos(clientes(id, nome))").ilike("numero_cnj", `%${d.slice(0, 7)}%`).limit(5)
      : Promise.resolve({ data: [] as { id: string; numero_cnj: string; classe: string | null; casos: unknown }[] }),
    d.length < 4 ? supabase.from("casos").select("id, titulo, parte_contraria, clientes(id, nome)").or(`titulo.ilike.%${q}%,parte_contraria.ilike.%${q}%`).limit(4) : Promise.resolve({ data: [] }),
  ]);

  type Rel<T> = T | T[] | null;
  const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);
  return [
    ...(clientes ?? []).map((c) => ({ tipo: "cliente" as const, titulo: c.nome, detalhe: [c.cpf_cnpj, c.telefone_whatsapp].filter(Boolean).join(" · ") || "cliente", href: `/clientes/${c.id}` })),
    ...(processos ?? []).map((p) => {
      const cli = um(um(p.casos as Rel<{ clientes: Rel<{ id: string; nome: string }> }>)?.clientes ?? null);
      return { tipo: "processo" as const, titulo: p.numero_cnj, detalhe: [cli?.nome, p.classe].filter(Boolean).join(" · "), href: cli ? `/clientes/${cli.id}` : "/processos" };
    }),
    ...((casos ?? []) as { id: string; titulo: string; parte_contraria: string | null; clientes: unknown }[]).map((k) => {
      const cli = um(k.clientes as Rel<{ id: string; nome: string }>);
      return { tipo: "caso" as const, titulo: k.titulo, detalhe: [cli?.nome, k.parte_contraria && `× ${k.parte_contraria}`].filter(Boolean).join(" · "), href: cli ? `/clientes/${cli.id}` : "/funil" };
    }),
  ];
}
