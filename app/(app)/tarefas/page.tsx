import Link from "next/link";
import { CartaoTarefa, type Tarefa } from "@/components/CartaoTarefa";
import { COLUNAS_TAREFA } from "@/lib/rotulos";
import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { criarTarefa } from "../actions";

export default async function Tarefas({ searchParams }: { searchParams: Promise<{ minhas?: string }> }) {
  const { minhas } = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let consulta = supabase
    .from("tarefas")
    .select(
      "id, titulo, coluna, vence_em, responsavel:perfis!tarefas_responsavel_id_fkey(nome), revisor:perfis!tarefas_revisor_id_fkey(nome), casos(titulo, clientes(nome))",
    )
    .order("vence_em", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (minhas && user) consulta = consulta.eq("responsavel_id", user.id);

  const [{ data, error }, { data: casos }, { data: pessoas }] = await Promise.all([
    consulta,
    supabase.from("casos").select("id, titulo, clientes(nome)").neq("etapa", "nao_viavel").order("atualizado_em", { ascending: false }).limit(1000),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const lista = (data ?? []) as unknown as Tarefa[];
  const listaCasos = (casos ?? []) as unknown as { id: string; titulo: string; clientes: { nome: string } | null }[];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Tarefas</h1>
          <p>Tarefas do escritório, ligadas aos casos. Qualquer pessoa da equipe cria, move e conclui tarefas; use “Revisão” quando quiser que alguém confira antes.</p>
        </div>
      </div>

      <div className="filtros">
        <Link className={"fp" + (!minhas ? " on" : "")} href="/tarefas">Todas</Link>
        <Link className={"fp" + (minhas ? " on" : "")} href="/tarefas?minhas=1">Minhas</Link>
      </div>

      <details className="card novo" style={{ marginBottom: 16 }}>
        <summary><span className="btn primary">+ Nova tarefa</span></summary>
        <FormAcao action={criarTarefa} botao="Criar tarefa" className="form">
          <div className="field full"><label htmlFor="titulo">Tarefa</label><input id="titulo" name="titulo" required placeholder="ex.: Minutar réplica" /></div>
          <div className="field full">
            <label htmlFor="caso_id">Caso (opcional)</label>
            <select id="caso_id" name="caso_id" defaultValue="">
              <option value="">Sem caso</option>
              {listaCasos.map((c) => <option key={c.id} value={c.id}>{c.clientes?.nome} · {c.titulo}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="responsavel_id">Responsável</label>
            <select id="responsavel_id" name="responsavel_id" defaultValue={user?.id ?? ""}>
              <option value="">A definir</option>
              {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="revisor_id">Quem revisa (opcional)</label>
            <select id="revisor_id" name="revisor_id" defaultValue="">
              <option value="">Ninguém</option>
              {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="vence_em">Até quando</label><input id="vence_em" name="vence_em" type="date" /></div>
        </FormAcao>
      </details>

      {error && <div className="aviso erro" style={{ marginBottom: 16 }}>Não foi possível carregar as tarefas: {error.message}</div>}

      <div className="board">
        {COLUNAS_TAREFA.map((c) => {
          const daColuna = lista.filter((t) => t.coluna === c.id);
          return (
            <section className="lane" key={c.id} aria-label={c.rotulo}>
              <div className="lh">{c.rotulo}<span className="c">{daColuna.length}</span></div>
              {daColuna.length === 0 ? <div className="vazia">Nenhuma tarefa</div> : daColuna.map((t) => <CartaoTarefa key={t.id} t={t} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
