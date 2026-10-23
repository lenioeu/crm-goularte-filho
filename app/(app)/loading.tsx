// Aparece na hora em que se clica num item do menu, enquanto a página nova carrega.
export default function Carregando() {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <span className="giro" aria-hidden="true" />
      Carregando…
    </div>
  );
}
