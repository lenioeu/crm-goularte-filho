"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { excluirClientes } from "@/app/(app)/actions";
import { criarPastaCliente } from "@/app/(app)/integracoes/actions";
import { BotaoAcao } from "@/components/BotaoAcao";
import { IconeDrive } from "@/components/IconeDrive";
import { Icone } from "@/components/Icone";

export type LinhaCliente = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone_whatsapp: string | null;
  email: string | null;
  origem: string | null;
  area: { nome: string; cor: string } | null;
  responsavel: string | null;
  processos: number;
  pasta_drive_url: string | null;
  criado_em: string;
  tipo?: string | null; // aba Contatos: "Cliente" ou o tipo de quem ainda não é cliente
};

function telefone(t: string | null) {
  if (!t) return "—";
  const d = t.replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/** Planilha CSV (abre no Excel e no Google Planilhas). */
function baixarCsv(linhas: LinhaCliente[]) {
  const cab = ["Nome", "CPF/CNPJ", "WhatsApp", "E-mail", "Área", "Responsável", "Processos", "Origem", "Pasta no Drive", "Cadastrado em"];
  const cel = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const corpo = linhas.map((c) =>
    [c.nome, c.cpf_cnpj, telefone(c.telefone_whatsapp), c.email, c.area?.nome, c.responsavel, c.processos, c.origem, c.pasta_drive_url, c.criado_em.slice(0, 10).split("-").reverse().join("/")]
      .map(cel)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [cab.map(cel).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const CHAVES = {
  nome: (c: LinhaCliente) => c.nome,
  area: (c: LinhaCliente) => c.area?.nome ?? "~",
  whatsapp: (c: LinhaCliente) => c.telefone_whatsapp ?? "~",
  responsavel: (c: LinhaCliente) => c.responsavel ?? "~",
  processos: (c: LinhaCliente) => c.processos,
};

export function TabelaClientes({ linhas, admin, driveLigado }: { linhas: LinhaCliente[]; admin: boolean; driveLigado: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [r, setR] = useState<Resultado | null>(null);
  const [pendente, iniciar] = useTransition();

  // Ordenar pela coluna clicada
  const [ordem, setOrdem] = useState<{ col: keyof typeof CHAVES; desc: boolean }>({ col: "nome", desc: false });
  const ordenadas = [...linhas].sort((a, b) => {
    const [x, y] = [CHAVES[ordem.col](a), CHAVES[ordem.col](b)];
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
    return ordem.desc ? -r : r;
  });
  const th = (col: keyof typeof CHAVES, rotulo: string, num = false) => (
    <th className={num ? "num" : undefined} aria-sort={ordem.col === col ? (ordem.desc ? "descending" : "ascending") : "none"}>
      <button type="button" className="th-ordem" onClick={() => setOrdem((o) => ({ col, desc: o.col === col ? !o.desc : false }))}>
        {rotulo}{ordem.col === col ? (ordem.desc ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  const todos = linhas.length > 0 && linhas.every((c) => sel.has(c.id));
  const marcados = linhas.filter((c) => sel.has(c.id));

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function excluir() {
    const nomes = marcados.slice(0, 5).map((c) => c.nome).join(", ") + (marcados.length > 5 ? "…" : "");
    if (!window.confirm(`Excluir ${marcados.length} ${marcados.length === 1 ? "cliente" : "clientes"} (${nomes})? Saem junto casos, processos, audiências, tarefas e conversas. Não dá para desfazer. As pastas no Drive não são apagadas.`)) return;
    setR(null);
    iniciar(async () => {
      const res = await excluirClientes(marcados.map((c) => c.id));
      setR(res);
      if (res.ok) {
        setSel(new Set());
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="acoes-lote">
        <span>{sel.size ? `${sel.size} selecionado${sel.size > 1 ? "s" : ""}` : `${linhas.length} na lista`}</span>
        <button type="button" className="btn sm" onClick={() => baixarCsv(sel.size ? marcados : linhas)} disabled={!linhas.length}>
          <Icone nome="baixar" tamanho={16} /> Exportar {sel.size ? "selecionados" : "a lista"} (planilha)
        </button>
        {admin && sel.size > 0 && (
          <button type="button" className="btn sm perigo" onClick={excluir} disabled={pendente}>{pendente ? "Excluindo…" : `Excluir ${sel.size}`}</button>
        )}
        {sel.size > 0 && <button type="button" className="btn sm" onClick={() => setSel(new Set())}>Limpar seleção</button>}
        {r?.erro && <span className="doc-erro" style={{ width: "auto" }}>{r.erro}</span>}
        {r?.ok && <span className="doc-ok">{r.ok}</span>}
      </div>
      <div className="scrollx tabela-alta">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(linhas.map((c) => c.id)))} aria-label="Selecionar todos da lista" style={{ width: 17, height: 17 }} />
              </th>
              {th("nome", "Cliente")}{th("area", "Área")}{th("whatsapp", "WhatsApp")}{th("responsavel", "Responsável")}{th("processos", "Processos", true)}<th>Pasta no Drive</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((c) => (
              <tr key={c.id} className={sel.has(c.id) ? "sel" : undefined}>
                <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} aria-label={`Selecionar ${c.nome}`} style={{ width: 17, height: 17 }} /></td>
                <td><Link href={`/clientes/${c.id}`} style={{ fontWeight: 500, color: "var(--accent)" }}>{c.nome}</Link>{c.tipo && <span className={"chip " + (c.tipo === "Cliente" ? "acc" : "warn")} style={{ marginLeft: 8 }}>{c.tipo}</span>}{c.cpf_cnpj && <small>{c.cpf_cnpj}</small>}</td>
                <td>{c.area ? <span className="chip area" style={{ "--c": c.area.cor } as React.CSSProperties}>{c.area.nome}</span> : <span className="chip">a definir</span>}</td>
                <td className="num">{telefone(c.telefone_whatsapp)}</td>
                <td>{c.responsavel ?? "—"}</td>
                <td className="num">{c.processos || "—"}</td>
                <td>
                  {c.pasta_drive_url ? (
                    <a className="btn sm" href={c.pasta_drive_url} target="_blank" rel="noopener"><IconeDrive tamanho={14} /> Abrir</a>
                  ) : driveLigado ? (
                    <BotaoAcao acao={criarPastaCliente.bind(null, c.id)} rotulo="Criar pasta" />
                  ) : (
                    <span className="chip">após ligar o Drive</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
