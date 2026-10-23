"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { Icone } from "@/components/Icone";

// Avisos no canto da tela (como o "Mensagem arquivada · Desfazer" do Gmail).
type Aviso = { id: number; texto: string; tipo: "ok" | "erro"; desfazer?: () => Promise<Resultado> };
type Mostrar = (texto: string, opcoes?: { tipo?: "ok" | "erro"; desfazer?: () => Promise<Resultado> }) => void;

const Contexto = createContext<Mostrar | null>(null);

/** null fora do sistema (ex.: tela de login): aí os componentes mostram o resultado ao lado do botão. */
export const useAviso = () => useContext(Contexto);

export function ProvedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximo = useRef(1);

  const fechar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const mostrar = useCallback<Mostrar>((texto, opcoes) => {
    const id = proximo.current++;
    setAvisos((a) => [...a.slice(-2), { id, texto, tipo: opcoes?.tipo ?? "ok", desfazer: opcoes?.desfazer }]);
  }, []);

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => <Torrada key={a.id} aviso={a} fechar={() => fechar(a.id)} mostrar={mostrar} />)}
      </div>
    </Contexto.Provider>
  );
}

function Torrada({ aviso, fechar, mostrar }: { aviso: Aviso; fechar: () => void; mostrar: Mostrar }) {
  const [desfazendo, setDesfazendo] = useState(false);
  const [parado, setParado] = useState(false);

  useEffect(() => {
    if (parado) return;
    const t = setTimeout(fechar, aviso.desfazer ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [aviso.desfazer, fechar, parado]);

  async function desfazer() {
    if (!aviso.desfazer) return;
    setDesfazendo(true);
    const r = await aviso.desfazer();
    fechar();
    mostrar(r.erro ?? "Desfeito.", { tipo: r.erro ? "erro" : "ok" });
  }

  return (
    <div className={`torrada ${aviso.tipo}`} onMouseEnter={() => setParado(true)} onMouseLeave={() => setParado(false)}>
      <span>{aviso.texto}</span>
      {aviso.desfazer && (
        <button type="button" className="torrada-acao" onClick={desfazer} disabled={desfazendo}>
          {desfazendo ? "Desfazendo…" : "Desfazer"}
        </button>
      )}
      <button type="button" className="torrada-fechar" onClick={fechar} aria-label="Fechar aviso"><Icone nome="fechar" tamanho={16} /></button>
    </div>
  );
}
