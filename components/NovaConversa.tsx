"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { criarContato } from "@/app/(app)/atendimento/actions";
import { useBuscaClientes } from "@/components/useBuscaClientes";

// "+ Nova conversa": escolhe um cliente já cadastrado ou cadastra um número novo.
export function NovaConversa({ abrir = false }: { abrir?: boolean }) {
  const [aberto, setAberto] = useState(abrir);
  const [busca, setBusca] = useState("");
  const [estado, enviar, pendente] = useActionState<Resultado, FormData>(criarContato, { erro: null, ok: null });

  const { achados, buscando } = useBuscaClientes(busca);

  return (
    <div className="vincular" style={{ marginLeft: "auto" }}>
      <button type="button" className="btn primary" onClick={() => setAberto((v) => !v)}>{aberto ? "Fechar" : "+ Nova conversa"}</button>
      {aberto && (
        <div className="vincular-painel" style={{ width: 340 }}>
          <input autoFocus placeholder="Procurar cliente pelo nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar cliente" />
          {achados.map((c) => (
            <Link key={c.id} className="vincular-item" href={`/atendimento?cliente=${c.id}`} onClick={() => setAberto(false)}>
              {c.nome}
              <small>{c.telefone_whatsapp ? ` · ${c.telefone_whatsapp}` : " · sem WhatsApp na ficha"}</small>
            </Link>
          ))}
          {busca.trim().length >= 2 && achados.length === 0 && <div className="vincular-vazio">{buscando ? <><span className="girando" aria-hidden="true" /> Procurando…</> : "Nenhum cliente com esse nome."}</div>}
          <form action={enviar} className="nova-contato maiusculas">
            <div className="vincular-vazio" style={{ padding: "8px 2px 2px", fontWeight: 500, color: "var(--fg)" }}>Ou um número novo</div>
            <input name="nome" placeholder="Nome" required />
            <input name="telefone" placeholder="WhatsApp com DDD" inputMode="tel" required />
            <button className="btn sm" type="submit" disabled={pendente}>{pendente ? "Aguarde…" : "Cadastrar e abrir conversa"}</button>
            {estado.erro && <span className="doc-erro">{estado.erro}</span>}
          </form>
        </div>
      )}
    </div>
  );
}
