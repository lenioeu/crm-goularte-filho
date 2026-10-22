"use client";

import { useState, useTransition } from "react";
import { COLUNAS_TAREFA } from "@/lib/rotulos";
import { moverTarefa } from "@/app/(app)/actions";

export type Tarefa = {
  id: string;
  titulo: string;
  coluna: string;
  vence_em: string | null;
  responsavel: { nome: string } | null;
  revisor: { nome: string } | null;
  casos: { titulo: string; clientes: { nome: string } | null } | null;
};

function prazo(venceEm: string | null, concluida: boolean) {
  if (!venceEm) return null;
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [, m, d] = venceEm.split("-");
  if (concluida) return <span className="chip">{d}/{m}</span>;
  if (venceEm < hoje) return <span className="chip crit">atrasada · {d}/{m}</span>;
  if (venceEm === hoje) return <span className="chip warn">vence hoje</span>;
  return <span className="chip">até {d}/{m}</span>;
}

export function CartaoTarefa({ t }: { t: Tarefa }) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);

  function mover(coluna: string) {
    if (!coluna) return;
    setAviso(null);
    iniciar(async () => {
      const r = await moverTarefa(t.id, coluna);
      if (r.erro) setAviso({ tipo: "erro", texto: r.erro });
      else if (r.ok && r.ok !== "Movida.") setAviso({ tipo: "ok", texto: r.ok });
    });
  }

  return (
    <div className="deal" style={{ opacity: pendente ? 0.55 : t.coluna === "concluida" ? 0.75 : 1 }}>
      <div className="co">{t.titulo}</div>
      {t.casos && (
        <div className="ds">
          {t.casos.clientes?.nome} · {t.casos.titulo}
        </div>
      )}
      <div className="meta">
        {prazo(t.vence_em, t.coluna === "concluida")}
        {t.responsavel && <span className="age">{t.responsavel.nome}</span>}
      </div>
      {t.revisor && t.coluna === "revisao" && <div className="ds" style={{ fontSize: 12 }}>Revisão: {t.revisor.nome}</div>}
      <select aria-label={`Mover a tarefa ${t.titulo}`} value="" onChange={(e) => mover(e.target.value)} disabled={pendente}>
        <option value="">Mover para…</option>
        {COLUNAS_TAREFA.filter((c) => c.id !== t.coluna).map((c) => (
          <option key={c.id} value={c.id}>
            {c.rotulo}
          </option>
        ))}
      </select>
      {aviso && <div className={aviso.tipo === "erro" ? "erro" : "ds"} style={aviso.tipo === "ok" ? { color: "var(--warn)", fontSize: 12 } : undefined}>{aviso.texto}</div>}
    </div>
  );
}
