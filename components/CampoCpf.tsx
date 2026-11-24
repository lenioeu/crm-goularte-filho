"use client";

import { useRef, useState } from "react";

/** 000.000.000-00 (até 11 dígitos) ou 00.000.000/0000-00 (CNPJ). */
export function formatarCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Confere os dois dígitos verificadores do CNPJ. */
export function cnpjValido(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, c, i) => s + Number(c) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

/** O que a Receita devolve (pela BrasilAPI) e que o formulário aproveita. */
export type DadosCnpj = {
  razao: string;
  fantasia: string | null;
  situacao: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string; // "VITÓRIA-ES"
};

type RespostaBrasilApi = {
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  email?: string | null;
  ddd_telefone_1?: string;
  cep?: string;
  descricao_tipo_de_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
};

/** Consulta pública e gratuita da Receita Federal pela BrasilAPI (direto do navegador). */
export async function buscarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj.replace(/\D/g, "")}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`consulta respondeu ${r.status}`);
  const j = (await r.json()) as RespostaBrasilApi;
  const tel = (j.ddd_telefone_1 ?? "").replace(/\D/g, "");
  const tipo = (j.descricao_tipo_de_logradouro ?? "").trim();
  const logradouro = (j.logradouro ?? "").trim();
  return {
    razao: (j.razao_social ?? "").trim(),
    fantasia: j.nome_fantasia?.trim() || null,
    situacao: j.descricao_situacao_cadastral?.trim() || null,
    email: j.email?.trim().toLowerCase() || null,
    telefone: tel.length >= 10 ? tel : null,
    cep: j.cep ? j.cep.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2") : null,
    rua: [tipo && !logradouro.toUpperCase().startsWith(tipo.toUpperCase()) ? tipo : "", logradouro].filter(Boolean).join(" "),
    numero: (j.numero ?? "").trim(),
    complemento: (j.complemento ?? "").trim(),
    bairro: (j.bairro ?? "").trim(),
    cidade: j.municipio ? `${j.municipio}${j.uf ? `-${j.uf}` : ""}` : "",
  };
}

/** Preenche um campo do mesmo formulário só se ele estiver vazio (não apaga o que a pessoa já escreveu). */
function preencherSeVazio(form: HTMLFormElement, nome: string, valor: string | null) {
  const el = form.elements.namedItem(nome);
  if (!valor || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.value.trim()) return;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  setter?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Campo de CPF/CNPJ que se formata enquanto a pessoa digita. Com um CNPJ completo, busca a empresa na
// Receita e preenche nome, e-mail, telefone e endereço que estiverem em branco no mesmo formulário.
export function CampoCpf({ id = "cpf", name = "cpf", defaultValue = "" }: { id?: string; name?: string; defaultValue?: string | null }) {
  const [valor, setValor] = useState(formatarCpfCnpj(defaultValue ?? ""));
  const [dica, setDica] = useState<{ texto: string; tipo: "info" | "ok" | "erro" } | null>(null);
  const ultimo = useRef("");
  const ref = useRef<HTMLInputElement>(null);

  async function consultar(cnpj: string) {
    if (ultimo.current === cnpj) return;
    ultimo.current = cnpj;
    if (!cnpjValido(cnpj)) {
      setDica({ texto: "CNPJ inválido: confira os números.", tipo: "erro" });
      return;
    }
    setDica({ texto: "Buscando a empresa na Receita…", tipo: "info" });
    try {
      const d = await buscarCnpj(cnpj);
      if (!d) {
        setDica({ texto: "CNPJ não encontrado na Receita.", tipo: "erro" });
        return;
      }
      const form = ref.current?.form;
      if (form) {
        preencherSeVazio(form, "nome", d.razao.toUpperCase());
        preencherSeVazio(form, "email", d.email);
        preencherSeVazio(form, "telefone", d.telefone);
        form.dispatchEvent(new CustomEvent("orion:cnpj", { detail: d }));
      }
      const inativa = d.situacao && !/ativa/i.test(d.situacao);
      setDica({
        texto: `${d.razao}${d.fantasia ? ` (${d.fantasia})` : ""}${d.situacao ? ` · situação: ${d.situacao.toLowerCase()}` : ""}`,
        tipo: inativa ? "erro" : "ok",
      });
    } catch {
      setDica({ texto: "Não consegui consultar a Receita agora. Preencha à mão.", tipo: "erro" });
    }
  }

  return (
    <>
      <input
        ref={ref}
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        placeholder="CPF ou CNPJ"
        value={valor}
        onChange={(e) => {
          const v = formatarCpfCnpj(e.target.value);
          setValor(v);
          const d = v.replace(/\D/g, "");
          if (d.length === 14) consultar(d);
          else {
            ultimo.current = "";
            setDica(null);
          }
        }}
        maxLength={18}
      />
      {dica && <small className={"dica" + (dica.tipo === "erro" ? " dica-erro" : dica.tipo === "ok" ? " dica-ok" : "")} aria-live="polite">{dica.texto}</small>}
    </>
  );
}
