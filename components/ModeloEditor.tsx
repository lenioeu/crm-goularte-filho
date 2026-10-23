"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { FolhaPrevia } from "@/components/FolhaPrevia";
import { camposDoModelo, CLIENTE_EXEMPLO, type EscritorioDoc, MARCADORES, renderizar } from "@/lib/modelos";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;
type Inicial = { id: string; nome: string; arquivo: string; descricao: string; conteudo: string; ordem: number; rodape: boolean };

const GRUPOS = ["Cliente", "Escritório", "Data", "Texto", "Assinaturas", "Perguntas"];

// Editor de modelo: texto à esquerda, prévia ao vivo (com uma cliente de exemplo) à direita.
export function ModeloEditor({ action, inicial, escritorio, podeEditar }: { action: Acao; inicial: Inicial; escritorio: EscritorioDoc; podeEditar: boolean }) {
  const [estado, enviar, pendente] = useActionState(action, { erro: null, ok: null });
  const [conteudo, setConteudo] = useState(inicial.conteudo);
  const [nome, setNome] = useState(inicial.nome);
  const [comRodape, setComRodape] = useState(inicial.rodape);
  const texto = useRef<HTMLTextAreaElement>(null);

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const blocos = useMemo(() => renderizar(conteudo, { cliente: CLIENTE_EXEMPLO, advogados: [], escritorio, data: hoje, extra: {} }), [conteudo, escritorio, hoje]);
  const perguntas = useMemo(() => camposDoModelo(conteudo), [conteudo]);

  function inserir(marcador: string) {
    const el = texto.current;
    if (!el || !podeEditar) return;
    const ini = el.selectionStart, fim = el.selectionEnd;
    const novo = conteudo.slice(0, ini) + marcador + conteudo.slice(fim);
    setConteudo(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = ini + marcador.length;
    });
  }

  return (
    <div className="grid cols-2e" style={{ alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <form action={enviar} className="card form">
          <input type="hidden" name="id" value={inicial.id} />
          <div className="field"><label htmlFor="nome">Nome do modelo</label><input id="nome" name="nome" required value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditar} placeholder="ex.: Procuração previdenciária" /></div>
          <div className="field"><label htmlFor="arquivo">Começo do nome do arquivo</label><input id="arquivo" name="arquivo" defaultValue={inicial.arquivo} disabled={!podeEditar} placeholder={nome ? nome.toUpperCase() : "ex.: PROCURAÇÃO"} /></div>
          <div className="field full"><label htmlFor="descricao">Descrição (opcional)</label><input id="descricao" name="descricao" defaultValue={inicial.descricao} disabled={!podeEditar} placeholder="Para que serve, em uma linha" /></div>
          <div className="field full">
            <label htmlFor="conteudo">Texto do modelo</label>
            <textarea
              id="conteudo"
              name="conteudo"
              ref={texto}
              rows={22}
              required
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              disabled={!podeEditar}
              spellCheck
              style={{ fontFamily: "var(--f-mono)", fontSize: 13, lineHeight: 1.55 }}
            />
            <small style={{ color: "var(--dim)", fontSize: 12 }}>
              Cada linha é um parágrafo. <code># </code>título centralizado · <code>## </code>subtítulo em negrito · <code>&gt; </code>linha centralizada ·{" "}
              <code>**texto**</code> negrito. Dá para colar o texto direto do Word.
            </small>
          </div>
          <div className="field"><label htmlFor="ordem">Posição na lista</label><input id="ordem" name="ordem" type="number" defaultValue={inicial.ordem} disabled={!podeEditar} /></div>
          <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" name="rodape" checked={comRodape} onChange={(e) => setComRodape(e.target.checked)} disabled={!podeEditar} style={{ width: 18, height: 18 }} />
            Rodapé com telefone, e-mail e endereço do escritório
          </label>
          {podeEditar && (
            <div className="full" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn primary" type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Salvar modelo"}</button>
              {estado.erro && <span className="aviso erro">{estado.erro}</span>}
              {estado.ok && <span className="aviso ok">{estado.ok}</span>}
            </div>
          )}
        </form>

        <div className="card">
          <div className="ctitle"><h3>Marcadores</h3><span className="tag">clique para inserir</span></div>
          {GRUPOS.map((g) => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div className="dayhead" style={{ margin: "0 0 6px" }}>{g}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {MARCADORES.filter((m) => m.grupo === g).map((m) => (
                  <button key={m.marcador} type="button" className="marcador" onClick={() => inserir(m.marcador)} disabled={!podeEditar} title="Inserir no texto">
                    <code>{m.marcador}</code>
                    <span>{m.ajuda}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 80 }}>
        <div className="aviso info">
          Prévia com uma cliente de exemplo.{" "}
          {perguntas.length > 0 ? (
            <>Na hora de gerar, o CRM vai perguntar: <b>{perguntas.map((p) => p.rotulo).join(" · ")}</b>.</>
          ) : (
            "Este modelo não faz perguntas: tudo vem do cadastro."
          )}
        </div>
        <FolhaPrevia blocos={blocos} escritorio={escritorio} comRodape={comRodape} />
      </div>
    </div>
  );
}
