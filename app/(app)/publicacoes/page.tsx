import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { FocoPublicacoes } from "@/components/FocoPublicacoes";
import { TextoPublicacao } from "@/components/TextoPublicacao";
import { lerFeriadosLocais } from "@/lib/feriadosLocais";
import { quemSou } from "@/lib/permissoes";
import { religarPublicacoes } from "@/lib/recorte";
import { TZ } from "@/lib/rotulos";
import { voltarParaTratar } from "./actions";
import { after } from "next/server";
import { conexaoDoUsuario } from "@/lib/googleUsuario";
import { importarRecorteDoGmail } from "@/lib/recorteImportar";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buscarRecorteAgora } from "../perfil/actions";

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
  situacao: "nova" | "ciencia" | "tarefa" | "audiencia" | "prazo";
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
const SITUACAO: Record<Pub["situacao"], string> = { nova: "para tratar", ciencia: "ciência", tarefa: "virou tarefa", audiencia: "audiência agendada", prazo: "virou prazo" };

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export default async function Publicacoes({ searchParams }: { searchParams: Promise<{ f?: string; tipo?: string }> }) {
  const { f = "novas", tipo } = await searchParams;
  const { supabase, papel, user } = await quemSou();
  const meuGoogle = user ? await conexaoDoUsuario(user.id).catch(() => null) : null;
  // Gmails ligados em Meu perfil: se faz mais de 20 minutos que ninguém leu, lê depois de mostrar a página
  after(async () => {
    try {
      const admin = supabaseAdmin();
      const { data } = await admin.from("google_usuarios").select("gmail_lido_em").eq("gmail", true);
      const limite = Date.now() - 20 * 60_000;
      if ((data ?? []).some((x) => !x.gmail_lido_em || new Date(x.gmail_lido_em).getTime() < limite)) await importarRecorteDoGmail(admin);
    } catch {
      // sem a tabela (script 020) ou sem Google: nada a fazer
    }
  });
  // Publicações de processos cadastrados depois que elas chegaram: liga agora (sem a tabela, não faz nada)
  await religarPublicacoes(supabase).catch(() => 0);
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

  const [{ data, error }, { count: paraTratar }, { data: ultimo }, { data: pessoas }, feriadosLocais] = await Promise.all([
    consulta,
    supabase.from("publicacoes").select("id", { count: "exact", head: true }).eq("situacao", "nova"),
    supabase.from("recortes_recebidos").select("dia, publicacoes, recebido_em").order("dia", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    lerFeriadosLocais(supabase),
  ]);
  const feriados = feriadosLocais.map((x) => x.dia);
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
        {meuGoogle?.gmail && <div style={{ marginLeft: "auto" }}><BotaoAcao acao={buscarRecorteAgora} rotulo="Buscar no Gmail" /></div>}
      </div>

      {semTabela && <div className="aviso info" style={{ marginBottom: 16 }}>{"Falta rodar o script supabase/017_publicacoes.sql no Supabase."}</div>}
      {!semTabela && !ultimo && (
        <div className="aviso info" style={{ marginBottom: 16 }}>
          Ainda não chegou nenhum e-mail do Recorte. Quem recebe o Recorte no Gmail pode ligar a leitura em{" "}
          <Link href="/perfil#google" style={{ color: "var(--accent)" }}>Meu perfil › Sua conta Google › Conectar meu Gmail</Link>.
        </div>
      )}
      {atrasado && (
        <div className="aviso erro" style={{ marginBottom: 16 }}>
          O e-mail do Recorte de hoje ainda não foi levado ao Órion.{" "}
          {meuGoogle?.gmail
            ? "Se ele já está no seu Gmail, toque em “Buscar no Gmail” aqui em cima."
            : <>Se ele já está no seu Gmail, ligue a leitura em <Link href="/perfil#google" style={{ textDecoration: "underline" }}>Meu perfil › Conectar meu Gmail</Link>{papel === "administrador" ? <> (ou confira o script em <Link href="/integracoes#recorte" style={{ textDecoration: "underline" }}>Integrações</Link>)</> : null}.</>}{" "}
          Enquanto isso, confira em recortedigital.oabes.org.br para não perder nenhuma publicação.
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

      {!tratadas ? (
        <FocoPublicacoes
          pubs={lista.map((p) => ({
            id: p.id, numero_cnj: p.numero_cnj, processo_id: p.processo_id, publicada_em: p.publicada_em, disponibilizada_em: p.disponibilizada_em,
            jornal: p.jornal, caderno: p.caderno, orgao: p.orgao, texto: p.texto, link: p.link, tipo: p.tipo, audiencia_em: p.audiencia_em,
            cliente: p.clientes, audiencias: p.processo_id ? audPorProc.get(p.processo_id) ?? [] : [],
          }))}
          pessoas={pessoas ?? []}
          feriados={feriados}
        />
      ) : lista.length === 0 ? (
        <div className="card"><div className="vazio"><b>Nada tratado nos últimos 30 dias</b></div></div>
      ) : (
        <div className="pub-lista">
          {lista.map((p) => {
            const cliente = p.clientes;
            const tp = TIPO[p.tipo] ?? TIPO.outro;
            return (
              <article key={p.id} className="card pub">
                <header className="pub-topo">
                  <span className={`chip ${tp.classe}`}>{tp.rotulo}</span>
                  <b className="pub-proc">{p.numero_cnj ?? "sem número de processo"}</b>
                  {cliente && <Link href={`/clientes/${cliente.id}`} className="link-cliente">{cliente.nome}</Link>}
                  <small className="pub-data">publicada em {dataBR(p.publicada_em)}{p.disponibilizada_em ? ` · disponibilizada em ${dataBR(p.disponibilizada_em)}` : ""}</small>
                </header>
                <small className="pub-orgao">{[p.jornal, p.caderno, p.orgao].filter(Boolean).join(" · ")}</small>
                <TextoPublicacao texto={p.texto} />
                <footer className="pub-acoes">
                  <span className="chip good">{SITUACAO[p.situacao] ?? "tratada"}</span>
                  <small style={{ color: "var(--muted)" }}>{p.perfis?.nome ? `por ${p.perfis.nome}` : ""}{p.tratada_em ? ` em ${new Date(p.tratada_em).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</small>
                  <BotaoAcao acao={voltarParaTratar.bind(null, p.id)} rotulo="Voltar para tratar" />
                  {p.link && <a className="btn sm" href={p.link} target="_blank" rel="noopener">Abrir no PJe</a>}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
