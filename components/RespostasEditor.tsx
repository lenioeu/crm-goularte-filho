"use client";

import { useState, useTransition } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { type RespostaRapida, salvarRespostas } from "@/app/(app)/atendimento-automatico/actions";

// Lista editável de respostas rápidas (atalho + texto).
export function RespostasEditor({ inicial, podeEditar }: { inicial: RespostaRapida[]; podeEditar: boolean }) {
  const [lista, setLista] = useState<RespostaRapida[]>(inicial.length ? inicial : [{ atalho: "", texto: "" }]);
  const [r, setR] = useState<Resultado | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudar = (i: number, campo: keyof RespostaRapida, v: string) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {lista.map((x, i) => (
        <div key={i} className="resposta-linha">
          <div className="resposta-atalho">
            <span>/</span>
            <input value={x.atalho} onChange={(e) => mudar(i, "atalho", e.target.value)} placeholder="docs" disabled={!podeEditar} aria-label="Atalho" />
          </div>
          <textarea rows={2} value={x.texto} onChange={(e) => mudar(i, "texto", e.target.value)} placeholder="Texto que vai para o cliente. Use {nome} para o primeiro nome." disabled={!podeEditar} aria-label="Texto da resposta" />
          {podeEditar && <button type="button" className="btn sm perigo" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} aria-label="Tirar resposta">Tirar</button>}
        </div>
      ))}
      {podeEditar && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={() => setLista((l) => [...l, { atalho: "", texto: "" }])}>+ Resposta</button>
          <button
            type="button"
            className="btn primary"
            disabled={pendente}
            onClick={() => iniciar(async () => setR(await salvarRespostas(lista)))}
          >
            {pendente ? "Salvando…" : "Salvar respostas"}
          </button>
          {r?.erro && <span className="aviso erro">{r.erro}</span>}
          {r?.ok && <span className="aviso ok">{r.ok}</span>}
        </div>
      )}
    </div>
  );
}
