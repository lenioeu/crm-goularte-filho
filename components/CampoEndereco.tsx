"use client";

import { useRef, useState } from "react";

const formatarCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

type Partes = { rua: string; numero: string; complemento: string; bairro: string; cidade: string };

// CEP que busca o endereço sozinho (ViaCEP, gratuito); a pessoa só completa número e complemento.
// Grava tudo junto no campo "endereco", no formato "RUA, Nº, COMPLEMENTO, BAIRRO, CIDADE-UF".
export function CampoEndereco({ cepInicial, enderecoInicial }: { cepInicial: string | null; enderecoInicial: string | null }) {
  const [cep, setCep] = useState(formatarCep(cepInicial ?? ""));
  const [partes, setPartes] = useState<Partes | null>(null);
  const [livre, setLivre] = useState(enderecoInicial ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const numero = useRef<HTMLInputElement>(null);

  async function buscar(valor: string) {
    const d = valor.replace(/\D/g, "");
    if (d.length !== 8) return;
    setBuscando(true);
    setAviso(null);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) {
        setAviso("CEP não encontrado. Confira o número ou escreva o endereço à mão.");
        return;
      }
      setPartes({ rua: j.logradouro ?? "", numero: "", complemento: "", bairro: j.bairro ?? "", cidade: j.localidade ? `${j.localidade}-${j.uf}` : "" });
      setTimeout(() => numero.current?.focus(), 50);
    } catch {
      setAviso("Não consegui buscar o CEP agora. Escreva o endereço à mão.");
    } finally {
      setBuscando(false);
    }
  }

  const composto = partes ? [partes.rua, partes.numero, partes.complemento, partes.bairro, partes.cidade].map((x) => x.trim()).filter(Boolean).join(", ") : livre;
  const mudar = (k: keyof Partes, v: string) => setPartes((p) => (p ? { ...p, [k]: v } : p));

  return (
    <>
      <input type="hidden" name="endereco" value={composto} />
      <div className="field">
        <label htmlFor="cep">CEP</label>
        <input
          id="cep"
          name="cep"
          inputMode="numeric"
          placeholder="00000-000"
          value={cep}
          onChange={(e) => {
            const v = formatarCep(e.target.value);
            setCep(v);
            if (v.replace(/\D/g, "").length === 8) buscar(v);
          }}
        />
        <small className="dica">{buscando ? "Buscando o endereço…" : aviso ?? "Digite o CEP e o endereço vem sozinho."}</small>
      </div>
      {partes ? (
        <>
          <div className="field full"><label htmlFor="rua">Rua</label><input id="rua" value={partes.rua} onChange={(e) => mudar("rua", e.target.value)} /></div>
          <div className="field"><label htmlFor="numero">Número</label><input id="numero" ref={numero} value={partes.numero} onChange={(e) => mudar("numero", e.target.value)} placeholder="ex.: 100 ou S/N" /></div>
          <div className="field"><label htmlFor="complemento">Complemento</label><input id="complemento" value={partes.complemento} onChange={(e) => mudar("complemento", e.target.value)} placeholder="ex.: apto 201, casa 2, bloco B" /></div>
          <div className="field"><label htmlFor="bairro">Bairro</label><input id="bairro" value={partes.bairro} onChange={(e) => mudar("bairro", e.target.value)} /></div>
          <div className="field"><label htmlFor="cidade">Cidade-UF</label><input id="cidade" value={partes.cidade} onChange={(e) => mudar("cidade", e.target.value)} /></div>
        </>
      ) : (
        <div className="field full">
          <label htmlFor="endereco_livre">Endereço</label>
          <input id="endereco_livre" value={livre} onChange={(e) => setLivre(e.target.value)} placeholder="ex.: Rua das Flores, 100, apto 201, Centro, Vitória-ES" />
        </div>
      )}
    </>
  );
}
