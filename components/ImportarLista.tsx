"use client";

import { useState } from "react";
import type { LinhaAnalisada } from "@/app/(app)/processos/actions";
import { analisarLista, cadastrarLista } from "@/app/(app)/processos/actions";

const LOTE = 5;

// Importar vários processos de uma vez: cola a lista do PJe (ou planilha), revisa o cliente de cada um e cadastra.
export function ImportarLista() {
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<LinhaAnalisada[] | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; ok: number; erros: { numero: string; erro: string }[] } | null>(null);

  async function abrirArquivo(f: File | undefined) {
    if (!f) return;
    if (/\.pdf$/i.test(f.name)) {
      setAviso("Para PDF: abra o arquivo, selecione tudo (Ctrl+A), copie (Ctrl+C) e cole no campo acima. Ou envie a planilha (.csv).");
      return;
    }
    setTexto(await f.text());
    setAviso(`Arquivo “${f.name}” carregado. Clique em “Ler a lista”.`);
  }

  async function analisar() {
    setAnalisando(true);
    setAviso(null);
    setProgresso(null);
    const r = await analisarLista(texto);
    setAnalisando(false);
    if (r.erro) return setAviso(r.erro);
    setLinhas(r.linhas);
    setClientes(r.clientes);
    const auto = r.linhas.filter((l) => l.escolhido && l.escolhido !== "novo").length;
    const novos = r.linhas.filter((l) => l.escolhido === "novo").length;
    setAviso(`${r.linhas.length} processos lidos: ${auto} ligados a clientes do CRM, ${novos} viram cliente novo. Confira a coluna “Cliente no CRM” antes de cadastrar.`);
  }

  async function cadastrar() {
    if (!linhas) return;
    const lista = linhas.filter((l) => !l.jaCadastrado && l.escolhido);
    const estado = { feito: 0, total: lista.length, ok: 0, erros: [] as { numero: string; erro: string }[] };
    setProgresso({ ...estado });
    for (let i = 0; i < lista.length; i += LOTE) {
      const parte = lista.slice(i, i + LOTE);
      try {
        const r = await cadastrarLista(parte.map((l) => ({ numero: l.numero, clienteId: l.escolhido, nome: l.nome, parteContraria: l.parteContraria })));
        estado.ok += r.ok;
        estado.erros.push(...r.erros);
      } catch {
        // O servidor não respondeu a tempo: segue com os próximos; no fim a lista é conferida de novo
        estado.erros.push(...parte.map((l) => ({ numero: l.numero, erro: "o servidor não respondeu a tempo; confira se entrou e tente de novo" })));
      }
      estado.feito = Math.min(i + LOTE, lista.length);
      setProgresso({ ...estado, erros: [...estado.erros] });
    }
    // Confere no banco o que entrou de fato (inclusive lotes que estouraram o tempo no meio)
    try {
      const r = await analisarLista(texto);
      if (!r.erro) {
        const entrou = new Set(r.linhas.filter((l) => l.jaCadastrado).map((l) => l.numero));
        setLinhas((ls) => (ls ?? []).map((l) => (entrou.has(l.numero) ? { ...l, jaCadastrado: true } : l)));
        estado.erros = estado.erros.filter((e) => !entrou.has(e.numero));
        estado.ok = [...entrou].filter((n) => lista.some((l) => l.numero === n)).length;
        setProgresso({ ...estado, erros: [...estado.erros] });
      }
    } catch {}
  }

  const escolher = (numero: string, v: string) => setLinhas((ls) => (ls ?? []).map((l) => (l.numero === numero ? { ...l, escolhido: v } : l)));
  const marcados = (linhas ?? []).filter((l) => !l.jaCadastrado && l.escolhido).length;
  const ocupado = analisando || Boolean(progresso && progresso.feito < progresso.total);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
        Cole aqui o acervo do PJe (abra o PDF, Ctrl+A, Ctrl+C) ou uma planilha com <b>número; cliente; parte contrária</b>. O CRM acha o cliente
        de cada processo pelo nome, você confere e cadastra tudo de uma vez.
      </p>
      <textarea className="area-importar" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole a lista aqui" disabled={ocupado} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn primary" onClick={analisar} disabled={ocupado || !texto.trim()}>{analisando ? "Lendo…" : "Ler a lista"}</button>
        <label className="btn">
          Abrir planilha (.csv)
          <input type="file" accept=".csv,.txt,text/csv,text/plain,.pdf" hidden onChange={(e) => abrirArquivo(e.target.files?.[0])} />
        </label>
        {aviso && <span style={{ fontSize: 13, color: "var(--muted)" }}>{aviso}</span>}
      </div>

      {linhas && linhas.length > 0 && (
        <>
          <div className="scrollx" style={{ maxHeight: 520, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
            <table className="tbl">
              <thead><tr><th>Processo</th><th>Nome na lista</th><th>Parte contrária</th><th style={{ minWidth: 260 }}>Cliente no CRM</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.numero} style={l.jaCadastrado ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, whiteSpace: "nowrap" }}>{l.numero}</td>
                    <td>{l.nome || "—"}</td>
                    <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{l.parteContraria || "—"}</td>
                    <td>
                      {l.jaCadastrado ? (
                        <span className="chip good">já cadastrado</span>
                      ) : (
                        <select className="sel-cliente" value={l.escolhido} onChange={(e) => escolher(l.numero, e.target.value)} disabled={ocupado} aria-label={`Cliente do processo ${l.numero}`}>
                          <option value="">— não importar —</option>
                          {l.nome && <option value="novo">+ Criar cliente novo: {l.nome}</option>}
                          {l.sugestoes.length > 0 && (
                            <optgroup label="Parecidos">
                              {l.sugestoes.map((s) => <option key={s.id} value={s.id}>★ {s.nome} ({Math.round(s.nota * 100)}%)</option>)}
                            </optgroup>
                          )}
                          <optgroup label="Todos os clientes">
                            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                          </optgroup>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={cadastrar} disabled={ocupado || !marcados}>Cadastrar {marcados} {marcados === 1 ? "processo" : "processos"}</button>
            {progresso && (
              <span style={{ fontSize: 13 }}>
                {progresso.feito < progresso.total ? `Cadastrando e consultando o CNJ… ${progresso.feito} de ${progresso.total}` : `Pronto: ${progresso.ok} cadastrados.`}
                {progresso.erros.length > 0 && ` ${progresso.erros.length} com problema.`}
              </span>
            )}
          </div>
          {progresso && progresso.erros.length > 0 && <div className="aviso erro">{progresso.erros.map((e) => <div key={e.numero}>{e.numero}: {e.erro}</div>)}</div>}
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)" }}>
            Cada processo ganha um caso no funil (contrato assinado), com a parte contrária preenchida. O mesmo cliente pode ter vários processos.
          </p>
        </>
      )}
    </div>
  );
}
