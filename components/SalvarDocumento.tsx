"use client";

import { useActionState } from "react";
import type { Resultado } from "@/app/(app)/actions";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;

const TIPOS = ["RG", "CPF", "CNH", "COMPROVANTE DE RESIDÊNCIA", "CTPS", "HOLERITE", "TRCT", "EXTRATO FGTS", "CNIS", "LAUDO MÉDICO", "CONTRATO", "PROCURAÇÃO", "CERTIDÃO", "BOLETIM DE OCORRÊNCIA"];

// "Salvar na pasta do cliente": pede o tipo do documento para montar o nome do arquivo.
export function SalvarDocumento({ action, mensagemId }: { action: Acao; mensagemId: string }) {
  const [estado, enviar, pendente] = useActionState(action, { erro: null, ok: null });
  if (estado.ok) return <span className="doc-ok">{estado.ok}</span>;
  return (
    <form action={enviar} className="salvar-doc">
      <input type="hidden" name="mensagem_id" value={mensagemId} />
      <input name="tipo" list={`tipos-${mensagemId}`} placeholder="Que documento é?" required aria-label="Tipo do documento" />
      <datalist id={`tipos-${mensagemId}`}>{TIPOS.map((t) => <option key={t} value={t} />)}</datalist>
      <button className="btn sm" type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Salvar na pasta"}</button>
      {estado.erro && <span className="doc-erro">{estado.erro}</span>}
    </form>
  );
}
