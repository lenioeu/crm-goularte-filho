"use client";

import { useEffect, useState } from "react";
import { procurarClientes } from "@/app/(app)/atendimento/actions";

export type ClienteAchado = { id: string; nome: string; cpf_cnpj: string | null; telefone_whatsapp: string | null };

/** Busca de clientes no servidor enquanto a pessoa digita (espera 250 ms entre as teclas). */
export function useBuscaClientes(busca: string) {
  const [achados, setAchados] = useState<ClienteAchado[]>([]);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setAchados([]);
      setBuscando(false);
      return;
    }
    let valido = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await procurarClientes(q).catch(() => []);
      if (!valido) return;
      setAchados(r);
      setBuscando(false);
    }, 250);
    return () => {
      valido = false;
      clearTimeout(t);
    };
  }, [busca]);
  return { achados, buscando };
}
