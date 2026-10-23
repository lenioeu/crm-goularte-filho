import { type Bloco, type EscritorioDoc, rodape, trechos } from "@/lib/modelos";

// Prévia do documento com cara de folha. Usada na tela de Documentos e no editor de Modelos.
function Texto({ texto }: { texto: string }) {
  return <>{trechos(texto).map((t, i) => (t.negrito ? <b key={i}>{t.texto}</b> : <span key={i}>{t.texto}</span>))}</>;
}

export function FolhaPrevia({ blocos, escritorio, comRodape = true }: { blocos: Bloco[]; escritorio: EscritorioDoc; comRodape?: boolean }) {
  return (
    <div className="card folha" aria-label="Prévia do documento">
      {blocos.map((b, i) =>
        b.t === "assinaturas" ? (
          <div key={i} className="folha-ass">
            {b.nomes.map((n, j) => (
              <div key={j}>
                <div className="linha" />
                <b>{n.nome}</b>
                {n.linhas.map((l) => <div key={l}>{l}</div>)}
              </div>
            ))}
          </div>
        ) : (
          <p key={i} className={`folha-${b.t}`}><Texto texto={b.texto} /></p>
        ),
      )}
      {comRodape && <p className="folha-rodape">{rodape(escritorio)}</p>}
    </div>
  );
}
