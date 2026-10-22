"use client";

import { useState, useTransition } from "react";
import { excluirAudiencia } from "@/app/(app)/actions";

export function ExcluirAudiencia({ id, descricao }: { id: string; descricao: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function excluir() {
    if (!window.confirm(`Excluir a audiência “${descricao}”? O lembrete programado para o cliente também será cancelado.`)) return;
    iniciar(async () => {
      const r = await excluirAudiencia(id);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <>
      <button type="button" className="linkbtn" onClick={excluir} disabled={pendente}>
        {pendente ? "Excluindo…" : "Excluir"}
      </button>
      {erro && <span className="linkbtn">{erro}</span>}
    </>
  );
}
