"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { useAviso } from "@/components/Avisos";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;

// Formulário que chama uma ação do servidor e mostra o resultado logo abaixo.
export function FormAcao({
  action,
  children,
  botao,
  className,
  limparAoSalvar = true,
  okFixo = false,
}: {
  action: Acao;
  children: React.ReactNode;
  botao: string;
  className?: string;
  limparAoSalvar?: boolean;
  /** Mostra o "ok" ao lado do botão, e não num aviso que some (ex.: senha provisória). */
  okFixo?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(action, { erro: null, ok: null });
  const ref = useRef<HTMLFormElement>(null);

  const aviso = useAviso();
  const noCanto = Boolean(aviso) && !okFixo;

  useEffect(() => {
    if (estado.ok && limparAoSalvar) ref.current?.reset();
    if (estado.ok && noCanto) aviso!(estado.ok);
  }, [estado, limparAoSalvar, noCanto, aviso]);

  return (
    <form ref={ref} action={enviar} className={className}>
      {children}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", gridColumn: "1 / -1" }}>
        <button className="btn primary" type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : botao}
        </button>
        {estado.erro && <span className="aviso erro">{estado.erro}</span>}
        {estado.ok && !noCanto && <span className="aviso ok">{estado.ok}</span>}
      </div>
    </form>
  );
}
