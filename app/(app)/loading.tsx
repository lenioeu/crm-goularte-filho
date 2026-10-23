// Aparece na hora do clique, enquanto a página nova carrega: o contorno da página em cinza
// (título, cartões e linhas), para a pessoa ver que já está vindo.
export default function Carregando() {
  return (
    <div className="view esqueleto" role="status" aria-live="polite" aria-label="Carregando">
      <div className="esq esq-titulo" />
      <div className="esq esq-subtitulo" />
      <div className="esq-cartoes">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card esq-cartao">
            <div className="esq esq-linha curta" />
            <div className="esq esq-numero" />
          </div>
        ))}
      </div>
      <div className="card">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="esq-item">
            <div className="esq esq-bola" />
            <div style={{ flex: 1 }}>
              <div className="esq esq-linha" style={{ width: `${60 - i * 5}%` }} />
              <div className="esq esq-linha curta" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
