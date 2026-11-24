"use client";

import { criarCompromisso, editarCompromisso } from "@/app/(app)/calendario/actions";
import { FormAcao } from "@/components/FormAcao";
import { TIPOS_COMPROMISSO, type TipoCompromisso } from "@/lib/calendario";

export type CompromissoEditavel = {
  id: string;
  tipo: TipoCompromisso;
  titulo: string;
  data: string; // AAAA-MM-DD (Brasília)
  hora: string; // HH:MM
  duracao: number; // minutos
  local: string | null;
  observacoes: string | null;
  cliente_id: string | null;
  processo_id: string | null;
  responsavel_id: string | null;
};

const DURACOES = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const rotuloDuracao = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`);

// Reunião, atendimento, diligência, compromisso ou outro: novo ou editar. Vai para a Google Agenda do escritório.
export function FormCompromisso({
  inicial,
  tipoInicial = "reuniao",
  dataInicial,
  clientes,
  processos,
  pessoas,
  aoSalvar,
}: {
  inicial?: CompromissoEditavel;
  tipoInicial?: TipoCompromisso;
  dataInicial?: string;
  clientes: { id: string; nome: string }[];
  processos: { id: string; numero_cnj: string; cliente?: string | null }[];
  pessoas: { id: string; nome: string }[];
  aoSalvar?: () => void;
}) {
  const p = inicial?.id ?? "novo";
  const duracao = inicial?.duracao ?? 60;
  return (
    <FormAcao action={inicial ? editarCompromisso : criarCompromisso} botao={inicial ? "Salvar alterações" : "Agendar"} className="form" aoSalvar={aoSalvar} limparAoSalvar={!inicial}>
      {inicial && <input type="hidden" name="id" value={inicial.id} />}
      <div className="field">
        <label htmlFor={`fc_tipo_${p}`}>Tipo</label>
        <select id={`fc_tipo_${p}`} name="tipo" defaultValue={inicial?.tipo ?? tipoInicial}>
          {TIPOS_COMPROMISSO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor={`fc_titulo_${p}`}>O que é</label><input id={`fc_titulo_${p}`} name="titulo" required defaultValue={inicial?.titulo ?? ""} placeholder="ex.: reunião para assinar a procuração" /></div>
      <div className="field"><label htmlFor={`fc_data_${p}`}>Dia</label><input id={`fc_data_${p}`} name="data" type="date" required defaultValue={inicial?.data ?? dataInicial} /></div>
      <div className="field"><label htmlFor={`fc_hora_${p}`}>Hora</label><input id={`fc_hora_${p}`} name="hora" type="time" required defaultValue={inicial?.hora ?? "09:00"} /></div>
      <div className="field">
        <label htmlFor={`fc_dur_${p}`}>Duração</label>
        <select id={`fc_dur_${p}`} name="duracao" defaultValue={String(DURACOES.includes(duracao) ? duracao : 60)}>
          {DURACOES.map((m) => <option key={m} value={m}>{rotuloDuracao(m)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`fc_resp_${p}`}>Quem vai</label>
        <select id={`fc_resp_${p}`} name="responsavel_id" defaultValue={inicial?.responsavel_id ?? ""}>
          <option value="">Eu</option>
          {pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`fc_cli_${p}`}>Cliente (opcional)</label>
        <select id={`fc_cli_${p}`} name="cliente_id" defaultValue={inicial?.cliente_id ?? ""}>
          <option value="">Nenhum</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`fc_proc_${p}`}>Processo (opcional)</label>
        <select id={`fc_proc_${p}`} name="processo_id" defaultValue={inicial?.processo_id ?? ""}>
          <option value="">Nenhum</option>
          {processos.map((x) => <option key={x.id} value={x.id}>{[x.numero_cnj, x.cliente].filter(Boolean).join(" · ")}</option>)}
        </select>
      </div>
      <div className="field full"><label htmlFor={`fc_local_${p}`}>Local</label><input id={`fc_local_${p}`} name="local" defaultValue={inicial?.local ?? ""} placeholder="ex.: escritório, Google Meet, cartório do 2º ofício" /></div>
      <div className="field full"><label htmlFor={`fc_obs_${p}`}>Observações</label><textarea id={`fc_obs_${p}`} name="observacoes" rows={2} defaultValue={inicial?.observacoes ?? ""} /></div>
    </FormAcao>
  );
}
