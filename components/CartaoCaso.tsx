"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moverCaso } from "@/app/(app)/actions";
import { ETAPAS_FUNIL } from "@/lib/rotulos";

export type CasoCartao = {
  id: string;
  titulo: string;
  resumo: string | null;
  etapa: string;
  sigiloso: boolean;
  motivo_nao_viavel: string | null;
  atualizado_em: string;
  clientes: { id: string; nome: string } | null;
  areas: { nome: string; cor: string } | null;
  perfis: { nome: string } | null;
};

function ha(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

export function CartaoCaso({ caso }: { caso: CasoCartao }) {
  const [pendente, iniciar] = useTransition();
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function mover(etapa: string, mot: string | null = null) {
    setErro(null);
    iniciar(async () => {
      const r = await moverCaso(caso.id, etapa, mot);
      if (r.erro) setErro(r.erro);
      else {
        setDestino("");
        setMotivo("");
      }
    });
  }

  function escolher(v: string) {
    setDestino(v);
    if (v && v !== "nao_viavel") mover(v);
  }

  return (
    <div className="deal" style={{ opacity: pendente ? 0.55 : 1 }}>
      <div className="co">{caso.clientes ? <Link href={`/clientes/${caso.clientes.id}`}>{caso.clientes.nome}</Link> : "Cliente"}</div>
      <div className="ds">{caso.titulo}</div>
      {caso.resumo && <div className="ds" style={{ color: "var(--dim)" }}>{caso.resumo}</div>}
      {caso.etapa === "nao_viavel" && caso.motivo_nao_viavel && (
        <div className="ds">Motivo: {caso.motivo_nao_viavel}</div>
      )}
      <div className="meta">
        {caso.areas && (
          <span className="chip area" style={{ "--c": caso.areas.cor } as React.CSSProperties}>
            {caso.areas.nome}
          </span>
        )}
        {caso.sigiloso && <span className="chip warn">sigiloso</span>}
        <span className="age">{ha(caso.atualizado_em)}</span>
      </div>
      {caso.perfis && <div className="ds" style={{ fontSize: 12 }}>Responsável: {caso.perfis.nome}</div>}
      <select
        aria-label={`Mover o caso de ${caso.clientes?.nome ?? "cliente"}`}
        value={destino}
        onChange={(e) => escolher(e.target.value)}
        disabled={pendente}
      >
        <option value="">Mover para…</option>
        {ETAPAS_FUNIL.filter((e) => e.id !== caso.etapa).map((e) => (
          <option key={e.id} value={e.id}>
            {e.rotulo}
          </option>
        ))}
        {caso.etapa !== "nao_viavel" && <option value="nao_viavel">Não viável…</option>}
      </select>
      {destino === "nao_viavel" && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            aria-label="Motivo"
            placeholder="Motivo (ex.: prescrito)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
          <button className="btn sm" type="button" onClick={() => mover("nao_viavel", motivo)} disabled={pendente}>
            OK
          </button>
        </div>
      )}
      {erro && <div className="erro">{erro}</div>}
    </div>
  );
}
