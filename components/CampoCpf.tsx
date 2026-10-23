"use client";

import { useState } from "react";

/** 000.000.000-00 (até 11 dígitos) ou 00.000.000/0000-00 (CNPJ). */
export function formatarCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

// Campo de CPF/CNPJ que se formata enquanto a pessoa digita.
export function CampoCpf({ id = "cpf", name = "cpf", defaultValue = "" }: { id?: string; name?: string; defaultValue?: string | null }) {
  const [valor, setValor] = useState(formatarCpfCnpj(defaultValue ?? ""));
  return (
    <input
      id={id}
      name={name}
      inputMode="numeric"
      autoComplete="off"
      placeholder="000.000.000-00"
      value={valor}
      onChange={(e) => setValor(formatarCpfCnpj(e.target.value))}
      maxLength={18}
    />
  );
}
