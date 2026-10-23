"use client";

import { useState, useTransition } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { useAviso } from "@/components/Avisos";

// Botão que chama uma ação do servidor. O resultado aparece num aviso no canto (com "Desfazer"
// quando a ação permite); fora do sistema, aparece ao lado do botão.
export function BotaoAcao({
  acao,
  rotulo,
  confirmar,
  desfazer,
  className = "btn sm",
}: {
  acao: () => Promise<Resultado>;
  rotulo: string;
  confirmar?: string;
  desfazer?: () => Promise<Resultado>;
  className?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);
  const aviso = useAviso();

  function clicar() {
    if (confirmar && !window.confirm(confirmar)) return;
    setR(null);
    iniciar(async () => {
      const res = await acao();
      if (aviso && res.ok) aviso(res.ok, { desfazer });
      else setR(res);
    });
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
