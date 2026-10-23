import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAcao } from "@/components/FormAcao";
import { quemSou } from "@/lib/permissoes";
import { adicionarPessoa, atualizarMembro, criarCargo, excluirPessoa } from "../actions";

const PAPEIS = [
  ["administrador", "Administrador"],
  ["advogado", "Advogado"],
  ["estagiario", "Estagiário"],
  ["atendimento", "Atendimento"],
] as const;

export default async function Equipe() {
  const { supabase, user, papel } = await quemSou();
  const admin = papel === "administrador";
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
            Adicione a pessoa aqui e passe para ela o e-mail e a senha provisória. Quem se cadastrar sozinho pelo “Criar acesso” aparece
            como aguardando até você marcar “Ativo”. Para tirar o acesso de alguém sem apagar nada, desmarque “Ativo”.
          </p>
        </div>
      </div>

      {pendentes > 0 && <div className="aviso info" style={{ marginBottom: 16 }}>{pendentes} {pendentes === 1 ? "pessoa aguardando" : "pessoas aguardando"} liberação.</div>}

      {admin && (
        <details className="card novo" style={{ marginBottom: 16 }}>
          <summary><span className="btn primary">+ Adicionar pessoa</span></summary>
          <FormAcao action={adicionarPessoa} botao="Criar acesso" className="form">
            <div className="field"><label htmlFor="novo-nome">Nome completo</label><input id="novo-nome" name="nome" required /></div>
            <div className="field"><label htmlFor="novo-email">E-mail</label><input id="novo-email" name="email" type="email" required placeholder="o e-mail que a pessoa usa" /></div>
            <div className="field">
              <label htmlFor="novo-papel">Acesso</label>
              <select id="novo-papel" name="papel" defaultValue="estagiario">
                {PAPEIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="novo-cargo">Cargo</label>
              <select id="novo-cargo" name="cargo_id" defaultValue="">
                <option value="">Sem cargo</option>
                {(cargos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)", gridColumn: "1 / -1" }}>
              O sistema cria uma senha provisória e mostra aqui embaixo. Anote e passe para a pessoa; ela troca em Meu perfil.
            </p>
          </FormAcao>
        </details>
      )}

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
              {admin && p.id !== user?.id && (
                <BotaoAcao
                  acao={excluirPessoa.bind(null, p.id)}
                  rotulo="Excluir"
                  className="btn sm perigo"
                  confirmar={`Excluir o acesso de ${p.nome}? Casos, tarefas e mensagens dessa pessoa continuam no sistema, sem o nome dela. Para só bloquear o acesso, desmarque “Ativo”.`}
                />
              )}
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
