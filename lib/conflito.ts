import type { SupabaseClient } from "@supabase/supabase-js";

// Conflito de interesses: a mesma pessoa (pelo CPF/CNPJ ou pelo nome completo) como cliente do escritório
// e como parte contrária num processo. O Órion só avisa; quem decide é o advogado.

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
/** Nome para comparar sem diferença de maiúsculas (ilike), com os curingas % e _ neutralizados. */
const nomeLimpo = (v: string) => v.toUpperCase().replace(/\s+/g, " ").trim().replace(/[%_\\]/g, (c) => `\\${c}`);

/** Ao cadastrar cliente: ele já aparece como parte contrária em algum processo? Devolve o aviso ou "". */
export async function clienteEhParteContraria(db: SupabaseClient, nome: string, cpfCnpj: string | null) {
  try {
    const doc = digitos(cpfCnpj);
    const [porDoc, porNome] = await Promise.all([
      doc.length >= 11 ? db.from("processo_partes").select("nome, cpf_cnpj, processos(numero_cnj)").not("cpf_cnpj", "is", null).limit(2000) : Promise.resolve({ data: [] as never[] }),
      db.from("processo_partes").select("nome, cpf_cnpj, processos(numero_cnj)").ilike("nome", nomeLimpo(nome)).limit(20),
    ]);
    const achados = [
      ...((porDoc.data ?? []) as { nome: string; cpf_cnpj: string | null; processos: unknown }[]).filter((p) => digitos(p.cpf_cnpj) === doc),
      ...((porNome.data ?? []) as { nome: string; cpf_cnpj: string | null; processos: unknown }[]),
    ];
    if (!achados.length) return "";
    const procs = [...new Set(achados.map((p) => (Array.isArray(p.processos) ? p.processos[0] : p.processos) as { numero_cnj: string } | null).map((p) => p?.numero_cnj).filter(Boolean))];
    return ` ATENÇÃO, possível conflito de interesses: essa pessoa é parte contrária ${procs.length === 1 ? "no processo" : "nos processos"} ${procs.join(", ")}.`;
  } catch {
    return ""; // sem a tabela (script 019) não há o que conferir
  }
}

/** Ao cadastrar parte contrária: ela é cliente do escritório? Devolve o aviso ou "". */
export async function parteEhCliente(db: SupabaseClient, nome: string, cpfCnpj: string | null) {
  const doc = digitos(cpfCnpj);
  const { data } = await db.from("clientes").select("id, nome, cpf_cnpj").ilike("nome", nomeLimpo(nome)).limit(5);
  let achado = (data ?? [])[0] ?? null;
  if (!achado && doc.length >= 11) {
    const formatado = doc.length === 11
      ? doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
      : doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    const { data: d2 } = await db.from("clientes").select("id, nome, cpf_cnpj").in("cpf_cnpj", [formatado, doc]).limit(1);
    achado = (d2 ?? [])[0] ?? null;
  }
  return achado ? ` ATENÇÃO, possível conflito de interesses: ${achado.nome} é cliente do escritório.` : "";
}
