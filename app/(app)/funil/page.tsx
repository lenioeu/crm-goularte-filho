import Link from "next/link";
import { CartaoCaso, ETAPAS_FUNIL, type CasoCartao } from "@/components/CartaoCaso";
import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { criarCaso } from "../actions";

const DICAS: Record<string, string> = {
  primeiro_contato: "bot ou recepção",
  triagem: "viabilidade em análise",
  consulta_agendada: "presencial ou por vídeo",
  proposta: "aguardando resposta do cliente",
  contrato_assinado: "vira processo",
};

export default async function Funil({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const supabase = await supabaseServer();

  let consulta = supabase
    .from("casos")
    .select("id, titulo, resumo, etapa, sigiloso, motivo_nao_viavel, atualizado_em, clientes(nome), areas(nome, cor), perfis(nome)")
    .order("atualizado_em", { ascending: false })
    .limit(1000);
  if (area) consulta = consulta.eq("area_id", area);

  const [{ data: casos, error }, { data: areas }, { data: clientes }, { data: pessoas }] = await Promise.all([
    consulta,
    supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
    supabase.from("clientes").select("id, nome").order("nome").limit(2000),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const lista = (casos ?? []) as unknown as CasoCartao[];
  const naoViaveis = lista.filter((c) => c.etapa === "nao_viavel");
  const assinados = lista.filter((c) => c.etapa === "contrato_assinado").length;
  const consultas = lista.filter((c) => ["consulta_agendada", "proposta", "contrato_assinado"].includes(c.etapa)).length;

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Funil de casos</h1>
          <p>
            Cada cartão é uma pessoa que procurou o escritório. Use “Mover para…” para trocar de etapa; casos sem viabilidade
            saem do funil com o motivo registrado.
            {consultas > 0 && ` Conversão de consulta em contrato: ${Math.round((assinados / consultas) * 100)}%.`}
          </p>
        </div>
      </div>

      <div className="filtros">
        <Link className={"fp" + (!area ? " on" : "")} href="/funil">Todas as áreas</Link>
        {(areas ?? []).map((a) => (
          <Link key={a.id} className={"fp" + (area === a.id ? " on" : "")} href={`/funil?area=${a.id}`}>{a.nome}</Link>
        ))}
      </div>

      <details className="card novo" style={{ marginBottom: 16 }}>
        <summary><span className="btn primary">+ Novo caso</span></summary>
        <FormAcao action={criarCaso} botao="Criar caso" className="form">
          <div className="field">
            <label htmlFor="cliente_id">Cliente</label>
            <select id="cliente_id" name="cliente_id" defaultValue="">
              <option value="">Cliente novo (preencha ao lado)</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="cliente_novo">Nome do cliente novo</label><input id="cliente_novo" name="cliente_novo" placeholder="só se não estiver na lista" /></div>
          <div className="field"><label htmlFor="telefone">WhatsApp do cliente novo</label><input id="telefone" name="telefone" inputMode="tel" /></div>
          <div className="field">
            <label htmlFor="area_id">Área</label>
            <select id="area_id" name="area_id" defaultValue={area ?? ""}>
              <option value="">A definir</option>
              {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div className="field full"><label htmlFor="titulo">Assunto do caso</label><input id="titulo" name="titulo" required placeholder="ex.: Verbas rescisórias e horas extras" /></div>
          <div className="field"><label htmlFor="parte_contraria">Parte contrária</label><input id="parte_contraria" name="parte_contraria" placeholder="ex.: Empresa X Ltda." /></div>
          <div className="field">
            <label htmlFor="responsavel_id">Responsável</label>
            <select id="responsavel_id" name="responsavel_id" defaultValue="">
              <option value="">A definir</option>
              {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="etapa">Começa em</label>
            <select id="etapa" name="etapa" defaultValue="primeiro_contato">
              {ETAPAS_FUNIL.map((e) => <option key={e.id} value={e.id}>{e.rotulo}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, alignSelf: "end", height: 40 }}>
            <input type="checkbox" name="sigiloso" style={{ width: 18, height: 18 }} /> Caso sigiloso
          </label>
          <div className="field full"><label htmlFor="resumo">Resumo</label><textarea id="resumo" name="resumo" rows={3} placeholder="O que o cliente contou, em poucas linhas" /></div>
        </FormAcao>
      </details>

      {error && <div className="aviso erro" style={{ marginBottom: 16 }}>Não foi possível carregar o funil: {error.message}</div>}

      <div className="board">
        {ETAPAS_FUNIL.map((e) => {
          const daEtapa = lista.filter((c) => c.etapa === e.id);
          return (
            <section className="lane" key={e.id} aria-label={e.rotulo}>
              <div className="lh">{e.rotulo}<span className="c">{daEtapa.length}</span></div>
              <div className="hint">{DICAS[e.id]}</div>
              {daEtapa.length === 0 ? <div className="vazia">Nenhum caso</div> : daEtapa.map((c) => <CartaoCaso key={c.id} caso={c} />)}
            </section>
          );
        })}
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Não viáveis · {naoViaveis.length}</summary>
        {naoViaveis.length === 0 ? (
          <div className="vazio">Nenhum caso marcado como não viável.</div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", marginTop: 14 }}>
            {naoViaveis.map((c) => <CartaoCaso key={c.id} caso={c} />)}
          </div>
        )}
      </details>
    </div>
  );
}
