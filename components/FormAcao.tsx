"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Resultado } from "@/app/(app)/actions";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;

// Formulário que chama uma ação do servidor e mostra o resultado logo abaixo.
export function FormAcao({
  action,
  children,
  botao,
  className,
  limparAoSalvar = true,
}: {
  action: Acao;
  children: React.ReactNode;
  botao: string;
  className?: string;
  limparAoSalvar?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(action, { erro: null, ok: null });
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok && limparAoSalvar) ref.current?.reset();
  }, [estado, limparAoSalvar]);

  return (
    <form ref={ref} action={enviar} className={className}>
      {children}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", gridColumn: "1 / -1" }}>
        <button className="btn primary" type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : botao}
        </button>
        {estado.erro && <span className="aviso erro">{estado.erro}</span>}
        {estado.ok && <span className="aviso ok">{estado.ok}</span>}
      </div>
    </form>
  );
}
