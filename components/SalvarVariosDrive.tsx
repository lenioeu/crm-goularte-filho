"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { salvarDocumento } from "@/app/(app)/atendimento/actions";
import { useAviso } from "@/components/Avisos";
import { Icone, type NomeIcone } from "@/components/Icone";
import { IconeDrive } from "@/components/IconeDrive";
import { TIPOS_DOCUMENTO } from "@/lib/rotulos";

export type ArquivoConversa = { id: string; tipo: string; nome: string | null; em: string; doCliente: boolean };

const ICONE: Record<string, NomeIcone> = { imagem: "foto", video: "video", audio: "microfone", documento: "documento" };
const JUNTOS = 2; // arquivos enviados ao Drive ao mesmo tempo
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// "Salvar arquivos no Drive": escolhe vários arquivos da conversa e manda todos para a pasta do cliente.
export function SalvarVariosDrive({ arquivos }: { arquivos: ArquivoConversa[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [tipos, setTipos] = useState<Record<string, string>>({});
  const [todos, setTodos] = useState("");
  const [resultado, setResultado] = useState<Record<string, { ok?: string; erro?: string }>>({});
  const [salvando, setSalvando] = useState(false);

  // Ao abrir: marca os que o cliente mandou
  useEffect(() => {
    if (!aberto) return;
    setMarcados(new Set(arquivos.filter((a) => a.doCliente).map((a) => a.id)));
    setResultado({});
  }, [aberto, arquivos]);

  if (!arquivos.length) return null;

  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const escolhidos = arquivos.filter((a) => marcados.has(a.id) && !resultado[a.id]?.ok);
  const semTipo = escolhidos.filter((a) => !(tipos[a.id] ?? todos).trim());

  async function salvar() {
    if (!escolhidos.length || semTipo.length) return;
    setSalvando(true);
    // Mesmo tipo em vários arquivos: numera ("RG 1", "RG 2") para os nomes não se repetirem
    const contagem: Record<string, number> = {};
    escolhidos.forEach((a) => { const t = (tipos[a.id] ?? todos).trim().toUpperCase(); contagem[t] = (contagem[t] ?? 0) + 1; });
    const vistos: Record<string, number> = {};
    const fila = escolhidos.map((a) => {
      const t = (tipos[a.id] ?? todos).trim().toUpperCase();
      vistos[t] = (vistos[t] ?? 0) + 1;
      return { a, tipo: contagem[t] > 1 ? `${t} ${vistos[t]}` : t };
    });
    let i = 0, certos = 0;
    async function trabalhador() {
      while (i < fila.length) {
        const { a, tipo } = fila[i++];
        const f = new FormData();
        f.set("mensagem_id", a.id);
        f.set("tipo", tipo);
        const r = await salvarDocumento({ erro: null, ok: null }, f).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : String(e), ok: null }));
        if (r.ok) certos++;
        setResultado((x) => ({ ...x, [a.id]: r.ok ? { ok: r.ok } : { erro: r.erro ?? "Erro" } }));
      }
    }
    await Promise.all(Array.from({ length: JUNTOS }, trabalhador));
    setSalvando(false);
    if (aviso && certos) aviso(`${certos} ${certos === 1 ? "arquivo salvo" : "arquivos salvos"} na pasta do cliente no Drive.`);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setAberto(true)}>
        <IconeDrive /> Salvar arquivos no Drive · {arquivos.length}
      </button>
      {aberto && (
        <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && !salvando && setAberto(false)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-label="Salvar arquivos no Drive">
            <div className="ctitle">
              <h3>Salvar arquivos no Drive</h3>
              <button type="button" className="hbtn-claro" onClick={() => setAberto(false)} disabled={salvando} aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13.5 }}>
              Marque os arquivos e diga que documento é cada um. Eles vão para a pasta do cliente como “AAAA-MM-DD TIPO - NOME”.
              Se o cliente ainda não tem pasta, ela é criada.
            </p>
            <div className="varios-topo">
              <label><input type="checkbox" checked={escolhidos.length > 0 && escolhidos.length === arquivos.filter((a) => !resultado[a.id]?.ok).length} onChange={(e) => setMarcados(e.target.checked ? new Set(arquivos.map((a) => a.id)) : new Set())} /> Todos</label>
              <input list="tipos-varios" value={todos} onChange={(e) => setTodos(e.target.value)} placeholder="Tipo para os marcados sem tipo (ex.: DOCUMENTO)" aria-label="Tipo para todos" />
            </div>
            <datalist id="tipos-varios">{TIPOS_DOCUMENTO.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="varios-lista">
              {arquivos.map((a) => {
                const r = resultado[a.id];
                return (
                  <div key={a.id} className={"varios-item" + (r?.ok ? " feito" : "")}>
                    <input type="checkbox" checked={marcados.has(a.id) && !r?.ok} disabled={Boolean(r?.ok) || salvando} onChange={() => alternar(a.id)} aria-label={`Marcar ${a.nome ?? a.tipo}`} />
                    <Icone nome={ICONE[a.tipo] ?? "documento"} tamanho={18} />
                    <div className="varios-info">
                      <b>{a.nome ?? a.tipo}</b>
                      <small>{a.doCliente ? "do cliente" : "do escritório"} · {dataHora(a.em)}</small>
                      {r?.ok && <small className="doc-ok">{r.ok}</small>}
                      {r?.erro && <small className="doc-erro">{r.erro}</small>}
                    </div>
                    {!r?.ok && (
                      <input
                        list="tipos-varios"
                        value={tipos[a.id] ?? ""}
                        onChange={(e) => setTipos((t) => ({ ...t, [a.id]: e.target.value }))}
                        placeholder={todos || "Que documento é?"}
                        disabled={salvando}
                        aria-label="Tipo do documento"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={salvar} disabled={salvando || !escolhidos.length || semTipo.length > 0}>
                {salvando ? <><span className="girando" style={{ margin: "0 6px 0 0" }} /> Salvando…</> : `Salvar ${escolhidos.length} no Drive`}
              </button>
              <button type="button" className="btn" onClick={() => setAberto(false)} disabled={salvando}>Fechar</button>
              {semTipo.length > 0 && escolhidos.length > 0 && <small style={{ color: "var(--warn)" }}>Falta o tipo de {semTipo.length} {semTipo.length === 1 ? "arquivo" : "arquivos"}.</small>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
