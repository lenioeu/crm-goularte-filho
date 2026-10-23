"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/Icone";

type Tema = "auto" | "claro" | "escuro";

function aplicar(t: Tema) {
  if (t === "auto") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
  try {
    localStorage.setItem("tema", t);
  } catch {}
}
function lido(): Tema {
  try {
    const t = localStorage.getItem("tema");
    return t === "claro" || t === "escuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

/** Escolha completa (Meu perfil): automático, claro ou escuro. */
export function EscolherTema() {
  const [tema, setTema] = useState<Tema>("auto");
  useEffect(() => setTema(lido()), []);
  const opcoes: [Tema, string, "automatico" | "sol" | "lua"][] = [["auto", "Automático (segue o aparelho)", "automatico"], ["claro", "Claro", "sol"], ["escuro", "Escuro", "lua"]];
  return (
    <div className="tema-opcoes" role="radiogroup" aria-label="Aparência">
      {opcoes.map(([v, r, ic]) => (
        <button key={v} type="button" role="radio" aria-checked={tema === v} className={"btn" + (tema === v ? " ativo" : "")} onClick={() => { aplicar(v); setTema(v); }}>
          <Icone nome={ic} tamanho={16} /> {r}
        </button>
      ))}
    </div>
  );
}

/** Botão do topo: alterna entre claro e escuro. */
export function BotaoTema() {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => {
    const t = lido();
    setEscuro(t === "escuro" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  }, []);
  return (
    <button
      type="button"
      className="hbtn"
      onClick={() => { aplicar(escuro ? "claro" : "escuro"); setEscuro(!escuro); }}
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
    >
      <Icone nome={escuro ? "sol" : "lua"} tamanho={20} />
    </button>
  );
}
