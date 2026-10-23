"use client";

// Abre a janela de impressão do navegador (também serve para "Salvar como PDF").
export function BotaoImprimir({ rotulo = "Imprimir ou salvar PDF" }: { rotulo?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      {rotulo}
    </button>
  );
}
