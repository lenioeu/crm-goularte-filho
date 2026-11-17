"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { useAviso } from "@/components/Avisos";
import { calcularVencimento, type Contagem, dataBR, diasSemExpediente, PRAZOS_COMUNS, prazoInterno } from "@/lib/prazos";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;
export type PrazoInicial = {
  id?: string;
  descricao?: string;
  processo_id?: string | null;
  publicacao_id?: string | null;
  publicado_em?: string | null;
  dias?: number;
  contagem?: Contagem;
  interno_dias?: number;
  responsavel_id?: string | null;
  observacao?: string | null;
};

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const comSemana = (s: string) => `${dataBR(s)} (${SEMANA[new Date(`${s}T12:00:00Z`).getUTCDay()]})`;

// Formulário de prazo (novo ou editar). Mostra, enquanto se digita, o vencimento fatal e o interno
// contados com os feriados nacionais, o recesso e os dias sem expediente cadastrados pelo escritório.
export function FormPrazo({
  action,
  inicial = {},
  processos,
  pessoas,
  feriados,
  botao,
  aoSalvar,
}: {
  action: Acao;
  inicial?: PrazoInicial;
  processos?: { id: string; rotulo: string }[]; // sem a lista, o processo vem fixo em inicial.processo_id
  pessoas: { id: string; nome: string }[];
  feriados: string[];
  botao: string;
  aoSalvar?: () => void;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [estado, enviar, pendente] = useActionState(action, { erro: null, ok: null });
  const [descricao, setDescricao] = useState(inicial.descricao ?? "");
  const [publicado, setPublicado] = useState(inicial.publicado_em ?? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
  const [dias, setDias] = useState(String(inicial.dias ?? 15));
  const [contagem, setContagem] = useState<Contagem>(inicial.contagem ?? "uteis");
  const [antes, setAntes] = useState(String(inicial.interno_dias ?? 2));
  const conjunto = useMemo(() => diasSemExpediente(feriados), [feriados]);
  const p = inicial.id ?? inicial.publicacao_id ?? "novo";

  const calculo = useMemo(() => {
    const n = Number(dias);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publicado) || !Number.isFinite(n) || n < 0 || n > 365) return null;
    const r = calcularVencimento(publicado, n, contagem, conjunto);
    return { ...r, interno: prazoInterno(r.fatal, Math.max(0, Number(antes) || 0), conjunto) };
  }, [publicado, dias, contagem, antes, conjunto]);

  useEffect(() => {
    if (!estado.ok) return;
    if (aviso) aviso(estado.ok);
    aoSalvar?.();
    router.refresh();
  }, [estado, aviso, aoSalvar, router]);

  function escolherComum(nome: string) {
    const c = PRAZOS_COMUNS.find((x) => x.nome === nome);
    if (!c) return;
    setDescricao(c.nome);
    setDias(String(c.dias));
    setContagem(c.contagem);
  }

  return (
    <form action={enviar} className="form form-prazo">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {inicial.publicacao_id && <input type="hidden" name="publicacao_id" value={inicial.publicacao_id} />}
      {!processos && inicial.processo_id && <input type="hidden" name="processo_id" value={inicial.processo_id} />}
      {!inicial.id && (
        <div className="field full">
          <label htmlFor={`fp_c_${p}`}>Prazo comum (preenche dias e contagem)</label>
          <select id={`fp_c_${p}`} defaultValue="" onChange={(e) => escolherComum(e.target.value)}>
            <option value="">Escolher…</option>
            {PRAZOS_COMUNS.map((c) => <option key={c.nome} value={c.nome}>{c.nome} · {c.dias} {c.contagem === "uteis" ? "dias úteis" : "dias corridos"}</option>)}
          </select>
        </div>
      )}
      <div className="field full"><label htmlFor={`fp_d_${p}`}>Prazo</label><input id={`fp_d_${p}`} name="descricao" required value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: Contestação" /></div>
      {processos && !inicial.id && (
        <div className="field full">
          <label htmlFor={`fp_p_${p}`}>Processo</label>
          <select id={`fp_p_${p}`} name="processo_id" defaultValue={inicial.processo_id ?? ""}>
            <option value="">Sem processo</option>
            {processos.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
          </select>
        </div>
      )}
      <div className="field"><label htmlFor={`fp_pub_${p}`}>Publicação / intimação</label><input id={`fp_pub_${p}`} name="publicado_em" type="date" required value={publicado} onChange={(e) => setPublicado(e.target.value)} /></div>
      <div className="field"><label htmlFor={`fp_n_${p}`}>Dias</label><input id={`fp_n_${p}`} name="dias" type="number" min={0} max={365} required value={dias} onChange={(e) => setDias(e.target.value)} /></div>
      <div className="field">
        <label htmlFor={`fp_ct_${p}`}>Contagem</label>
        <select id={`fp_ct_${p}`} name="contagem" value={contagem} onChange={(e) => setContagem(e.target.value as Contagem)}>
          <option value="uteis">Dias úteis</option>
          <option value="corridos">Dias corridos</option>
        </select>
      </div>
      <div className="field"><label htmlFor={`fp_i_${p}`}>Prazo interno (dias úteis antes)</label><input id={`fp_i_${p}`} name="interno_dias" type="number" min={0} max={30} value={antes} onChange={(e) => setAntes(e.target.value)} /></div>
      <div className="field">
        <label htmlFor={`fp_r_${p}`}>Responsável</label>
        <select id={`fp_r_${p}`} name="responsavel_id" defaultValue={inicial.responsavel_id ?? ""}>
          <option value="">Eu</option>
          {pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
      </div>
      <div className="field full"><label htmlFor={`fp_o_${p}`}>Observação (opcional)</label><input id={`fp_o_${p}`} name="observacao" defaultValue={inicial.observacao ?? ""} placeholder="ex.: aguardar documentos do cliente" /></div>

      {calculo && (
        <div className="full prazo-calculo" aria-live="polite">
          <div><small>Começa a contar</small><b>{comSemana(calculo.primeiroDia)}</b></div>
          <div className="interno"><small>Prazo interno</small><b>{comSemana(calculo.interno)}</b></div>
          <div className="fatal"><small>Prazo fatal</small><b>{comSemana(calculo.fatal)}</b></div>
          <p>
            Conta {contagem === "uteis" ? "só dias úteis" : "dias corridos"} a partir do dia útil seguinte à publicação, pulando fins de semana, feriados nacionais,
            o recesso de 20/12 a 20/01 e os dias sem expediente cadastrados. Confira sempre no calendário do tribunal.
          </p>
        </div>
      )}
      <div className="full" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn primary" disabled={pendente}>{pendente ? "Salvando…" : botao}</button>
        {estado.erro && <span className="aviso erro">{estado.erro}</span>}
      </div>
    </form>
  );
}
