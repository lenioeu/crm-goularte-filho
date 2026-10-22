import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { criarCliente } from "../actions";

type Cliente = {
  id: string;
  nome: string;
  telefone_whatsapp: string | null;
  cpf_cnpj: string | null;
  pasta_drive_url: string | null;
  criado_em: string;
  areas: { nome: string; cor: string } | null;
  perfis: { nome: string } | null;
};

function telefone(t: string | null) {
  if (!t) return "—";
  const d = t.replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : t;
}

export default async function Clientes() {
  const supabase = await supabaseServer();
  const [{ data: clientes, error }, { data: areas }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome, telefone_whatsapp, cpf_cnpj, pasta_drive_url, criado_em, areas(nome, cor), perfis(nome)")
      .order("nome")
      .limit(500),
    supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
  ]);
  const lista = (clientes ?? []) as unknown as Cliente[];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Clientes</h1>
          <p>{lista.length} {lista.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}. Na etapa do WhatsApp, os clientes passam a ser criados sozinhos pela triagem do bot.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ctitle"><h3>Novo cliente</h3></div>
        <FormAcao action={criarCliente} botao="Cadastrar cliente" className="form">
          <div className="field full"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" required placeholder="ex.: MARIA DA SILVA SANTOS" /></div>
          <div className="field"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" inputMode="tel" placeholder="(27) 99999-9999" /></div>
          <div className="field"><label htmlFor="cpf">CPF ou CNPJ</label><input id="cpf" name="cpf" /></div>
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" /></div>
          <div className="field">
            <label htmlFor="area_id">Área</label>
            <select id="area_id" name="area_id" defaultValue="">
              <option value="">A definir</option>
              {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
        </FormAcao>
      </div>

      <div className="card" style={{ padding: "6px 6px 2px" }}>
        {error && <div className="aviso erro" style={{ margin: 12 }}>Não foi possível carregar os clientes: {error.message}</div>}
        {lista.length === 0 ? (
          <div className="vazio"><b>Nenhum cliente ainda</b>Cadastre o primeiro no formulário acima.</div>
        ) : (
          <div className="scrollx">
            <table className="tbl">
              <thead><tr><th>Cliente</th><th>Área</th><th>WhatsApp</th><th>Responsável</th><th>Pasta no Drive</th></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td><b style={{ fontWeight: 500 }}>{c.nome}</b>{c.cpf_cnpj && <small>{c.cpf_cnpj}</small>}</td>
                    <td>{c.areas ? <span className="chip area" style={{ "--c": c.areas.cor } as React.CSSProperties}>{c.areas.nome}</span> : <span className="chip">a definir</span>}</td>
                    <td className="num">{telefone(c.telefone_whatsapp)}</td>
                    <td>{c.perfis?.nome ?? "—"}</td>
                    <td>{c.pasta_drive_url ? <a className="btn sm" href={c.pasta_drive_url} target="_blank" rel="noopener">Abrir</a> : <span className="chip">após ligar o Drive</span>}</td>
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
