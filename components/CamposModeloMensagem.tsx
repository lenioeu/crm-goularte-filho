import { CAMPOS_MENSAGEM, GATILHOS, type ModeloMensagem } from "@/lib/modelosMensagem";

// Campos do formulário de um modelo de mensagem (novo ou editar), em Mensagens agendadas › Modelos.
export function CamposModeloMensagem({ m }: { m?: ModeloMensagem }) {
  const p = m?.id ?? "novo";
  return (
    <>
      <input type="hidden" name="id" value={m?.id ?? ""} />
      <div className="field full"><label htmlFor={`mm_nome_${p}`}>Nome</label><input id={`mm_nome_${p}`} name="nome" required defaultValue={m?.nome ?? ""} placeholder="ex.: Pré-audiência" /></div>
      <div className="field">
        <label htmlFor={`mm_dias_${p}`}>Quando sai</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input id={`mm_dias_${p}`} name="dias" type="number" min={0} max={365} defaultValue={m?.dias ?? 1} style={{ width: 80 }} aria-label="Quantos dias" />
          <select name="gatilho" defaultValue={m?.gatilho ?? "antes_audiencia"} aria-label="Em relação a quê" style={{ flex: 1 }}>
            {GATILHOS.map((g) => <option key={g.id} value={g.id}>{g.rotulo}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label htmlFor={`mm_hora_${p}`}>Às</label><input id={`mm_hora_${p}`} name="hora" type="time" required defaultValue={m?.hora ?? "10:00"} /></div>
      <div className="field full">
        <label htmlFor={`mm_texto_${p}`}>Mensagem</label>
        <textarea id={`mm_texto_${p}`} name="texto" rows={6} required defaultValue={m?.texto ?? "Olá, {nome}! "} />
        <small style={{ color: "var(--dim)", fontSize: 12 }}>
          Campos que se preenchem sozinhos: {CAMPOS_MENSAGEM.map((c) => <span key={c.campo} title={c.ajuda}><code>{c.campo}</code> </span>)}
          (os de audiência só valem nos modelos ligados à audiência).
        </small>
      </div>
      <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" name="marcado" defaultChecked={m?.marcado ?? false} style={{ width: 18, height: 18 }} /> Já vem marcado ao agendar audiência
      </label>
      <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" name="cancelar" defaultChecked={m?.cancelar_se_responder ?? false} style={{ width: 18, height: 18 }} /> Cancelar o envio se o cliente responder antes
      </label>
      <div className="field"><label htmlFor={`mm_ordem_${p}`}>Posição na lista</label><input id={`mm_ordem_${p}`} name="ordem" type="number" defaultValue={m?.ordem ?? 100} /></div>
    </>
  );
}
