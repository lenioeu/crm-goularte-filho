import { FormAcao } from "@/components/FormAcao";
import { quemSou } from "@/lib/permissoes";
import { criarArea } from "../actions";
import { atualizarArea } from "../atendimento-automatico/actions";

export default async function Areas() {
  const { supabase, papel } = await quemSou();
  const admin = papel === "administrador";
  const { data: areas } = await supabase
    .from("areas")
    .select("id, nome, cor, ordem_bot, documentos_pedidos, ativa")
    .order("ordem_bot");

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Áreas de atuação</h1>
          <p>Cada área vira uma opção no menu do bot, um filtro no sistema e uma pasta dentro de Clientes no Google Drive.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", marginBottom: 16 }}>
        {(areas ?? []).map((a) => (
          <div className="card" key={a.id} style={{ borderTop: `4px solid ${a.cor}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ fontSize: 16 }}>{a.nome}</h3>
              {!a.ativa && <span className="chip">inativa</span>}
            </div>
            <small style={{ color: "var(--dim)" }}>Opção {a.ordem_bot} no menu do bot · pasta Clientes › {a.nome.toUpperCase()}</small>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{a.documentos_pedidos ?? "Sem lista de documentos."}</div>
            {admin && (
              <details>
                <summary style={{ cursor: "pointer", color: "var(--accent)", fontSize: 13 }}>Editar</summary>
                <FormAcao action={atualizarArea} botao="Salvar área" className="form" limparAoSalvar={false}>
                  <input type="hidden" name="id" value={a.id} />
                  <div className="field full"><label htmlFor={`nome-${a.id}`}>Nome</label><input id={`nome-${a.id}`} name="nome" required defaultValue={a.nome} /></div>
                  <div className="field"><label htmlFor={`cor-${a.id}`}>Cor</label><input id={`cor-${a.id}`} name="cor" type="color" defaultValue={a.cor} style={{ padding: 4 }} /></div>
                  <div className="field"><label htmlFor={`ordem-${a.id}`}>Posição no menu</label><input id={`ordem-${a.id}`} name="ordem_bot" type="number" min={1} defaultValue={a.ordem_bot} /></div>
                  <div className="field full"><label htmlFor={`docs-${a.id}`}>Documentos pedidos ao cliente</label><textarea id={`docs-${a.id}`} name="documentos" rows={2} defaultValue={a.documentos_pedidos ?? ""} /></div>
                  <label className="nota-check full"><input type="checkbox" name="ativa" defaultChecked={a.ativa} /> Ativa (aparece no sistema e no menu do WhatsApp)</label>
                  <small className="dica full">Mudar o nome não renomeia a pasta da área no Drive; pastas novas saem com o nome novo.</small>
                </FormAcao>
              </details>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="ctitle"><h3>Nova área</h3><span className="tag">só o administrador pode criar</span></div>
        <FormAcao action={criarArea} botao="Adicionar área" className="form">
          <div className="field"><label htmlFor="nome">Nome</label><input id="nome" name="nome" required placeholder="ex.: Consumidor" /></div>
          <div className="field"><label htmlFor="cor">Cor</label><input id="cor" name="cor" type="color" defaultValue="#0097a7" style={{ padding: 4 }} /></div>
          <div className="field full"><label htmlFor="documentos">Documentos pedidos ao cliente</label><input id="documentos" name="documentos" placeholder="ex.: notas fiscais, protocolos de atendimento, RG" /></div>
        </FormAcao>
      </div>
    </div>
  );
}
