"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { cadastrarComoCliente, voltarAContato } from "@/app/(app)/clientes/actions";
import { useAviso } from "@/components/Avisos";
import { CampoCpf } from "@/components/CampoCpf";
import { CampoEndereco } from "@/components/CampoEndereco";
import { Icone } from "@/components/Icone";

type Contato = { id: string; nome: string; cpf_cnpj: string | null; email: string | null; area_id: string | null; origem: string | null; cep: string | null; endereco: string | null };

// "Tornar cliente" na conversa: abre o cadastro do contato para completar e salva já como cliente.
export function CadastrarCliente({ contato, areas }: { contato: Contato; areas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, pendente] = useActionState(cadastrarComoCliente, { erro: null, ok: null });

  useEffect(() => {
    if (!estado.ok) return;
    setAberto(false);
    if (aviso) aviso(estado.ok, { desfazer: () => voltarAContato(contato.id) });
    router.refresh();
  }, [estado, aviso, contato.id, router]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  // Nome que veio do WhatsApp só com números não serve de sugestão
  const nomeInicial = /^\d+$/.test(contato.nome) ? "" : contato.nome;

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setAberto(true)}>
        <Icone nome="usuario" tamanho={15} /> Tornar cliente
      </button>
      {aberto && (
        <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-label="Cadastrar como cliente">
            <div className="ctitle">
              <h3>Cadastrar como cliente</h3>
              <button type="button" className="hbtn-claro" onClick={() => setAberto(false)} aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13.5 }}>
              Só o nome é obrigatório; o resto dá para completar depois na ficha. O WhatsApp e a conversa continuam ligados.
            </p>
            <form action={enviar} className="form maiusculas">
              <input type="hidden" name="id" value={contato.id} />
              <div className="field full"><label htmlFor="cc_nome">Nome completo</label><input id="cc_nome" name="nome" required defaultValue={nomeInicial} placeholder="ex.: MARIA DA SILVA SANTOS" autoFocus /></div>
              <div className="field"><label htmlFor="cc_cpf">CPF ou CNPJ</label><CampoCpf id="cc_cpf" defaultValue={contato.cpf_cnpj} /></div>
              <div className="field"><label htmlFor="cc_email">E-mail</label><input id="cc_email" name="email" type="email" defaultValue={contato.email ?? ""} /></div>
              <div className="field">
                <label htmlFor="cc_area">Área</label>
                <select id="cc_area" name="area_id" defaultValue={contato.area_id ?? ""}>
                  <option value="">A definir</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="cc_origem">Como chegou ao escritório</label><input id="cc_origem" name="origem" defaultValue={contato.origem ?? ""} placeholder="ex.: indicação, Instagram" /></div>
              <div className="field full"><CampoEndereco cepInicial={contato.cep} enderecoInicial={contato.endereco} /></div>
              <div className="full" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="submit" className="btn primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar e tornar cliente"}</button>
                <button type="button" className="btn" onClick={() => setAberto(false)}>Cancelar</button>
                {estado.erro && <span className="aviso erro">{estado.erro}</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
