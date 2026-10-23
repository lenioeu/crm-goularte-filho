"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { adicionarTipoContato, mudarTipoContato } from "@/app/(app)/clientes/actions";
import { useAviso } from "@/components/Avisos";

const NOVO = "__novo__";
const GERENCIAR = "__gerenciar__";

// Escolha do tipo de um contato (Interessado, Parte contrária…), com "Novo tipo…" na própria lista.
export function TipoContato({ id, atual, tipos }: { id: string; atual: string | null; tipos: string[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pendente, iniciar] = useTransition();
  const lista = atual && !tipos.includes(atual) ? [...tipos, atual] : tipos;

  function escolher(valor: string) {
    if (valor === GERENCIAR) return router.push("/clientes?ver=contatos#tipos");
    let tipo = valor;
    if (valor === NOVO) {
      tipo = window.prompt("Nome do novo tipo de contato (ex.: Perito, Imprensa):")?.trim() ?? "";
      if (!tipo) return;
    }
    iniciar(async () => {
      if (valor === NOVO) {
        const criado = await adicionarTipoContato(tipo);
        if (criado.erro) return aviso ? aviso(criado.erro, { tipo: "erro" }) : alert(criado.erro);
      }
      const r = await mudarTipoContato(id, tipo);
      if (aviso) aviso(r.erro ?? r.ok ?? "", { tipo: r.erro ? "erro" : "ok" });
      router.refresh();
    });
  }

  return (
    <select className="tipo-contato" value={atual ?? ""} onChange={(e) => escolher(e.target.value)} disabled={pendente} aria-label="Tipo de contato">
      <option value="">Sem tipo</option>
      {lista.map((t) => <option key={t} value={t}>{t}</option>)}
      <option value={NOVO}>＋ Novo tipo…</option>
      <option value={GERENCIAR}>Adicionar ou remover tipos…</option>
    </select>
  );
}
