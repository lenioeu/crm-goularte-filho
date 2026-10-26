"use client";

import { useRef, useState } from "react";
import { importarConversaAntiga, listarConversasAntigas, prepararHistorico } from "@/app/(app)/atendimento/actions";
import { BotaoAcao } from "@/components/BotaoAcao";

const JUNTAS = 3; // conversas importadas ao mesmo tempo

// Traz para o Atendimento as conversas antigas que o servidor do WhatsApp guardou (histórico do celular).
export function ImportarHistorico() {
  const [estado, setEstado] = useState<{ total: number; feitas: number; mensagens: number; falhas: string[] } | null>(null);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const parar = useRef(false);

  async function importar() {
    setErro(null);
    setRodando(true);
    parar.current = false;
    const { erro: e, conversas } = await listarConversasAntigas();
    if (e) {
      setErro(e);
      setRodando(false);
      return;
    }
    if (!conversas.length) {
      setErro("O servidor do WhatsApp ainda não tem conversas guardadas. Siga os passos 1 a 3 e espere alguns minutos depois de conectar.");
      setRodando(false);
      return;
    }
    const st = { total: conversas.length, feitas: 0, mensagens: 0, falhas: [] as string[] };
    setEstado({ ...st });
    let proxima = 0;
    async function trabalhador() {
      while (!parar.current && proxima < conversas.length) {
        const c = conversas[proxima++];
        const r = await importarConversaAntiga(c.jid, c.nome).catch((x: unknown) => ({ erro: x instanceof Error ? x.message : String(x), novas: 0 }));
        st.feitas++;
        st.mensagens += r.novas;
        if (r.erro) st.falhas.push(`${c.nome ?? c.jid.split("@")[0]}: ${r.erro}`);
        setEstado({ ...st, falhas: [...st.falhas] });
      }
    }
    await Promise.all(Array.from({ length: JUNTAS }, trabalhador));
    setRodando(false);
  }

  return (
    <div className="historico">
      <ol className="historico-passos">
        <li>
          <b>No servidor do WhatsApp</b>, ligue a gravação do histórico (uma vez só; o passo a passo está em docs/whatsapp.md, em “Histórico de conversas antigas”).
        </li>
        <li>
          <b>Peça o histórico completo ao WhatsApp:</b> <BotaoAcao acao={prepararHistorico} rotulo="Pedir histórico completo" />
        </li>
        <li>
          <b>Desconecte e conecte o WhatsApp de novo</b> (botões acima), lendo o QR Code com o celular do escritório. O celular manda o histórico nos
          minutos seguintes; deixe-o ligado e com internet.
        </li>
        <li>
          <b>Traga para o CRM:</b>{" "}
          <button type="button" className="btn sm primary" onClick={importar} disabled={rodando}>
            {rodando ? "Importando…" : "Importar conversas antigas"}
          </button>
          {rodando && (
            <button type="button" className="btn sm" onClick={() => (parar.current = true)} style={{ marginLeft: 8 }}>Parar</button>
          )}
        </li>
      </ol>
      {erro && <div className="aviso erro">{erro}</div>}
      {estado && (
        <div className="aviso info">
          {rodando && <span className="girando" aria-hidden="true" style={{ marginRight: 8 }} />}
          {estado.feitas} de {estado.total} conversas · {estado.mensagens} mensagens novas no CRM
          {!rodando && estado.feitas === estado.total && " · pronto. As conversas antigas ficam em Atendimento › Encerradas (ou junto da conversa aberta do cliente)."}
          {estado.falhas.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary>{estado.falhas.length} com problema</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>{estado.falhas.slice(0, 30).map((f) => <li key={f}>{f}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      <small style={{ color: "var(--dim)", fontSize: 12 }}>
        Pode rodar quantas vezes quiser: o que já está no CRM é pulado. Não dispara a triagem automática nem notificações. Grupos ficam de fora.
      </small>
    </div>
  );
}
