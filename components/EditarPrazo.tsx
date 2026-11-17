"use client";

import { useEffect, useState } from "react";
import { editarPrazo } from "@/app/(app)/prazos/actions";
import { FormPrazo, type PrazoInicial } from "@/components/FormPrazo";
import { Icone } from "@/components/Icone";

// "Editar" de um prazo: abre o formulário numa janela, com a conta refeita ao salvar.
export function EditarPrazo({ prazo, pessoas, feriados, titulo }: { prazo: PrazoInicial; pessoas: { id: string; nome: string }[]; feriados: string[]; titulo: string }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);
  return (
    <>
      <button type="button" className="linkbtn editar" onClick={() => setAberto(true)}>Editar</button>
      {aberto && (
        <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-label="Editar prazo">
            <div className="ctitle">
              <h3>Editar prazo</h3>
              <button type="button" className="hbtn-claro" onClick={() => setAberto(false)} aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13.5 }}>{titulo}</p>
            <FormPrazo action={editarPrazo} inicial={prazo} pessoas={pessoas} feriados={feriados} botao="Salvar alterações" aoSalvar={() => setAberto(false)} />
          </div>
        </div>
      )}
    </>
  );
}
