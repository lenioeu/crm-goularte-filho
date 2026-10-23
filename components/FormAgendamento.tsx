"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { type DadosAudiencia, ehDeAudiencia, type ModeloMensagem, preencherMensagem, quandoEnviar } from "@/lib/modelosMensagem";
import { primeiroNome } from "@/lib/rotulos";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;

const MODELOS: Record<string, string> = {
  follow_up:
    "Olá, {nome}! Tudo bem? Aqui é do escritório Goularte Filho Advocacia. Conseguiu ver a proposta que enviamos? Se quiser, marcamos uma conversa rápida para tirar as suas dúvidas.",
  livre: "Olá, {nome}! ",
};

function diaMais(dias: number) {
  const d = new Date(Date.now() + dias * 86_400_000);
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function FormAgendamento({
  action,
  clientes,
  clienteInicial,
  modelos = [],
  audiencias = {},
}: {
  action: Acao;
  clientes: { id: string; nome: string }[];
  clienteInicial?: string;
  modelos?: ModeloMensagem[];
  /** Próxima audiência de cada cliente, para os modelos ligados à audiência */
  audiencias?: Record<string, DadosAudiencia>;
}) {
  const [estado, enviar, pendente] = useActionState(action, { erro: null, ok: null });
  const [clienteId, setClienteId] = useState(clienteInicial ?? "");
  const [tipo, setTipo] = useState<"follow_up" | "livre" | "lembrete_audiencia">("follow_up");
  const [modeloId, setModeloId] = useState("");
  const [avisoModelo, setAvisoModelo] = useState<string | null>(null);
  const [texto, setTexto] = useState(MODELOS.follow_up);
  const [data, setData] = useState(diaMais(2));
  const [hora, setHora] = useState("10:00");
  const [cancelar, setCancelar] = useState(true);

  const nome = useMemo(() => clientes.find((c) => c.id === clienteId)?.nome ?? "", [clientes, clienteId]);

  useEffect(() => {
    if (estado.ok) {
      setTexto(MODELOS[tipo] ?? MODELOS.livre);
      setModeloId("");
    }
  }, [estado, tipo]);

  /** "Usar modelo": texto, dia e hora vêm do modelo (e da próxima audiência do cliente, quando for o caso). */
  function usarModelo(id: string) {
    setModeloId(id);
    setAvisoModelo(null);
    const m = modelos.find((x) => x.id === id);
    if (!m) return;
    const aud = audiencias[clienteId] ?? null;
    if (ehDeAudiencia(m.gatilho) && !aud) {
      setAvisoModelo(clienteId ? "Este cliente não tem audiência marcada: o texto entrou, mas confira os dados e escolha o dia." : "Escolha o cliente primeiro para preencher os dados da audiência.");
    }
    setTexto(preencherMensagem(m.texto, "", aud));
    const q = quandoEnviar(m, aud?.inicio);
    if (q) {
      setData(q.data);
      setHora(q.hora);
    }
    setCancelar(m.cancelar_se_responder);
    setTipo(ehDeAudiencia(m.gatilho) ? "lembrete_audiencia" : m.gatilho === "depois_de_hoje" ? "follow_up" : "livre");
  }

  function trocarTipo(t: "follow_up" | "livre") {
    setTipo(t);
    setTexto(MODELOS[t]);
    setCancelar(t === "follow_up");
    if (t === "follow_up") {
      setData(diaMais(2));
      setHora("10:00");
    }
  }

  const previa = texto.replace(/\{nome\}/g, nome ? primeiroNome(nome) : "(nome)");
  const [a, m, d] = data.split("-");

  return (
    <form action={enviar} className="form">
      <div className="field full">
        <label htmlFor="cliente_id">Para</label>
        <select id="cliente_id" name="cliente_id" required value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="" disabled>Escolha o cliente</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      {modelos.length > 0 && (
        <div className="field full">
          <label htmlFor="modelo_msg">Usar modelo</label>
          <select id="modelo_msg" value={modeloId} onChange={(e) => usarModelo(e.target.value)}>
            <option value="">Escrever do zero</option>
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          {avisoModelo && <small style={{ color: "var(--warn)", fontSize: 12 }}>{avisoModelo}</small>}
        </div>
      )}
      <div className="field full">
        <label>Tipo</label>
        <input type="hidden" name="tipo" value={tipo} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={"fp" + (tipo === "follow_up" ? " on" : "")} onClick={() => trocarTipo("follow_up")}>Follow-up</button>
          <button type="button" className={"fp" + (tipo === "livre" ? " on" : "")} onClick={() => trocarTipo("livre")}>Mensagem livre</button>
          {tipo === "lembrete_audiencia" && <button type="button" className="fp on">Lembrete de audiência</button>}
        </div>
      </div>
      <div className="field"><label htmlFor="data">Dia</label><input id="data" name="data" type="date" required value={data} onChange={(e) => setData(e.target.value)} /></div>
      <div className="field"><label htmlFor="hora">Hora</label><input id="hora" name="hora" type="time" required value={hora} onChange={(e) => setHora(e.target.value)} /></div>
      <div className="field full">
        <label htmlFor="texto">Mensagem</label>
        <textarea id="texto" name="texto" rows={5} required value={texto} onChange={(e) => setTexto(e.target.value)} />
        <small style={{ color: "var(--dim)", fontSize: 12 }}>{"{nome}"} vira o primeiro nome do cliente.</small>
      </div>
      <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" name="cancelar" checked={cancelar} onChange={(e) => setCancelar(e.target.checked)} style={{ width: 18, height: 18 }} />
        Cancelar o envio se o cliente responder antes
      </label>
      <div className="full" style={{ background: "var(--bg)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <small style={{ color: "var(--dim)" }}>{data ? `Será enviada em ${d}/${m}/${a} às ${hora}, pelo número do escritório` : "Escolha o dia"}</small>
        <div style={{ alignSelf: "flex-end", maxWidth: "92%", background: "var(--accent-soft)", color: "var(--accent-soft-ink)", padding: "9px 13px", borderRadius: "16px 16px 4px 16px", whiteSpace: "pre-line", fontSize: 13.5 }}>
          {previa}
        </div>
      </div>
      <div className="full" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn primary" type="submit" disabled={pendente}>{pendente ? "Programando…" : "Agendar envio"}</button>
        {estado.erro && <span className="aviso erro">{estado.erro}</span>}
        {estado.ok && <span className="aviso ok">{estado.ok}</span>}
      </div>
    </form>
  );
}
