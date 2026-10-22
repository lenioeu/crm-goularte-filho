import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { criarArea } from "../actions";

export default async function Areas() {
  const supabase = await supabaseServer();
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
