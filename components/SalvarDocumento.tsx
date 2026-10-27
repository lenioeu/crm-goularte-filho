"use client";

import { useActionState, useState } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { TIPO_OUTRO, TIPOS_DOCUMENTO as TIPOS } from "@/lib/rotulos";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;

// "Salvar na pasta do cliente": escolhe o tipo do documento (monta o nome) ou "Outro" para dar o nome livre.
export function SalvarDocumento({ action, mensagemId, nomeOriginal }: { action: Acao; mensagemId: string; nomeOriginal?: string | null }) {
  const [estado, enviar, pendente] = useActionState(action, { erro: null, ok: null });
  const [tipo, setTipo] = useState("");
  if (estado.ok) return <span className="doc-ok">{estado.ok}</span>;
  return (
    <form action={enviar} className="salvar-doc">
      <input type="hidden" name="mensagem_id" value={mensagemId} />
      <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} required aria-label="Tipo do documento">
        <option value="" disabled>Que documento é?</option>
        {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        <option value={TIPO_OUTRO}>Outro (escrever o nome)</option>
      </select>
      {tipo === TIPO_OUTRO && (
        <input
          name="nome_livre"
          required
          autoFocus
          defaultValue={nomeOriginal?.replace(/\.[^.]+$/, "") ?? ""}
          placeholder="Nome do arquivo no Drive"
          aria-label="Nome do arquivo"
        />
      )}
      <button className="btn sm" type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Salvar na pasta"}</button>
      {estado.erro && <span className="doc-erro">{estado.erro}</span>}
    </form>
  );
}
