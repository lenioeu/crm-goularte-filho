"use client";

import { useState, useTransition } from "react";
import { transcreverAudio } from "@/app/(app)/atendimento/actions";

// Texto do áudio embaixo do player; sem transcrição ainda, botão "Transcrever".
export function TranscricaoAudio({ id, texto, ligada }: { id: string; texto: string | null | undefined; ligada: boolean }) {
  const [atual, setAtual] = useState(texto ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const valor = atual ?? texto ?? null;

  if (valor) return <div className="transcricao"><span>Transcrição</span>{valor}</div>;
  if (!ligada) return null;
  return (
    <div className="transcricao-acoes">
      <button
        type="button"
        className="btn sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await transcreverAudio(id);
            if (r.erro) setErro(r.erro);
            else setAtual(r.texto);
          })
        }
      >
        {pendente ? <><span className="girando" style={{ margin: "0 6px 0 0" }} /> Transcrevendo…</> : "Transcrever"}
      </button>
      {erro && <span className="doc-erro">{erro}</span>}
    </div>
  );
}
