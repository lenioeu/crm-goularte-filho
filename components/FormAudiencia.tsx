import { FormAcao } from "@/components/FormAcao";
import { criarAudiencia } from "@/app/(app)/actions";

const TIPOS = ["Conciliação", "Instrução", "Instrução e julgamento", "Una", "Inicial", "Perícia", "Custódia", "Sessão de julgamento"];

export type ProcessoOpcao = { id: string; numero_cnj: string; cliente?: string | null; vara?: string | null };

// Formulário de nova audiência: sempre ligada a um processo. Usado em Audiências e na ficha do cliente.
export function FormAudiencia({ processos, pessoas, compacto = false }: { processos: ProcessoOpcao[]; pessoas: { id: string; nome: string }[]; compacto?: boolean }) {
  const so = processos.length === 1 ? processos[0] : null;
  return (
    <FormAcao action={criarAudiencia} botao="Agendar audiência" className={"form" + (compacto ? " form-compacto" : "")}>
      <div className="field full">
        <label htmlFor="aud_processo_id">Processo</label>
        <select id="aud_processo_id" name="processo_id" required defaultValue={so?.id ?? ""}>
          {!so && <option value="" disabled>Escolha o processo</option>}
          {processos.map((p) => (
            <option key={p.id} value={p.id}>{[p.numero_cnj, p.cliente, p.vara].filter(Boolean).join(" · ")}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="aud_tipo">Tipo</label>
        <select id="aud_tipo" name="tipo" defaultValue="Conciliação">
          {TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="aud_tipo_outro">Outro tipo (opcional)</label><input id="aud_tipo_outro" name="tipo_outro" placeholder="se não estiver na lista" /></div>
      <div className="field"><label htmlFor="aud_data">Dia</label><input id="aud_data" name="data" type="date" required /></div>
      <div className="field"><label htmlFor="aud_hora">Hora</label><input id="aud_hora" name="hora" type="time" required /></div>
      <div className="field">
        <label htmlFor="aud_modalidade">Modalidade</label>
        <select id="aud_modalidade" name="modalidade" defaultValue="presencial">
          <option value="presencial">Presencial</option>
          <option value="video">Por vídeo</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="aud_responsavel_id">Quem vai</label>
        <select id="aud_responsavel_id" name="responsavel_id" defaultValue="">
          <option value="">A definir</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <div className="field full"><label htmlFor="aud_local">Local</label><input id="aud_local" name="local" defaultValue={so?.vara ?? ""} placeholder="ex.: 2ª Vara do Trabalho de Vitória · sala 3" /></div>
      <div className="field full"><label htmlFor="aud_observacoes">Observações</label><textarea id="aud_observacoes" name="observacoes" rows={2} placeholder="ex.: levar testemunhas; cliente confirmou presença" /></div>
      <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" name="lembrete3" defaultChecked style={{ width: 18, height: 18 }} /> Lembrete ao cliente 3 dias antes, às 10h
      </label>
      <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" name="lembrete" defaultChecked style={{ width: 18, height: 18 }} /> Lembrete ao cliente na véspera, às 18h
      </label>
    </FormAcao>
  );
}
