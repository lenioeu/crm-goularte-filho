import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { EditarPrazo } from "@/components/EditarPrazo";
import { FormAcao } from "@/components/FormAcao";
import { FormPrazo } from "@/components/FormPrazo";
import { lerFeriadosLocais } from "@/lib/feriadosLocais";
import { quemSou } from "@/lib/permissoes";
import { dataBR, diasSemExpediente, diasUteisAte, feriadosPadrao, feriadosSugeridos } from "@/lib/prazos";
import { TZ } from "@/lib/rotulos";
import { adicionarFeriado, confirmarFeriado, confirmarSugeridos, criarPrazo, cumprirPrazo, excluirPrazo, reabrirPrazo, removerFeriado } from "./actions";

type Prazo = {
  id: string;
  descricao: string;
  processo_id: string | null;
  publicado_em: string;
  dias: number;
  contagem: "uteis" | "corridos";
  vence_em: string;
  vence_interno: string;
  responsavel_id: string | null;
  situacao: "aberto" | "cumprido" | "cancelado";
  cumprido_em: string | null;
  observacao: string | null;
  publicacao_id: string | null;
  processos: { numero_cnj: string } | null;
  clientes: { id: string; nome: string } | null;
  responsavel: { nome: string } | null;
};

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const GRUPOS = [
  { id: "vencidos", titulo: "Vencidos", classe: "crit" },
  { id: "hoje", titulo: "Vencem hoje", classe: "crit" },
  { id: "semana", titulo: "Próximos 7 dias", classe: "warn" },
  { id: "depois", titulo: "Depois", classe: "" },
] as const;

export default async function Prazos({ searchParams }: { searchParams: Promise<{ quem?: string; ver?: string; nova?: string }> }) {
  const { quem = "todos", ver, nova } = await searchParams;
  const { supabase, user } = await quemSou();
  const cumpridos = ver === "cumpridos";
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const em7 = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: TZ });
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  let consulta = supabase
    .from("prazos")
    .select("id, descricao, processo_id, publicado_em, dias, contagem, vence_em, vence_interno, responsavel_id, situacao, cumprido_em, observacao, publicacao_id, processos(numero_cnj), clientes(id, nome), responsavel:perfis!prazos_responsavel_id_fkey(nome)")
    .limit(500);
  consulta = cumpridos ? consulta.eq("situacao", "cumprido").gte("cumprido_em", ha30).order("cumprido_em", { ascending: false }) : consulta.eq("situacao", "aberto").order("vence_em");
  if (quem === "meus" && user) consulta = consulta.eq("responsavel_id", user.id);

  const [{ data, error }, locais, { data: pessoas }, { data: procs }] = await Promise.all([
    consulta,
    lerFeriadosLocais(supabase),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("processos").select("id, numero_cnj, casos(clientes(nome))").order("criado_em", { ascending: false }).limit(3000),
  ]);
  const semTabela = Boolean(error && /prazos|does not exist|schema cache|relationship/i.test(error.message));
  const lista = (data ?? []) as unknown as Prazo[];
  const feriados = diasSemExpediente(locais.map((x) => x.dia));
  const listaFeriados = locais.map((x) => x.dia);
  const processos = ((procs ?? []) as unknown as { id: string; numero_cnj: string; casos: { clientes: { nome: string } | null } | null }[])
    .map((x) => ({ id: x.id, rotulo: [x.numero_cnj, x.casos?.clientes?.nome].filter(Boolean).join(" · "), cliente: x.casos?.clientes?.nome ?? "" }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));

  const grupo = (p: Prazo) => (p.vence_em < hoje ? "vencidos" : p.vence_em === hoje ? "hoje" : p.vence_em <= em7 ? "semana" : "depois");
  const contagem = Object.fromEntries(GRUPOS.map((g) => [g.id, lista.filter((p) => grupo(p) === g.id).length]));
  const anos = [Number(hoje.slice(0, 4)), Number(hoje.slice(0, 4)) + 1];
  const proximosLocais = locais.filter((x) => x.dia >= hoje);
  const sugeridosPendentes = anos.flatMap((a) => feriadosSugeridos(a)).filter((x) => x.dia >= hoje && !listaFeriados.includes(x.dia));
  const href = (q: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries({ quem, ver, ...q }).filter(([, v]) => v && v !== "todos") as [string, string][]);
    return `/prazos${s.toString() ? `?${s}` : ""}`;
  };

  function Linha({ p }: { p: Prazo }) {
    const d = new Date(`${p.vence_em.slice(0, 10)}T12:00:00Z`);
    const faltam = diasUteisAte(hoje, p.vence_em, feriados);
    const internoPassou = p.situacao === "aberto" && p.vence_interno <= hoje && p.vence_em > hoje;
    const quando = p.situacao !== "aberto"
      ? `cumprido em ${p.cumprido_em ? new Date(p.cumprido_em).toLocaleDateString("pt-BR", { timeZone: TZ }) : "—"}`
      : faltam < 0 ? `vencido há ${-faltam} ${faltam === -1 ? "dia útil" : "dias úteis"}` : faltam === 0 ? "vence hoje" : `faltam ${faltam} ${faltam === 1 ? "dia útil" : "dias úteis"}`;
    return (
      <div className={"li prazo" + (p.situacao === "aberto" && p.vence_em <= hoje ? " urgente" : "")}>
        <div className="prazo-data"><small>{SEMANA[d.getUTCDay()]}</small><b>{dataBR(p.vence_em).slice(0, 5)}</b><small>{p.vence_em.slice(0, 4)}</small></div>
        <div className="bd">
          <b>{p.descricao}{p.clientes ? <> · <Link href={`/clientes/${p.clientes.id}`} className="link-cliente">{p.clientes.nome}</Link></> : null}</b>
          <small>
            {[p.processos?.numero_cnj, `publicado em ${dataBR(p.publicado_em)}`, `${p.dias} ${p.contagem === "uteis" ? "dias úteis" : "dias corridos"}`, p.responsavel?.nome].filter(Boolean).join(" · ")}
          </small>
          <small>
            <span className={"chip " + (p.situacao !== "aberto" ? "good" : faltam <= 0 ? "crit" : faltam <= 3 ? "warn" : "")}>{quando}</span>
            {p.situacao === "aberto" && <span className={"chip " + (internoPassou ? "warn" : "")} style={{ marginLeft: 6 }}>interno {dataBR(p.vence_interno)}</span>}
            {p.observacao && <span style={{ marginLeft: 8 }}>{p.observacao}</span>}
          </small>
        </div>
        <div className="prazo-acoes">
          {p.situacao === "aberto" ? (
            <BotaoAcao acao={cumprirPrazo.bind(null, p.id)} rotulo="Cumprido" desfazer={reabrirPrazo.bind(null, p.id)} className="btn sm primary" />
          ) : (
            <BotaoAcao acao={reabrirPrazo.bind(null, p.id)} rotulo="Reabrir" />
          )}
          <EditarPrazo
            prazo={{ id: p.id, descricao: p.descricao, publicado_em: p.publicado_em, dias: p.dias, contagem: p.contagem, interno_dias: Math.max(0, diasUteisAte(p.vence_interno, p.vence_em, feriados)), responsavel_id: p.responsavel_id, observacao: p.observacao }}
            pessoas={pessoas ?? []}
            feriados={listaFeriados}
            titulo={[p.descricao, p.clientes?.nome, p.processos?.numero_cnj].filter(Boolean).join(" · ")}
          />
          <BotaoAcao acao={excluirPrazo.bind(null, p.id)} rotulo="Excluir" className="linkbtn" confirmar={`Excluir o prazo “${p.descricao}”? Se ele veio de uma publicação, ela volta para “Para tratar”.`} />
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Prazos</h1>
          <p>
            Prazos processuais com vencimento fatal e interno, contados pelo Órion. Os que vêm das publicações do Recorte já nascem ligados ao
            processo e ao cliente. Confira sempre no calendário do tribunal.
          </p>
        </div>
      </div>

      {semTabela && <div className="aviso info" style={{ marginBottom: 16 }}>Falta rodar o script supabase/018_prazos.sql no Supabase.</div>}
      {error && !semTabela && <div className="aviso erro" style={{ marginBottom: 16 }}>Não foi possível carregar os prazos: {error.message}</div>}

      {!cumpridos && (
        <div className="grid kpis prazo-kpis" style={{ marginBottom: 16 }}>
          {GRUPOS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className={"card kpi" + (g.classe && contagem[g.id] ? ` kpi-${g.classe}` : "")}>
              <div className="lbl">{g.titulo}</div>
              <div className="val">{contagem[g.id]}</div>
            </a>
          ))}
        </div>
      )}

      <details className="card novo" style={{ marginBottom: 16 }} open={Boolean(nova)}>
        <summary><span className="btn primary">+ Novo prazo</span></summary>
        <FormPrazo action={criarPrazo} processos={processos} pessoas={pessoas ?? []} feriados={listaFeriados} botao="Criar prazo" />
      </details>

      <div className="filtros chat-abas" style={{ alignItems: "center" }}>
        <Link className={"fp" + (!cumpridos ? " on" : "")} href={href({ ver: undefined })}>Abertos</Link>
        <Link className={"fp" + (cumpridos ? " on" : "")} href={href({ ver: "cumpridos" })}>Cumpridos (30 dias)</Link>
        <span style={{ flex: 1 }} />
        <Link className={"fp" + (quem !== "meus" ? " on" : "")} href={href({ quem: "todos" })}>De todos</Link>
        <Link className={"fp" + (quem === "meus" ? " on" : "")} href={href({ quem: "meus" })}>Só os meus</Link>
      </div>

      {cumpridos ? (
        <div className="card">{lista.length ? <div className="list">{lista.map((p) => <Linha key={p.id} p={p} />)}</div> : <div className="vazio">Nenhum prazo cumprido nos últimos 30 dias.</div>}</div>
      ) : lista.length === 0 ? (
        <div className="card"><div className="vazio"><b>Nenhum prazo aberto</b>Crie pelo “+ Novo prazo” ou, em Publicações, pelo “Criar prazo” de cada intimação.</div></div>
      ) : (
        GRUPOS.filter((g) => contagem[g.id]).map((g) => (
          <section key={g.id} id={g.id} className="card" style={{ marginBottom: 16 }}>
            <div className="ctitle"><h3>{g.titulo}</h3><span className={`chip ${g.classe}`}>{contagem[g.id]}</span></div>
            <div className="list">{lista.filter((p) => grupo(p) === g.id).map((p) => <Linha key={p.id} p={p} />)}</div>
          </section>
        ))
      )}

      <details className="card" id="feriados" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Feriados e dias sem expediente · {proximosLocais.length} cadastrados</summary>
        <p style={{ color: "var(--muted)", fontSize: 13.5 }}>
          O Órion já conta os feriados nacionais ({feriadosPadrao(anos[0]).length} por ano) e o recesso de 20/12 a 20/01. Os dias que dependem do
          tribunal ou do município só contam depois de cadastrados aqui. Na dúvida, não cadastre: um dia a menos no prazo é seguro, um dia a
          mais faz perder prazo.
        </p>
        {sugeridosPendentes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="dayhead" style={{ margin: "0 0 6px" }}>Sugestões para confirmar (comuns na Justiça, mas variam por tribunal)</div>
            <div className="feriados-lista">
              {sugeridosPendentes.map((x) => (
                <BotaoAcao key={x.dia} acao={confirmarFeriado.bind(null, x.dia, x.nome)} rotulo={`+ ${dataBR(x.dia)} · ${x.nome}`} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {anos.map((a) => <BotaoAcao key={a} acao={confirmarSugeridos.bind(null, a)} rotulo={`Confirmar todas de ${a}`} />)}
            </div>
          </div>
        )}
        <div className="dayhead" style={{ margin: "0 0 6px" }}>Cadastrados</div>
        {proximosLocais.length === 0 ? (
          <div className="vazio" style={{ padding: "6px 0" }}>Nenhum dia sem expediente cadastrado.</div>
        ) : (
          <div className="feriados-lista">
            {proximosLocais.map((x) => (
              <span key={x.dia} className="chip">
                {dataBR(x.dia)} · {x.descricao}
                <BotaoAcao acao={removerFeriado.bind(null, x.dia)} rotulo="×" className="tipo-remover" confirmar={`Remover ${dataBR(x.dia)}?`} />
              </span>
            ))}
          </div>
        )}
        <FormAcao action={adicionarFeriado} botao="+ Cadastrar dia" className="chat-mini" limparAoSalvar>
          <input name="dia" type="date" required aria-label="Dia" style={{ maxWidth: 170 }} />
          <input name="descricao" required placeholder="ex.: Nossa Senhora da Penha, ponto facultativo do TJES" aria-label="Que dia é" />
        </FormAcao>
      </details>
    </div>
  );
}
