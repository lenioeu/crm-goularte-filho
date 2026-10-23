import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAcao } from "@/components/FormAcao";
import { ImportarLista } from "@/components/ImportarLista";
import { ImportarProcessos } from "@/components/ImportarProcessos";
import { supabaseServer } from "@/lib/supabase/server";
import { atualizarProcesso, atualizarTodos, cadastrarProcesso } from "./actions";

export const maxDuration = 60;

type Movimento = { data: string; nome: string };
type Processo = {
  id: string;
  numero_cnj: string;
  tribunal: string | null;
  vara: string | null;
  classe: string | null;
  ultima_movimentacao: string | null;
  ultima_movimentacao_em: string | null;
  sincronizado_em: string | null;
  movimentos: Movimento[] | null;
  casos: { titulo: string; parte_contraria: string | null; clientes: { id: string; nome: string } | null; areas: { nome: string; cor: string } | null } | null;
};

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const diasDesde = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

export default async function Processos({ searchParams }: { searchParams: Promise<{ filtro?: string; cliente?: string; nova?: string; ordem?: string }> }) {
  const { filtro, cliente, nova, ordem = "movimentacao" } = await searchParams;
  const supabase = await supabaseServer();
  const [{ data, error }, { data: casos }, { data: clientes }] = await Promise.all([
    supabase
      .from("processos")
      .select("id, numero_cnj, tribunal, vara, classe, ultima_movimentacao, ultima_movimentacao_em, sincronizado_em, movimentos, casos(titulo, parte_contraria, clientes(id, nome), areas(nome, cor))")
      .eq("arquivado", false)
      .order("ultima_movimentacao_em", { ascending: false, nullsFirst: false })
      .limit(2000),
    supabase.from("casos").select("id, titulo, clientes(nome)").neq("etapa", "nao_viavel").order("atualizado_em", { ascending: false }).limit(1000),
    supabase.from("clientes").select("id, nome").order("nome").limit(3000),
  ]);

  const todos = (data ?? []) as unknown as Processo[];
  const semana = todos.filter((p) => (diasDesde(p.ultima_movimentacao_em) ?? 999) <= 7);
  const parados = todos.filter((p) => (diasDesde(p.ultima_movimentacao_em) ?? 0) > 60);
  const filtrada = filtro === "semana" ? semana : filtro === "parados" ? parados : todos;
  // Ordenar pela coluna clicada (‑ na frente = decrescente)
  const desc = ordem.startsWith("-");
  const campo = ordem.replace(/^-/, "");
  const chave = (p: Processo): string =>
    campo === "cliente" ? p.casos?.clientes?.nome ?? "" : campo === "numero" ? p.numero_cnj : campo === "tribunal" ? `${p.tribunal ?? ""} ${p.vara ?? ""}` : p.ultima_movimentacao_em ?? "";
  const lista = [...filtrada].sort((a, b) => {
    const r = chave(a).localeCompare(chave(b), "pt-BR");
    return (campo === "movimentacao" ? -r : r) * (desc ? -1 : 1);
  });
  const th = (c: string, rotulo: string) => {
    const ativo = campo === c;
    const proxima = ativo && !desc ? `-${c}` : c;
    const q = new URLSearchParams({ ...(filtro ? { filtro } : {}), ordem: proxima });
    return (
      <th aria-sort={ativo ? (desc ? "descending" : "ascending") : "none"}>
        <Link href={`/processos?${q}`} className="th-ordem">{rotulo}{ativo ? (desc ? " ▲" : " ▼") : ""}</Link>
      </th>
    );
  };
  const listaCasos = (casos ?? []) as unknown as { id: string; titulo: string; clientes: { nome: string } | null }[];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Processos</h1>
          <p>
            Dados da consulta pública do CNJ (DataJud), atualizados todo dia de manhã. Os tribunais enviam as movimentações com
            alguns dias de atraso, e processos em segredo de justiça não aparecem.
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}><BotaoAcao acao={atualizarTodos} rotulo="Atualizar agora" /></div>
      </div>

      <div className="filtros">
        <Link className={"fp" + (!filtro ? " on" : "")} href="/processos">Ativos · {todos.length}</Link>
        <Link className={"fp" + (filtro === "semana" ? " on" : "")} href="/processos?filtro=semana">Movimentados na semana · {semana.length}</Link>
        <Link className={"fp" + (filtro === "parados" ? " on" : "")} href="/processos?filtro=parados">Parados há mais de 60 dias · {parados.length}</Link>
      </div>

      <details className="card novo" style={{ marginBottom: 16 }} open={Boolean(cliente || nova)}>
        <summary><span className="btn primary">+ Cadastrar processo</span></summary>
        <FormAcao action={cadastrarProcesso} botao="Cadastrar e consultar no CNJ" className="form">
          <div className="field">
            <label htmlFor="cliente_id">Cliente</label>
            <select id="cliente_id" name="cliente_id" defaultValue={cliente ?? ""}>
              <option value="">Escolha o cliente</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="numero">Número do processo (CNJ)</label>
            <input id="numero" name="numero" required inputMode="numeric" placeholder="0000000-00.0000.0.00.0000" />
          </div>
          <div className="field full">
            <label htmlFor="caso_id">Caso</label>
            <select id="caso_id" name="caso_id" defaultValue="">
              <option value="">Criar um caso novo para o cliente, com o nome da ação</option>
              {listaCasos.map((c) => <option key={c.id} value={c.id}>Ligar ao caso: {c.clientes?.nome} · {c.titulo}</option>)}
            </select>
            <small style={{ color: "var(--dim)", fontSize: 12 }}>
              Deixe em “criar caso novo” se o processo ainda não tem caso no funil. O caso entra como contrato assinado, com você como responsável.
            </small>
          </div>
        </FormAcao>
      </details>

      <details className="card" style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Importar lista de processos (acervo do PJe ou planilha)</summary>
        <div style={{ marginTop: 12 }}><ImportarLista /></div>
      </details>

      <details className="card" style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Procurar processos nas pastas do Drive</summary>
        <div style={{ marginTop: 12 }}><ImportarProcessos /></div>
      </details>

      {error && <div className="aviso erro" style={{ marginBottom: 16 }}>Não foi possível carregar os processos: {error.message}. Se falar em coluna inexistente, rode o script 002_google.sql no Supabase.</div>}

      <div className="card" style={{ padding: "6px 6px 2px" }}>
        {lista.length === 0 ? (
          <div className="vazio"><b>Nenhum processo aqui</b>Cadastre pelo botão “+ Cadastrar processo”.</div>
        ) : (
          <div className="scrollx tabela-alta">
            <table className="tbl">
              <thead><tr>{th("numero", "Processo")}{th("cliente", "Cliente")}{th("tribunal", "Tribunal e vara")}{th("movimentacao", "Última movimentação")}<th></th></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="num" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, whiteSpace: "nowrap" }}>{p.numero_cnj}</span>
                      {p.classe && <small>{p.classe}</small>}
                    </td>
                    <td>
                      {p.casos?.clientes ? <Link href={`/clientes/${p.casos.clientes.id}`} style={{ fontWeight: 500, color: "var(--accent)" }}>{p.casos.clientes.nome}</Link> : "—"}
                      {p.casos?.parte_contraria && <small>× {p.casos.parte_contraria}</small>}
                      {p.casos?.areas && <span className="chip area" style={{ "--c": p.casos.areas.cor, marginTop: 4 } as React.CSSProperties}>{p.casos.areas.nome}</span>}
                    </td>
                    <td>{p.tribunal ?? "—"}{p.vara && <small>{p.vara}</small>}</td>
                    <td style={{ minWidth: 220 }}>
                      {p.ultima_movimentacao ? (
                        <details>
                          <summary style={{ cursor: "pointer" }}>{p.ultima_movimentacao} <small style={{ display: "inline" }}>· {dataBR(p.ultima_movimentacao_em)}</small></summary>
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--muted)" }}>
                            {(p.movimentos ?? []).slice(1, 10).map((m, i) => <li key={i}>{dataBR(m.data)} · {m.nome}</li>)}
                          </ul>
                        </details>
                      ) : (
                        <span style={{ color: "var(--dim)" }}>{p.sincronizado_em ? "sem movimentações no DataJud" : "aguardando consulta"}</span>
                      )}
                    </td>
                    <td><BotaoAcao acao={atualizarProcesso.bind(null, p.id)} rotulo="Atualizar" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
