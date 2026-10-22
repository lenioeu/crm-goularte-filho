import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Audiencia = {
  id: string;
  tipo: string;
  inicio: string;
  local: string | null;
  casos: { titulo: string; clientes: { nome: string } | null } | null;
};

export default async function Inicio() {
  const supabase = await supabaseServer();
  const agora = new Date();
  const em7dias = new Date(agora.getTime() + 7 * 24 * 3600 * 1000);

  const [{ count: clientes }, { count: casosAtivos }, { count: emTriagem }, { data: audiencias }, { data: areas }, { data: casos }] =
    await Promise.all([
      supabase.from("clientes").select("id", { count: "exact", head: true }),
      supabase.from("casos").select("id", { count: "exact", head: true }).eq("etapa", "contrato_assinado"),
      supabase.from("casos").select("id", { count: "exact", head: true }).in("etapa", ["primeiro_contato", "triagem", "consulta_agendada", "proposta"]),
      supabase
        .from("audiencias")
        .select("id, tipo, inicio, local, casos(titulo, clientes(nome))")
        .gte("inicio", agora.toISOString())
        .lte("inicio", em7dias.toISOString())
        .order("inicio")
        .limit(6),
      supabase.from("areas").select("id, nome, cor").eq("ativa", true).order("ordem_bot"),
      supabase.from("casos").select("area_id").neq("etapa", "nao_viavel").limit(5000),
    ]);

  const porArea = new Map<string, number>();
  (casos ?? []).forEach((c) => c.area_id && porArea.set(c.area_id, (porArea.get(c.area_id) ?? 0) + 1));
  const max = Math.max(1, ...Array.from(porArea.values()));
  const lista = (audiencias ?? []) as unknown as Audiencia[];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Início</h1>
          <p>Resumo do escritório com os dados reais do sistema. Os números aparecem conforme vocês cadastram clientes e casos.</p>
        </div>
      </div>

      <div className="grid kpis">
        <div className="card kpi"><div className="lbl">Clientes cadastrados</div><div className="val">{clientes ?? 0}</div><div className="sub"><Link href="/clientes" style={{ color: "var(--accent)" }}>Ver clientes</Link></div></div>
        <div className="card kpi"><div className="lbl">Casos com contrato assinado</div><div className="val">{casosAtivos ?? 0}</div></div>
        <div className="card kpi"><div className="lbl">Casos em andamento no funil</div><div className="val">{emTriagem ?? 0}</div></div>
        <div className="card kpi"><div className="lbl">Audiências nos próximos 7 dias</div><div className="val">{lista.length}</div></div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="ctitle"><h3>Próximas audiências</h3></div>
          {lista.length === 0 ? (
            <div className="vazio"><b>Nenhuma audiência nos próximos 7 dias</b>O cadastro de audiências chega nas próximas etapas.</div>
          ) : (
            <div className="list">
              {lista.map((a) => {
                const d = new Date(a.inicio);
                return (
                  <div className="li" key={a.id}>
                    <div className="datebox"><b>{String(d.getDate()).padStart(2, "0")}</b><small>{MESES[d.getMonth()]}</small></div>
                    <div className="bd">
                      <b>{a.tipo} · {a.casos?.clientes?.nome ?? a.casos?.titulo}</b>
                      <small>{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} · {a.local ?? "local a definir"}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="card">
          <div className="ctitle"><h3>Casos por área</h3><Link href="/areas" className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>Gerenciar áreas</Link></div>
          <div className="abar">
            {(areas ?? []).map((a) => (
              <div className="ab" key={a.id} style={{ "--c": a.cor } as React.CSSProperties}>
                <div className="r"><span><span className="dot" style={{ marginRight: 8 }} />{a.nome}</span><span>{porArea.get(a.id) ?? 0}</span></div>
                <div className="t"><i style={{ width: `${((porArea.get(a.id) ?? 0) / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
