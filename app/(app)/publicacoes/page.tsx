import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAcao } from "@/components/FormAcao";
import { Icone } from "@/components/Icone";
import { TextoPublicacao } from "@/components/TextoPublicacao";
import { quemSou } from "@/lib/permissoes";
import { TIPOS_AUDIENCIA, TZ } from "@/lib/rotulos";
import { audienciaDaPublicacao, darCiencia, tarefaDaPublicacao, voltarParaTratar } from "./actions";

type Pub = {
  id: string;
  numero_cnj: string | null;
  processo_id: string | null;
  publicada_em: string | null;
  disponibilizada_em: string | null;
  jornal: string | null;
  caderno: string | null;
  orgao: string | null;
  texto: string;
  link: string | null;
  tipo: "intimacao" | "audiencia" | "distribuicao" | "outro";
  audiencia_em: string | null;
  situacao: "nova" | "ciencia" | "tarefa" | "audiencia";
  tratada_em: string | null;
  clientes: { id: string; nome: string } | null;
  perfis: { nome: string } | null;
};

const TIPO: Record<Pub["tipo"], { rotulo: string; classe: string }> = {
  intimacao: { rotulo: "Intimação", classe: "warn" },
  audiencia: { rotulo: "Audiência", classe: "acc" },
  distribuicao: { rotulo: "Distribuição", classe: "" },
  outro: { rotulo: "Outra", classe: "" },
};
const SITUACAO: Record<Pub["situacao"], string> = { nova: "para tratar", ciencia: "ciência", tarefa: "virou tarefa", audiencia: "audiência agendada" };

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Sugestão de vencimento: N dias úteis depois da publicação (só pula sábado e domingo; confira feriados). */
function maisDiasUteis(iso: string | null, n: number) {
  const d = new Date(`${iso ?? new Date().toLocaleDateString("sv-SE", { timeZone: TZ })}T12:00:00-03:00`);
  for (let i = 0; i < n; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) i++;
  }
  return d.toISOString().slice(0, 10);
}

export default async function Publicacoes({ searchParams }: { searchParams: Promise<{ f?: string; tipo?: string }> }) {
  const { f = "novas", tipo } = await searchParams;
  const { supabase, papel } = await quemSou();
  const tratadas = f === "tratadas";
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  let consulta = supabase
    .from("publicacoes")
    .select("id, numero_cnj, processo_id, publicada_em, disponibilizada_em, jornal, caderno, orgao, texto, link, tipo, audiencia_em, situacao, tratada_em, clientes(id, nome), perfis(nome)")
    .order("publicada_em", { ascending: false, nullsFirst: false })
    .order("criado_em", { ascending: false })
    .limit(300);
  consulta = tratadas ? consulta.neq("situacao", "nova").gte("tratada_em", ha30) : consulta.eq("situacao", "nova");
  if (tipo && tipo in TIPO) consulta = consulta.eq("tipo", tipo);

  const [{ data, error }, { count: paraTratar }, { data: ultimo }, { data: pessoas }] = await Promise.all([
    consulta,
    supabase.from("publicacoes").select("id", { count: "exact", head: true }).eq("situacao", "nova"),
    supabase.from("recortes_recebidos").select("dia, publicacoes, recebido_em").order("dia", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const lista = (data ?? []) as unknown as Pub[];
  const semTabela = Boolean(error && /publicacoes|does not exist|schema cache/i.test(error.message));

  // Audiências futuras dos processos da lista, para não agendar em dobro uma audiência remarcada
  const idsProc = [...new Set(lista.map((p) => p.processo_id).filter((x): x is string => Boolean(x)))];
  const { data: auds } = idsProc.length
    ? await supabase.from("audiencias").select("processo_id, tipo, inicio").in("processo_id", idsProc).gte("inicio", new Date().toISOString()).order("inicio")
    : { data: [] as { processo_id: string; tipo: string; inicio: string }[] };
  const audPorProc = new Map<string, { tipo: string; inicio: string }[]>();
  (auds ?? []).forEach((a) => audPorProc.set(a.processo_id, [...(audPorProc.get(a.processo_id) ?? []), a]));

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const diaUtil = ![0, 6].includes(new Date(`${hoje}T12:00:00-03:00`).getDay());
  const horaSP = Number(new Date().toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", hour12: false }));
  const atrasado = Boolean(ultimo && diaUtil && horaSP >= 9 && ultimo.dia < hoje);
  const href = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ f, tipo, ...q }).filter(([, v]) => v) as [string, string][]);
    return `/publicacoes${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Publicações</h1>
          <p>
            Intimações e publicações do Recorte Digital da OAB/ES, que chegam sozinhas todo dia de manhã. Trate cada uma: ciência, tarefa ou
            audiência.
            {ultimo && <> Último e-mail: <b>{dataBR(ultimo.dia)}</b>, com {ultimo.publicacoes} {ultimo.publicacoes === 1 ? "publicação" : "publicações"}.</>}
          </p>
        </div>
      </div>

      {semTabela && <div className="aviso info" style={{ marginBottom: 16 }}>{"Falta rodar o script supabase/017_publicacoes.sql no Supabase."}</div>}
      {!semTabela && !ultimo && (
        <div className="aviso info" style={{ marginBottom: 16 }}>
          Ainda não chegou nenhum e-mail do Recorte. {papel === "administrador" ? <>Ligue o script do Gmail em <Link href="/integracoes#recorte" style={{ color: "var(--accent)" }}>Integrações › Recorte Digital</Link>.</> : "Peça ao administrador para ligar o script do Gmail em Integrações."}
        </div>
      )}
      {atrasado && (
        <div className="aviso erro" style={{ marginBottom: 16 }}>
          O e-mail do Recorte de hoje ainda não chegou ao Órion. Confira o histórico em recortedigital.oabes.org.br para não perder nenhuma publicação.
        </div>
      )}
      {error && !semTabela && <div className="aviso erro" style={{ marginBottom: 16 }}>Não foi possível carregar as publicações: {error.message}</div>}

      <div className="filtros chat-abas" style={{ alignItems: "center" }}>
        <Link className={"fp" + (!tratadas ? " on" : "")} href={href({ f: undefined })}>
          Para tratar
          {(paraTratar ?? 0) > 0 && <span className="aba-pendentes">{(paraTratar ?? 0) > 99 ? "99+" : paraTratar}</span>}
        </Link>
        <Link className={"fp" + (tratadas ? " on" : "")} href={href({ f: "tratadas" })}>Tratadas (30 dias)</Link>
        <span style={{ flex: 1 }} />
        <Link className={"fp" + (!tipo ? " on" : "")} href={href({ tipo: undefined })}>Todas</Link>
        {(Object.keys(TIPO) as Pub["tipo"][]).map((t) => (
          <Link key={t} className={"fp" + (tipo === t ? " on" : "")} href={href({ tipo: t })}>{TIPO[t].rotulo}</Link>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="card"><div className="vazio"><b>{tratadas ? "Nada tratado nos últimos 30 dias" : "Nenhuma publicação para tratar"}</b>{tratadas ? "" : "Quando o Recorte trouxer algo, aparece aqui."}</div></div>
      ) : (
        <div className="pub-lista">
          {lista.map((p) => {
            const cliente = p.clientes;
            const tp = TIPO[p.tipo] ?? TIPO.outro;
            const futuras = p.processo_id ? audPorProc.get(p.processo_id) ?? [] : [];
            const audData = p.audiencia_em ? new Date(p.audiencia_em).toLocaleDateString("sv-SE", { timeZone: TZ }) : "";
            const audHora = p.audiencia_em ? new Date(p.audiencia_em).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "";
            return (
              <article key={p.id} className="card pub">
                <header className="pub-topo">
                  <span className={`chip ${tp.classe}`}>{tp.rotulo}</span>
                  <b className="pub-proc">{p.numero_cnj ?? "sem número de processo"}</b>
                  {cliente ? (
                    <Link href={`/clientes/${cliente.id}`} className="link-cliente">{cliente.nome}</Link>
                  ) : p.numero_cnj ? (
                    <Link href={`/processos?nova=1&numero=${encodeURIComponent(p.numero_cnj)}`} className="chip warn" title="Este processo não está no Órion">processo não cadastrado · cadastrar</Link>
                  ) : null}
                  <small className="pub-data">publicada em {dataBR(p.publicada_em)}{p.disponibilizada_em ? ` · disponibilizada em ${dataBR(p.disponibilizada_em)}` : ""}</small>
                </header>
                <small className="pub-orgao">{[p.jornal, p.caderno, p.orgao].filter(Boolean).join(" · ")}</small>
                <TextoPublicacao texto={p.texto} />

                {p.tipo === "audiencia" && p.audiencia_em && (
                  <div className="aviso info pub-aud">
                    <Icone nome="calendario" tamanho={16} /> O texto cita audiência em <b>{dataBR(audData)} às {audHora}</b>.
                    {futuras.length > 0 && <> Já há no Órion: {futuras.map((a) => `${a.tipo} em ${new Date(a.inicio).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`).join("; ")}. Se for a mesma, edite em Audiências em vez de agendar outra.</>}
                  </div>
                )}

                {p.situacao === "nova" ? (
                  <footer className="pub-acoes">
                    <BotaoAcao acao={darCiencia.bind(null, p.id)} rotulo="Ciência" desfazer={voltarParaTratar.bind(null, p.id)} />
                    <details className="pub-mais">
                      <summary className="btn sm">Criar tarefa</summary>
                      <FormAcao action={tarefaDaPublicacao} botao="Criar tarefa" className="form form-compacto">
                        <input type="hidden" name="id" value={p.id} />
                        <div className="field full"><label htmlFor={`pt_t_${p.id}`}>O que fazer</label><input id={`pt_t_${p.id}`} name="titulo" required defaultValue={`${tp.rotulo}: ${p.numero_cnj ?? ""}${cliente ? ` · ${cliente.nome}` : ""}`} /></div>
                        <div className="field"><label htmlFor={`pt_v_${p.id}`}>Até quando</label><input id={`pt_v_${p.id}`} name="vence_em" type="date" defaultValue={maisDiasUteis(p.publicada_em, 5)} /><small className="dica">Sugestão: 5 dias úteis após a publicação. Confira o prazo real.</small></div>
                        <div className="field">
                          <label htmlFor={`pt_r_${p.id}`}>Responsável</label>
                          <select id={`pt_r_${p.id}`} name="responsavel_id" defaultValue="">
                            <option value="">Eu</option>
                            {(pessoas ?? []).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                          </select>
                        </div>
                      </FormAcao>
                    </details>
                    {p.processo_id && (
                      <details className="pub-mais" open={false}>
                        <summary className="btn sm">Agendar audiência</summary>
                        <FormAcao action={audienciaDaPublicacao} botao="Agendar audiência" className="form form-compacto">
                          <input type="hidden" name="publicacao_id" value={p.id} />
                          <input type="hidden" name="processo_id" value={p.processo_id} />
                          <div className="field">
                            <label htmlFor={`pa_t_${p.id}`}>Tipo</label>
                            <select id={`pa_t_${p.id}`} name="tipo" defaultValue={TIPOS_AUDIENCIA[0]}>{TIPOS_AUDIENCIA.map((t) => <option key={t}>{t}</option>)}</select>
                          </div>
                          <div className="field"><label htmlFor={`pa_d_${p.id}`}>Dia</label><input id={`pa_d_${p.id}`} name="data" type="date" required defaultValue={audData} /></div>
                          <div className="field"><label htmlFor={`pa_h_${p.id}`}>Hora</label><input id={`pa_h_${p.id}`} name="hora" type="time" required defaultValue={audHora} /></div>
                          <div className="field">
                            <label htmlFor={`pa_m_${p.id}`}>Modalidade</label>
                            <select id={`pa_m_${p.id}`} name="modalidade" defaultValue="presencial"><option value="presencial">Presencial</option><option value="video">Por vídeo</option></select>
                          </div>
                          <div className="field full"><label htmlFor={`pa_l_${p.id}`}>Local</label><input id={`pa_l_${p.id}`} name="local" defaultValue={p.orgao?.split(" - ").slice(-1)[0] ?? ""} /></div>
                          <small className="dica full">Mensagens ao cliente pelo WhatsApp: programe pelo “Editar” da audiência, em Audiências.</small>
                        </FormAcao>
                      </details>
                    )}
                    {p.link && <a className="btn sm" href={p.link} target="_blank" rel="noopener">Abrir no PJe</a>}
                  </footer>
                ) : (
                  <footer className="pub-acoes">
                    <span className="chip good">{SITUACAO[p.situacao] ?? "tratada"}</span>
                    <small style={{ color: "var(--muted)" }}>{p.perfis?.nome ? `por ${p.perfis.nome}` : ""}{p.tratada_em ? ` em ${new Date(p.tratada_em).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</small>
                    <BotaoAcao acao={voltarParaTratar.bind(null, p.id)} rotulo="Voltar para tratar" />
                    {p.link && <a className="btn sm" href={p.link} target="_blank" rel="noopener">Abrir no PJe</a>}
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
