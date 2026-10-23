"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { vincularCliente } from "@/app/(app)/atendimento/actions";

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "Vincular a cliente": procura um cliente já cadastrado e liga a conversa a ele.
export function VincularCliente({ conversaId, clientes, atual }: { conversaId: string; clientes: { id: string; nome: string; cpf_cnpj: string | null }[]; atual: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [r, setR] = useState<Resultado | null>(null);
  const [pendente, iniciar] = useTransition();

  const achados = useMemo(() => {
    const q = sem(busca.trim());
    const d = busca.replace(/\D/g, "");
    if (q.length < 2) return [];
    return clientes
      .filter((c) => c.id !== atual && (sem(c.nome).includes(q) || (d.length >= 3 && (c.cpf_cnpj ?? "").replace(/\D/g, "").includes(d))))
      .slice(0, 8);
  }, [busca, clientes, atual]);

  function escolher(c: { id: string; nome: string }) {
    if (!window.confirm(`Ligar esta conversa a ${c.nome}? Se o contato foi cadastrado sozinho pelo WhatsApp, o cadastro provisório é juntado a ${c.nome} e apagado.`)) return;
    iniciar(async () => {
      const res = await vincularCliente(conversaId, c.id);
      setR(res);
      if (res.ok) {
        setAberto(false);
        setBusca("");
        router.refresh();
      }
    });
  }

  return (
    <div className="vincular">
      <button type="button" className="btn sm" onClick={() => setAberto((v) => !v)}>{aberto ? "Fechar" : "Vincular a cliente"}</button>
      {aberto && (
        <div className="vincular-painel">
          <input autoFocus placeholder="Nome ou CPF do cliente" value={busca} onChange={(e) => setBusca(e.target.value)} disabled={pendente} aria-label="Procurar cliente" />
          {busca.trim().length >= 2 && achados.length === 0 && <div className="vincular-vazio">Nenhum cliente com esse nome.</div>}
          {achados.map((c) => (
            <button key={c.id} type="button" className="vincular-item" onClick={() => escolher(c)} disabled={pendente}>
              {c.nome}
              {c.cpf_cnpj && <small> · {c.cpf_cnpj}</small>}
            </button>
          ))}
          {pendente && <div className="vincular-vazio">Ligando…</div>}
        </div>
      )}
      {r?.erro && <span className="doc-erro">{r.erro}</span>}
      {r?.ok && <span className="doc-ok">{r.ok}</span>}
    </div>
  );
}
