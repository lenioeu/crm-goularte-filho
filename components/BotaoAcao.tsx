"use client";

import { useState, useTransition } from "react";
import type { Resultado } from "@/app/(app)/actions";

// Botão que chama uma ação do servidor e mostra o resultado ao lado.
export function BotaoAcao({
  acao,
  rotulo,
  confirmar,
  className = "btn sm",
}: {
  acao: () => Promise<Resultado>;
  rotulo: string;
  confirmar?: string;
  className?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);

  function clicar() {
    if (confirmar && !window.confirm(confirmar)) return;
    setR(null);
    iniciar(async () => setR(await acao()));
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className={className} onClick={clicar} disabled={pendente}>
        {pendente ? "Aguarde…" : rotulo}
      </button>
      {r?.erro && <span style={{ color: "var(--crit)", fontSize: 12.5 }}>{r.erro}</span>}
      {r?.ok && <span style={{ color: "var(--good)", fontSize: 12.5 }}>{r.ok}</span>}
    </span>
  );
}
