"use client";

import { useCallback, useEffect, useState } from "react";
import { atualizarLigacaoWhatsApp, conectarWhatsApp, desconectarWhatsApp, lerEstadoWhatsApp } from "@/app/(app)/atendimento/actions";
import { BotaoAcao } from "@/components/BotaoAcao";

type Estado = "open" | "connecting" | "close" | "inexistente" | null;

const ROTULO: Record<string, { texto: string; classe: string }> = {
  open: { texto: "Conectado", classe: "good" },
  connecting: { texto: "Aguardando leitura do QR", classe: "warn" },
  close: { texto: "Desconectado", classe: "" },
  inexistente: { texto: "Ainda não conectado", classe: "" },
};

// Mostra o estado do WhatsApp e, para o administrador, o QR Code de conexão.
export function ConexaoWhatsApp({ admin }: { admin: boolean }) {
  const [estado, setEstado] = useState<Estado | "carregando">("carregando");
  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const atualizar = useCallback(async () => {
    const e = await lerEstadoWhatsApp();
    setEstado(e);
    if (e === "open") setQr(null);
  }, []);

  useEffect(() => {
    atualizar();
  }, [atualizar]);

  // Enquanto o QR está na tela, confere a cada 3 segundos se o celular já leu
  useEffect(() => {
    if (!qr) return;
    const id = setInterval(atualizar, 3000);
    return () => clearInterval(id);
  }, [qr, atualizar]);

  async function conectar() {
    setOcupado(true);
    setErro(null);
    const r = await conectarWhatsApp();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setEstado(r.estado);
    setQr(r.qr);
  }

  async function sair() {
    if (!window.confirm("Desconectar o WhatsApp do escritório? As mensagens param de chegar ao sistema.")) return;
    setOcupado(true);
    const r = await desconectarWhatsApp();
    setOcupado(false);
    if (r.erro) setErro(r.erro);
    atualizar();
  }

  const rot = estado && estado !== "carregando" ? ROTULO[estado] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        Situação:{" "}
        {estado === "carregando" ? "consultando…" : rot ? <span className={`chip ${rot.classe}`}>{rot.texto}</span> : <span className="chip crit">servidor do WhatsApp sem resposta</span>}
      </div>
      {qr && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr" src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code para conectar o WhatsApp" />
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--muted)", maxWidth: 360 }}>
            <li>No celular do escritório, abra o WhatsApp Business.</li>
            <li>Toque em ⋮ › <b>Aparelhos conectados</b> › <b>Conectar um aparelho</b>.</li>
            <li>Aponte a câmera para o código. Ele vence em cerca de 40 segundos; se vencer, clique em “Gerar novo QR”.</li>
          </ol>
        </div>
      )}
      {erro && <div className="aviso erro">{erro}</div>}
      {admin && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {estado !== "open" && (
            <button className="btn primary" type="button" onClick={conectar} disabled={ocupado}>
              {ocupado ? "Aguarde…" : qr ? "Gerar novo QR" : "Conectar WhatsApp"}
            </button>
          )}
          {estado === "open" && (
            <>
              <BotaoAcao acao={atualizarLigacaoWhatsApp} rotulo="Atualizar ligação" />
              <button className="btn sm" type="button" onClick={sair} disabled={ocupado}>Desconectar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
