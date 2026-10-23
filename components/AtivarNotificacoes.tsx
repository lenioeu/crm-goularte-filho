"use client";

import { useEffect, useState } from "react";
import { removerInscricaoPush, salvarInscricaoPush } from "@/app/(app)/atendimento/actions";
import { Icone } from "@/components/Icone";

function chaveBinaria(base64: string) {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

type Estado = "carregando" | "sem-suporte" | "iphone-instalar" | "bloqueado" | "desligado" | "ligado";

// Liga ou desliga as notificações de mensagem nova neste aparelho.
export function AtivarNotificacoes({ compacto = false }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setEstado(ios && !instalado ? "iphone-instalar" : "sem-suporte");
      }
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "ligado" : "desligado");
    })().catch(() => setEstado("sem-suporte"));
  }, []);

  async function ligar() {
    setMsg(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") return setEstado(permissao === "denied" ? "bloqueado" : "desligado");
      const r = await fetch("/api/push/chave");
      const j = (await r.json()) as { publica?: string; erro?: string };
      if (!j.publica) return setMsg(j.erro ?? "Não consegui ligar as notificações.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBinaria(j.publica) }));
      const res = await salvarInscricaoPush(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (res.erro) return setMsg(res.erro);
      setEstado("ligado");
      setMsg(res.ok);
    } catch (e) {
      setMsg(`Não consegui ligar: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function desligar() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removerInscricaoPush(sub.endpoint);
      await sub.unsubscribe();
    }
    setEstado("desligado");
    setMsg("Notificações desligadas neste aparelho.");
  }

  if (estado === "carregando" || (compacto && (estado === "ligado" || estado === "sem-suporte"))) return null;
  return (
    <div className={compacto ? "aviso info notif-compacta" : ""} style={compacto ? undefined : { display: "flex", flexDirection: "column", gap: 8 }}>
      {estado === "ligado" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip good">Ligadas neste aparelho</span>
          <button type="button" className="btn sm" onClick={desligar}>Desligar</button>
        </div>
      )}
      {estado === "desligado" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {compacto && <span>Quer ser avisado de mensagem nova mesmo com o CRM fechado?</span>}
          <button type="button" className={compacto ? "btn sm" : "btn primary"} onClick={ligar}><Icone nome="sino" tamanho={16} /> Ligar notificações neste aparelho</button>
        </div>
      )}
      {estado === "bloqueado" && <span>As notificações estão bloqueadas no navegador. Libere nas configurações do site (cadeado ao lado do endereço) e recarregue a página.</span>}
      {estado === "iphone-instalar" && <span>No iPhone, as notificações funcionam com o Órion instalado: Safari › Compartilhar › Adicionar à Tela de Início, e abra pelo ícone.</span>}
      {estado === "sem-suporte" && <span>Este navegador não aceita notificações. No celular, use o Chrome (Android) ou o app instalado (iPhone).</span>}
      {msg && <small style={{ color: "var(--muted)" }}>{msg}</small>}
    </div>
  );
}
