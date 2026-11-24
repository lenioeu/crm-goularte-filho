"use client";

import { useState } from "react";
import { adicionarParte, desvincularProcesso, removerParte, vincularProcesso } from "@/app/(app)/processos/actions";
import { BotaoAcao } from "@/components/BotaoAcao";
import { CampoCpf } from "@/components/CampoCpf";
import { FormAcao } from "@/components/FormAcao";
import { TIPOS_VINCULO } from "@/lib/rotulos";

export type Parte = { id: string; nome: string; cpf_cnpj: string | null; papel: string | null; advogado: string | null };
export type ProcessoFicha = {
  id: string;
  numero_cnj: string;
  tribunal: string | null;
  vara: string | null;
  ultima_movimentacao: string | null;
  ultima_movimentacao_em: string | null;
  tipo_vinculo: string | null;
  partes: Parte[];
};

const dataBR = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");

function Partes({ p, clienteId }: { p: ProcessoFicha; clienteId: string }) {
  if (!p.partes.length) return null;
  return (
    <ul className="partes">
      {p.partes.map((x) => (
        <li key={x.id}>
          <span className="partes-x" aria-hidden="true">×</span>
          <span>
            <b>{x.nome}</b>
            {[x.papel, x.cpf_cnpj, x.advogado && `adv. ${x.advogado}`].filter(Boolean).length > 0 && <small> · {[x.papel, x.cpf_cnpj, x.advogado && `adv. ${x.advogado}`].filter(Boolean).join(" · ")}</small>}
          </span>
          <BotaoAcao acao={removerParte.bind(null, x.id, clienteId)} rotulo="retirar" className="linkbtn" confirmar={`Retirar ${x.nome} das partes deste processo?`} />
        </li>
      ))}
    </ul>
  );
}

// Processo na ficha do cliente: partes contrárias e os processos ligados a ele (agravo, recurso, cumprimento…).
export function ProcessoCartao({ processo, filhos, clienteId }: { processo: ProcessoFicha; filhos: ProcessoFicha[]; clienteId: string }) {
  const [painel, setPainel] = useState<"parte" | "vinculo" | null>(null);
  const alternar = (x: "parte" | "vinculo") => setPainel((v) => (v === x ? null : x));
  const pid = processo.id;
  return (
    <div className="proc-cartao">
      <b className="proc-num">{processo.numero_cnj}</b>
      <small>{[processo.tribunal, processo.vara].filter(Boolean).join(" · ")}</small>
      {processo.ultima_movimentacao && <small>{dataBR(processo.ultima_movimentacao_em)} · {processo.ultima_movimentacao}</small>}
      <Partes p={processo} clienteId={clienteId} />

      {filhos.length > 0 && (
        <div className="proc-filhos">
          {filhos.map((f) => (
            <div key={f.id} className="proc-filho">
              <span className="proc-filho-tipo">↳ {f.tipo_vinculo ?? "Vinculado"}</span>
              <b className="proc-num">{f.numero_cnj}</b>
              <small>{[f.tribunal, f.vara].filter(Boolean).join(" · ")}</small>
              {f.ultima_movimentacao && <small>{dataBR(f.ultima_movimentacao_em)} · {f.ultima_movimentacao}</small>}
              <Partes p={f} clienteId={clienteId} />
              <BotaoAcao acao={desvincularProcesso.bind(null, f.id, clienteId)} rotulo="separar do principal" className="linkbtn" confirmar={`Separar ${f.numero_cnj} do processo principal? Ele continua cadastrado.`} />
            </div>
          ))}
        </div>
      )}

      <div className="proc-acoes">
        <button type="button" className={"linkbtn editar" + (painel === "parte" ? " on" : "")} aria-expanded={painel === "parte"} onClick={() => alternar("parte")}>+ Parte contrária</button>
        <button type="button" className={"linkbtn editar" + (painel === "vinculo" ? " on" : "")} aria-expanded={painel === "vinculo"} onClick={() => alternar("vinculo")}>+ Agravo, recurso ou cumprimento</button>
      </div>

      {painel === "parte" && (
        <FormAcao action={adicionarParte} botao="Adicionar parte" className="form form-compacto maiusculas proc-form" aoSalvar={() => setPainel(null)}>
          <input type="hidden" name="processo_id" value={pid} />
          <input type="hidden" name="cliente_id" value={clienteId} />
          <div className="field full"><label htmlFor={`pp_n_${pid}`}>Nome ou razão social</label><input id={`pp_n_${pid}`} name="nome" required placeholder="ex.: EMPRESA X LTDA" /></div>
          <div className="field"><label htmlFor={`pp_c_${pid}`}>CPF ou CNPJ (opcional)</label><CampoCpf id={`pp_c_${pid}`} /></div>
          <div className="field">
            <label htmlFor={`pp_p_${pid}`}>Papel (opcional)</label>
            <input id={`pp_p_${pid}`} name="papel" list="papeis-parte" placeholder="ex.: reclamada" />
          </div>
          <div className="field full"><label htmlFor={`pp_a_${pid}`}>Advogado da parte (opcional)</label><input id={`pp_a_${pid}`} name="advogado" placeholder="ex.: FULANO DE TAL · OAB/ES 0000" /></div>
          <datalist id="papeis-parte">
            {["Reclamada", "Ré", "Requerida", "Executada", "Agravada", "Recorrida", "Embargada", "Autora", "Reclamante", "Exequente"].map((x) => <option key={x} value={x} />)}
          </datalist>
        </FormAcao>
      )}

      {painel === "vinculo" && (
        <FormAcao action={vincularProcesso} botao="Ligar ao principal" className="form form-compacto proc-form" aoSalvar={() => setPainel(null)}>
          <input type="hidden" name="pai_id" value={pid} />
          <input type="hidden" name="cliente_id" value={clienteId} />
          <div className="field">
            <label htmlFor={`pv_t_${pid}`}>O que é</label>
            <select id={`pv_t_${pid}`} name="tipo_vinculo" defaultValue={TIPOS_VINCULO[0]}>{TIPOS_VINCULO.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="field"><label htmlFor={`pv_n_${pid}`}>Número (CNJ)</label><input id={`pv_n_${pid}`} name="numero" required inputMode="numeric" placeholder="0000000-00.0000.0.00.0000" /></div>
          <small className="dica full">Se ainda não estiver no Órion, é cadastrado no mesmo caso, consulta o CNJ e copia as partes contrárias do principal. As publicações dele passam a cair neste cliente.</small>
        </FormAcao>
      )}
    </div>
  );
}
