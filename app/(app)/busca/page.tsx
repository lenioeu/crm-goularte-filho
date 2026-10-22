import Link from "next/link";
import { redirect } from "next/navigation";
import { ETAPA, telefoneBR } from "@/lib/rotulos";
import { supabaseServer } from "@/lib/supabase/server";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);

export default async function Busca({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: bruto = "" } = await searchParams;
  // Tira caracteres que têm significado especial no filtro do banco.
  const q = bruto.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  const digitos = q.replace(/\D/g, "");
  const supabase = await supabaseServer();

  if (!q) {
    return (
      <div className="view">
        <div className="vhead"><div><h1>Busca</h1><p>Digite no campo do topo um nome, CPF, telefone ou número de processo.</p></div></div>
      </div>
    );
  }

  const filtrosCliente = [`nome.ilike.%${q}%`];
  if (digitos.length >= 4) filtrosCliente.push(`cpf_cnpj.ilike.%${digitos}%`, `telefone_whatsapp.ilike.%${digitos}%`);

  // Número do processo: com 20 dígitos busca exato; senão, pelo começo (número sequencial).
  const formatado =
    digitos.length === 20
      ? `${digitos.slice(0, 7)}-${digitos.slice(7, 9)}.${digitos.slice(9, 13)}.${digitos.slice(13, 14)}.${digitos.slice(14, 16)}.${digitos.slice(16)}`
      : null;

  const [{ data: clientes }, { data: casos }, { data: processos }] = await Promise.all([
    supabase.from("clientes").select("id, nome, telefone_whatsapp, cpf_cnpj, areas(nome, cor)").or(filtrosCliente.join(",")).order("nome").limit(50),
    supabase
      .from("casos")
      .select("id, titulo, etapa, parte_contraria, clientes(id, nome)")
      .or(`titulo.ilike.%${q}%,parte_contraria.ilike.%${q}%`)
      .limit(30),
    digitos.length >= 7
      ? supabase
          .from("processos")
          .select("id, numero_cnj, tribunal, casos(clientes(id, nome))")
          .ilike("numero_cnj", formatado ?? `${digitos.slice(0, 7)}%`)
          .limit(30)
      : Promise.resolve({ data: [] as { id: string; numero_cnj: string; tribunal: string | null; casos: unknown }[] }),
  ]);

  const total = (clientes?.length ?? 0) + (casos?.length ?? 0) + (processos?.length ?? 0);
  if (clientes?.length === 1 && !casos?.length && !processos?.length) redirect(`/clientes/${clientes[0].id}`);

  return (
    <div className="view">
      <div className="vhead">
        <div><h1>Busca: “{q}”</h1><p>{total === 0 ? "Nada encontrado." : `${total} ${total === 1 ? "resultado" : "resultados"}.`}</p></div>
      </div>

      {(clientes ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="ctitle"><h3>Clientes</h3></div>
          <div className="list">
            {(clientes ?? []).map((c) => {
              const area = um(c.areas as Rel<{ nome: string; cor: string }>);
              return (
                <Link className="li" key={c.id} href={`/clientes/${c.id}`}>
                  <div className="bd"><b>{c.nome}</b><small>{telefoneBR(c.telefone_whatsapp)}{c.cpf_cnpj && ` · ${c.cpf_cnpj}`}</small></div>
                  {area && <span className="chip area" style={{ "--c": area.cor } as React.CSSProperties}>{area.nome}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(processos ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="ctitle"><h3>Processos</h3></div>
          <div className="list">
            {(processos ?? []).map((p) => {
              const cliente = um(um(p.casos as Rel<{ clientes: Rel<{ id: string; nome: string }> }>)?.clientes ?? null);
              return (
                <Link className="li" key={p.id} href={cliente ? `/clientes/${cliente.id}` : "/processos"}>
                  <div className="bd"><b style={{ fontFamily: "var(--f-mono)", fontSize: 13 }}>{p.numero_cnj}</b><small>{[cliente?.nome, p.tribunal].filter(Boolean).join(" · ")}</small></div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(casos ?? []).length > 0 && (
        <div className="card">
          <div className="ctitle"><h3>Casos</h3></div>
          <div className="list">
            {(casos ?? []).map((k) => {
              const cliente = um(k.clientes as Rel<{ id: string; nome: string }>);
              return (
                <Link className="li" key={k.id} href={cliente ? `/clientes/${cliente.id}` : "/funil"}>
                  <div className="bd"><b>{k.titulo}</b><small>{[cliente?.nome, k.parte_contraria && `× ${k.parte_contraria}`].filter(Boolean).join(" · ")}</small></div>
                  <span className="chip">{ETAPA[k.etapa]}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
