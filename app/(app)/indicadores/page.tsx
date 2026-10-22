import Link from "next/link";
import { TZ } from "@/lib/rotulos";
import { supabaseServer } from "@/lib/supabase/server";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);

function mesAtual() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);
}
function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const inicioDoMes = (mes: string) => new Date(`${mes}-01T00:00:00-03:00`).toISOString();
const mesDe = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);

/** Topo "redondo" do eixo e o passo das linhas de grade. */
function escala(max: number) {
  if (max <= 4) return { topo: 4, passo: 1 };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= bruto)!;
  return { topo: Math.ceil(max / passo) * passo, passo };
}

export default async function Indicadores({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: mesParam } = await searchParams;
  const atual = mesAtual();
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : atual;
  const ini = inicioDoMes(mes);
  const fim = inicioDoMes(somarMes(mes, 1));
  const ini6 = inicioDoMes(somarMes(mes, -5));
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const ha60 = new Date(Date.now() - 60 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: TZ });

  const supabase = await supabaseServer();
  const [{ data: casos }, { data: historico }, { data: audiencias }, { data: tarefas }, { count: parados }, { data: pessoas }, { data: areas }] =
    await Promise.all([
      supabase.from("casos").select("id, area_id, responsavel_id, etapa, criado_em").limit(20000),
      supabase.from("casos_historico").select("caso_id, para_etapa").gte("em", ini).lt("em", fim).limit(20000),
      supabase.from("audiencias").select("responsavel_id, inicio").gte("inicio", ini).lt("inicio", fim).limit(5000),
      supabase.from("tarefas").select("responsavel_id, vence_em").neq("coluna", "concluida").limit(20000),
      supabase.from("processos").select("id", { count: "exact", head: true }).eq("arquivado", false).lt("ultima_movimentacao_em", ha60),
      supabase.from("perfis").select("id, nome, papel, cargos(nome)").eq("ativo", true).order("nome"),
      supabase.from("areas").select("id, nome, cor").eq("ativa", true).order("ordem_bot"),
    ]);

  const listaCasos = casos ?? [];
  const respDoCaso = new Map(listaCasos.map((c) => [c.id, c.responsavel_id as string | null]));
  const novos = listaCasos.filter((c) => c.criado_em >= ini && c.criado_em < fim).length;
  const consultas = (historico ?? []).filter((h) => h.para_etapa === "consulta_agendada").length;
  const contratos = (historico ?? []).filter((h) => h.para_etapa === "contrato_assinado");
  const naoViaveis = (historico ?? []).filter((h) => h.para_etapa === "nao_viavel").length;
  const conversao = consultas > 0 ? Math.round((contratos.length / consultas) * 100) : null;
  const atrasadas = (tarefas ?? []).filter((t) => t.vence_em && t.vence_em < hoje).length;

  // Casos novos por mês (6 meses, terminando no mês escolhido)
  const meses = Array.from({ length: 6 }, (_, i) => somarMes(mes, i - 5));
  const porMes = new Map(meses.map((m) => [m, 0]));
  listaCasos.forEach((c) => {
    if (c.criado_em >= ini6 && c.criado_em < fim) {
      const m = mesDe(c.criado_em);
      if (porMes.has(m)) porMes.set(m, (porMes.get(m) ?? 0) + 1);
    }
  });
  const valores = meses.map((m) => porMes.get(m) ?? 0);
  const { topo, passo } = escala(Math.max(1, ...valores));
  const X0 = 40, X1 = 592, Y0 = 16, Y1 = 168;
  const larguraFaixa = (X1 - X0) / meses.length;
  const y = (v: number) => Y1 - (v / topo) * (Y1 - Y0);

  // Por pessoa (ordem alfabética)
  const equipe = (pessoas ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    cargo: um(p.cargos as Rel<{ nome: string }>)?.nome ?? "",
    ativos: listaCasos.filter((c) => c.responsavel_id === p.id && c.etapa !== "nao_viavel").length,
    contratos: contratos.filter((h) => respDoCaso.get(h.caso_id) === p.id).length,
    audiencias: (audiencias ?? []).filter((a) => a.responsavel_id === p.id).length,
    tarefas: (tarefas ?? []).filter((t) => t.responsavel_id === p.id).length,
    atrasadas: (tarefas ?? []).filter((t) => t.responsavel_id === p.id && t.vence_em && t.vence_em < hoje).length,
  }));

  const ativosPorArea = (areas ?? []).map((a) => ({ ...a, n: listaCasos.filter((c) => c.area_id === a.id && c.etapa !== "nao_viavel").length }));
  const maxArea = Math.max(1, ...ativosPorArea.map((a) => a.n));
  const [anoSel, mesSel] = mes.split("-").map(Number);

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Indicadores</h1>
          <p>Números para consulta, do escritório e de cada pessoa. Sem pontuação e sem ranking: a equipe aparece em ordem alfabética.</p>
        </div>
      </div>

      <div className="filtros">
        {Array.from({ length: 6 }, (_, i) => somarMes(atual, -i)).map((m) => {
          const [a, mm] = m.split("-").map(Number);
          return (
            <Link key={m} className={"fp" + (m === mes ? " on" : "")} href={`/indicadores?mes=${m}`}>
              {MESES[mm - 1]}/{String(a).slice(2)}
            </Link>
          );
        })}
      </div>

      <div className="grid kpis">
        <div className="card kpi"><div className="lbl">Casos novos em {MESES_LONGO[mesSel - 1]}</div><div className="val">{novos}</div></div>
        <div className="card kpi"><div className="lbl">Consultas agendadas</div><div className="val">{consultas}</div></div>
        <div className="card kpi">
          <div className="lbl">Contratos assinados</div><div className="val">{contratos.length}</div>
          <div className="sub">{conversao === null ? "sem consultas no mês" : `${conversao}% das consultas`}</div>
        </div>
        <div className="card kpi"><div className="lbl">Audiências no mês</div><div className="val">{(audiencias ?? []).length}</div><div className="sub">{naoViaveis} {naoViaveis === 1 ? "caso não viável" : "casos não viáveis"}</div></div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="ctitle"><h3>Casos novos por mês</h3><span className="tag">até {MESES_LONGO[mesSel - 1]} de {anoSel}</span></div>
          <svg viewBox="0 0 600 196" className="grafico" role="img" aria-label={`Casos novos por mês: ${meses.map((m, i) => `${MESES[Number(m.slice(5)) - 1]} ${valores[i]}`).join(", ")}`}>
            {Array.from({ length: topo / passo + 1 }, (_, i) => i * passo).map((v) => (
              <g key={v}>
                <line className="grade" x1={X0} x2={X1} y1={y(v)} y2={y(v)} />
                <text className="eixo" x={X0 - 8} y={y(v) + 4} textAnchor="end">{v}</text>
              </g>
            ))}
            {meses.map((m, i) => {
              const v = valores[i];
              const largura = Math.min(56, larguraFaixa - 14);
              const x = X0 + i * larguraFaixa + (larguraFaixa - largura) / 2;
              const alto = Y1 - y(v);
              const sel = m === mes;
              const rotulo = `${MESES_LONGO[Number(m.slice(5)) - 1]}: ${v} ${v === 1 ? "caso novo" : "casos novos"}`;
              return (
                <g key={m}>
                  <title>{rotulo}</title>
                  {/* área de toque maior que a barra */}
                  <rect x={X0 + i * larguraFaixa} y={Y0} width={larguraFaixa} height={Y1 - Y0} fill="transparent" />
                  {v > 0 && (
                    <path
                      className={sel ? "barra sel" : "barra"}
                      d={`M${x},${Y1} V${Y1 - alto + Math.min(4, alto)} q0,-${Math.min(4, alto)} ${Math.min(4, alto)},-${Math.min(4, alto)} H${x + largura - Math.min(4, alto)} q${Math.min(4, alto)},0 ${Math.min(4, alto)},${Math.min(4, alto)} V${Y1} Z`}
                    />
                  )}
                  {sel && <text className="valor" x={x + largura / 2} y={y(v) - 6} textAnchor="middle">{v}</text>}
                  <text className="eixo" x={x + largura / 2} y={Y1 + 18} textAnchor="middle">{MESES[Number(m.slice(5)) - 1]}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="card">
          <div className="ctitle"><h3>Situação agora</h3></div>
          <div className="list">
            <div className="li"><div className="bd"><b>Tarefas atrasadas</b><small>de todo o escritório</small></div><span className={"chip" + (atrasadas ? " crit" : " good")}>{atrasadas}</span></div>
            <div className="li"><div className="bd"><b>Processos sem movimentação há mais de 60 dias</b><small><Link href="/processos?filtro=parados" style={{ color: "var(--accent)" }}>ver lista</Link></small></div><span className={"chip" + (parados ? " warn" : " good")}>{parados ?? 0}</span></div>
          </div>
          <div className="dayhead" style={{ marginTop: 16 }}>Casos ativos por área</div>
          <div className="abar">
            {ativosPorArea.map((a) => (
              <div className="ab" key={a.id} style={{ "--c": a.cor } as React.CSSProperties}>
                <div className="r"><span><span className="dot" style={{ marginRight: 8 }} />{a.nome}</span><span>{a.n}</span></div>
                <div className="t"><i style={{ width: `${(a.n / maxArea) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "6px 6px 2px" }}>
        <div className="ctitle" style={{ padding: "12px 12px 0" }}><h3>Equipe</h3><span className="tag">{MESES_LONGO[mesSel - 1]} · ordem alfabética</span></div>
        <div className="scrollx">
          <table className="tbl">
            <thead><tr><th>Pessoa</th><th className="num">Casos ativos</th><th className="num">Contratos no mês</th><th className="num">Audiências no mês</th><th className="num">Tarefas abertas</th><th className="num">Atrasadas</th></tr></thead>
            <tbody>
              {equipe.map((p) => (
                <tr key={p.id}>
                  <td><b style={{ fontWeight: 500 }}>{p.nome}</b>{p.cargo && <span className="cargo">{p.cargo}</span>}</td>
                  <td className="num">{p.ativos}</td>
                  <td className="num">{p.contratos}</td>
                  <td className="num">{p.audiencias}</td>
                  <td className="num">{p.tarefas}</td>
                  <td className="num">{p.atrasadas ? <span className="chip crit">{p.atrasadas}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
