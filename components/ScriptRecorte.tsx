"use client";

import { useState } from "react";

// Caixa com o script do Gmail e botão de copiar (Integrações › Recorte Digital).
export function ScriptRecorte({ script }: { script: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="script-recorte">
      <button
        type="button"
        className="btn primary"
        onClick={async () => {
          await navigator.clipboard.writeText(script);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        }}
      >
        {copiado ? "Copiado ✓" : "Copiar o script"}
      </button>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>Ver o script</summary>
        <pre>{script}</pre>
      </details>
    </div>
  );
}
