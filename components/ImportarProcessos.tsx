"use client";

import { useMemo, useState } from "react";
import type { Achado } from "@/app/(app)/processos/actions";
import { cadastrarAchados, procurarNasPastas } from "@/app/(app)/processos/actions";

const chave = (a: Achado) => `${a.clienteId}|${a.numero}`;
const LOTE = 10;

// Procura números de processo nos nomes dos arquivos das pastas dos clientes e,
// depois da revisão, cadastra os marcados de pouco em pouco (cada um consulta o DataJud).
export function ImportarProcessos() {
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; ok: number; erros: { numero: string; erro: string }[] } | null>(null);
  const [busca, setBusca] = useState("");

  async function procurar() {
    setProcurando(true);
    setAviso(null);
    setProgresso(null);
    const r = await procurarNasPastas();
    setProcurando(false);
    setAviso(r.erro ?? `Li ${r.pastas} pastas de clientes.`);
    setAchados(r.achados);
    // Marca o que é novo e sem dúvida; número que aparece em mais de um cliente fica para você escolher
    setMarcados(new Set(r.achados.filter((a) => !a.jaCadastrado && a.outrosClientes.length === 0).map(chave)));
  }

  async function cadastrar() {
    if (!achados) return;
    const lista = achados.filter((a) => marcados.has(chave(a)));
    const numeros = new Set<string>();
    const repetido = lista.find((a) => (numeros.has(a.numero) ? true : (numeros.add(a.numero), false)));
    if (repetido) return setAviso(`O processo ${repetido.numero} está marcado para mais de um cliente. Deixe marcado só o cliente certo.`);
    const estado = { feito: 0, total: lista.length, ok: 0, erros: [] as { numero: string; erro: string }[] };
    setProgresso({ ...estado });
    for (let i = 0; i < lista.length; i += LOTE) {
      const r = await cadastrarAchados(lista.slice(i, i + LOTE).map((a) => ({ clienteId: a.clienteId, numero: a.numero })));
      estado.feito = Math.min(i + LOTE, lista.length);
      estado.ok += r.ok;
      estado.erros.push(...r.erros);
      setProgresso({ ...estado, erros: [...estado.erros] });
    }
    const feitos = new Set(lista.map((a) => a.numero).filter((n) => !estado.erros.some((e) => e.numero === n)));
    setAchados((xs) => (xs ?? []).map((a) => (feitos.has(a.numero) ? { ...a, jaCadastrado: true } : a)));
    setMarcados(new Set());
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (achados ?? []).filter((a) => !q || a.cliente.toLowerCase().includes(q) || a.numero.includes(q));
  }, [achados, busca]);
  const novos = (achados ?? []).filter((a) => !a.jaCadastrado);
  const ocupado = procurando || Boolean(progresso && progresso.feito < progresso.total);

  function alternar(a: Achado) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(chave(a))) n.delete(chave(a));
      else n.add(chave(a));
      return n;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
        Procura números de processo nos nomes dos arquivos das pastas dos clientes no Drive (ex.: “ATOrd_0000385-54.2025.5.17.0007.pdf”). Nada é
        cadastrado antes de você revisar a lista e confirmar. Leva cerca de um minuto.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn primary" type="button" onClick={procurar} disabled={ocupado}>
          {procurando ? "Lendo as pastas…" : achados ? "Procurar de novo" : "Procurar processos nas pastas"}
        </button>
        {aviso && <span style={{ fontSize: 13, color: "var(--muted)" }}>{aviso}</span>}
      </div>

      {achados && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <b style={{ fontWeight: 500 }}>
              {achados.length} encontrados · {novos.length} ainda não cadastrados · {marcados.size} marcados
            </b>
            <input className="filtro-texto" placeholder="Filtrar por cliente ou número" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <button className="btn sm" type="button" onClick={() => setMarcados(new Set(novos.filter((a) => a.outrosClientes.length === 0).map(chave)))} disabled={ocupado}>Marcar os novos</button>
            <button className="btn sm" type="button" onClick={() => setMarcados(new Set())} disabled={ocupado}>Desmarcar todos</button>
          </div>

          {achados.length === 0 ? (
            <div className="vazio">Nenhum número de processo apareceu nos nomes dos arquivos.</div>
          ) : (
            <div className="scrollx" style={{ maxHeight: 480, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
              <table className="tbl">
                <thead><tr><th style={{ width: 36 }} /><th>Cliente</th><th>Processo</th><th>Arquivo onde apareceu</th></tr></thead>
                <tbody>
                  {visiveis.map((a) => (
                    <tr key={chave(a)} style={a.jaCadastrado ? { opacity: 0.55 } : undefined}>
                      <td>
                        <input type="checkbox" checked={marcados.has(chave(a))} disabled={a.jaCadastrado || ocupado} onChange={() => alternar(a)} aria-label={`Cadastrar ${a.numero} para ${a.cliente}`} style={{ width: 17, height: 17 }} />
                      </td>
                      <td>{a.cliente}</td>
                      <td style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {a.numero}
                        {a.jaCadastrado && <span className="chip good" style={{ marginLeft: 6 }}>já cadastrado</span>}
                        {!a.jaCadastrado && a.outrosClientes.length > 0 && (
                          <div><span className="chip warn">também na pasta de {a.outrosClientes.join(", ")}</span></div>
                        )}
                      </td>
                      <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{a.arquivos.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary" type="button" onClick={cadastrar} disabled={ocupado || marcados.size === 0}>
              Cadastrar {marcados.size} {marcados.size === 1 ? "processo" : "processos"}
            </button>
            {progresso && (
              <span style={{ fontSize: 13 }}>
                {progresso.feito < progresso.total ? `Cadastrando e consultando o CNJ… ${progresso.feito} de ${progresso.total}` : `Pronto: ${progresso.ok} cadastrados.`}
                {progresso.erros.length > 0 && ` ${progresso.erros.length} com problema.`}
              </span>
            )}
          </div>
          {progresso && progresso.erros.length > 0 && (
            <div className="aviso erro">
              {progresso.erros.slice(0, 20).map((e) => <div key={e.numero}>{e.numero}: {e.erro}</div>)}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)" }}>
            Cada processo cadastrado ganha um caso no funil, como contrato assinado, com o nome da ação que vem do CNJ. O que não tiver número no nome de
            nenhum arquivo continua sendo cadastrado à mão, pelo “+ Cadastrar processo”.
          </p>
        </>
      )}
    </div>
  );
}
