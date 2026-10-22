import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { atualizarMembro, criarCargo } from "../actions";

const PAPEIS = [
  ["administrador", "Administrador"],
  ["advogado", "Advogado"],
  ["estagiario", "Estagiário"],
  ["atendimento", "Atendimento"],
] as const;

export default async function Equipe() {
  const supabase = await supabaseServer();
  const [{ data: perfis }, { data: cargos }] = await Promise.all([
    supabase.from("perfis").select("id, nome, papel, ativo, cargo_id, oab").order("ativo").order("nome"),
    supabase.from("cargos").select("id, nome").order("nome"),
  ]);
  const pendentes = (perfis ?? []).filter((p) => !p.ativo).length;

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Equipe e cargos</h1>
          <p>
            Para dar acesso a alguém: a pessoa abre o sistema, clica em “Criar acesso” e se cadastra. Ela aparece aqui como
            aguardando; você escolhe o acesso, o cargo e marca “Ativo”.
          </p>
        </div>
      </div>

      {pendentes > 0 && <div className="aviso info" style={{ marginBottom: 16 }}>{pendentes} {pendentes === 1 ? "pessoa aguardando" : "pessoas aguardando"} liberação.</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ctitle"><h3>Pessoas</h3><span className="tag">só o administrador consegue salvar</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(perfis ?? []).map((p) => (
            <FormAcao key={p.id} action={atualizarMembro} botao="Salvar" className="inline" limparAoSalvar={false}>
              <input type="hidden" name="id" value={p.id} />
              <div className="field" style={{ minWidth: 200 }}>
                <label>Nome</label>
                <div style={{ height: 40, display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                  {p.nome} {!p.ativo && <span className="chip warn">aguardando</span>}
                </div>
              </div>
              <div className="field">
                <label htmlFor={`papel-${p.id}`}>Acesso</label>
                <select id={`papel-${p.id}`} name="papel" defaultValue={p.papel}>
                  {PAPEIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`cargo-${p.id}`}>Cargo (aparece abaixo do nome)</label>
                <select id={`cargo-${p.id}`} name="cargo_id" defaultValue={p.cargo_id ?? ""}>
                  <option value="">Sem cargo</option>
                  {(cargos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, height: 40, fontSize: 13.5 }}>
                <input type="checkbox" name="ativo" defaultChecked={p.ativo} style={{ width: 18, height: 18 }} /> Ativo
              </label>
            </FormAcao>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="ctitle"><h3>Cargos</h3></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {(cargos ?? []).map((c) => <span key={c.id} className="chip">{c.nome}</span>)}
        </div>
        <FormAcao action={criarCargo} botao="Adicionar cargo" className="inline">
          <div className="field"><label htmlFor="cargo-novo">Novo cargo</label><input id="cargo-novo" name="nome" required placeholder="ex.: Paralegal, Correspondente" /></div>
        </FormAcao>
      </div>
    </div>
  );
}
