"use client";

import { useState } from "react";

// Texto da publicação: começo à mostra, o resto ao clicar (as decisões podem ser longas).
export function TextoPublicacao({ texto }: { texto: string }) {
  const [tudo, setTudo] = useState(false);
  const longo = texto.length > 520;
  return (
    <div className="pub-texto">
      {tudo || !longo ? texto : `${texto.slice(0, 520).trimEnd()}…`}
      {longo && (
        <button type="button" className="linkbtn" onClick={() => setTudo((v) => !v)}>
          {tudo ? "Mostrar menos" : "Ver texto completo"}
        </button>
      )}
    </div>
  );
}
