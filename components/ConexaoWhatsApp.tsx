"use client";

import { useCallback, useEffect, useState } from "react";
import { atualizarLigacaoWhatsApp, conectarWhatsApp, conectarWhatsAppPorNumero, desconectarWhatsApp, lerEstadoWhatsApp } from "@/app/(app)/atendimento/actions";
import { BotaoAcao } from "@/components/BotaoAcao";

type Estado = "open" | "connecting" | "close" | "inexistente" | null;

const ROTULO: Record<string, { texto: string; classe: string }> = {
  open: { texto: "Conectado", classe: "good" },
  connecting: { texto: "Aguardando o celular", classe: "warn" },
  close: { texto: "Desconectado", classe: "" },
  inexistente: { texto: "Ainda não conectado", classe: "" },
};

// Mostra o estado do WhatsApp e, para o administrador, o QR Code de conexão.
export function ConexaoWhatsApp({ admin }: { admin: boolean }) {
  const [estado, setEstado] = useState<Estado | "carregando">("carregando");
  const [qr, setQr] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [porNumero, setPorNumero] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const atualizar = useCallback(async () => {
    const e = await lerEstadoWhatsApp();
    setEstado(e);
    if (e === "open") {
      setQr(null);
      setCodigo(null);
    }
  }, []);

  useEffect(() => {
    atualizar();
  }, [atualizar]);

  // Enquanto o QR ou o código está na tela, confere a cada 3 segundos se o celular já conectou
  useEffect(() => {
    if (!qr && !codigo) return;
    const id = setInterval(atualizar, 3000);
    return () => clearInterval(id);
  }, [qr, codigo, atualizar]);

  async function conectar() {
    setOcupado(true);
    setErro(null);
    const r = await conectarWhatsApp();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setEstado(r.estado);
    setCodigo(null);
    setQr(r.qr);
  }

  /** Sem QR Code: gera o código de 8 caracteres para digitar no celular. */
  async function conectarNumero() {
    setOcupado(true);
    setErro(null);
    const r = await conectarWhatsAppPorNumero(telefone);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setEstado(r.estado);
    setQr(null);
    setCodigo(r.codigo);
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
      {codigo && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div className="codigo-wa" aria-label="Código para digitar no celular">{codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo}</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--muted)", maxWidth: 380 }}>
            <li>No celular do escritório, abra o WhatsApp Business.</li>
            <li>Toque em ⋮ › <b>Aparelhos conectados</b> › <b>Conectar um aparelho</b>.</li>
            <li>Na tela da câmera, toque em <b>Conectar com número de telefone</b> e digite o código ao lado.</li>
            <li>O código vence em cerca de 1 minuto; se vencer, clique em “Gerar novo código”.</li>
          </ol>
        </div>
      )}
      {erro && <div className="aviso erro">{erro}</div>}
      {admin && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {estado !== "open" && (
            <button className={"btn" + (porNumero ? "" : " primary")} type="button" onClick={conectar} disabled={ocupado}>
              {ocupado && !porNumero ? "Aguarde…" : qr ? "Gerar novo QR" : "Conectar com QR Code"}
            </button>
          )}
          {estado !== "open" && !porNumero && (
            <button className="btn" type="button" onClick={() => setPorNumero(true)} disabled={ocupado}>Conectar pelo número de telefone</button>
          )}
          {estado !== "open" && porNumero && (
            <form
              className="conectar-numero"
              onSubmit={(e) => {
                e.preventDefault();
                conectarNumero();
              }}
            >
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="WhatsApp do escritório, com DDD" aria-label="Número do WhatsApp do escritório" required />
              <button className="btn primary" type="submit" disabled={ocupado}>{ocupado ? "Gerando…" : codigo ? "Gerar novo código" : "Gerar código"}</button>
            </form>
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
