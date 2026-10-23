"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/Icone";

// Abre e fecha o painel do cliente ao lado da conversa (lembra a escolha neste aparelho).
export function BotaoPainel() {
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem("painel-cliente");
    } catch {}
    // Em tela pequena começa fechado; em tela grande, aberto (ou como a pessoa deixou)
    const inicial = salvo ? salvo === "aberto" : window.innerWidth >= 1280;
    setAberto(inicial);
    document.documentElement.dataset.painel = inicial ? "aberto" : "fechado";
  }, []);

  function alternar() {
    const novo = !aberto;
    setAberto(novo);
    document.documentElement.dataset.painel = novo ? "aberto" : "fechado";
    try {
      localStorage.setItem("painel-cliente", novo ? "aberto" : "fechado");
    } catch {}
  }

  return (
    <button type="button" className={"btn sm" + (aberto ? " ativo" : "")} onClick={alternar} aria-pressed={aberto} title="Painel do cliente">
      <Icone nome="painel" tamanho={16} /> Cliente
    </button>
  );
}
