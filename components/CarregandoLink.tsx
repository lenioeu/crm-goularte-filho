"use client";

import { useLinkStatus } from "next/link";

// Rodinha que aparece dentro de um <Link> enquanto a página dele carrega.
export function CarregandoLink() {
  const { pending } = useLinkStatus();
  return pending ? <span className="girando" role="status" aria-label="Carregando" /> : null;
}
