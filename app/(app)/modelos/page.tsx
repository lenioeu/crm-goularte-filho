import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { listarModelos } from "@/lib/documentos";
import { camposDoModelo } from "@/lib/modelos";
import { quemSou } from "@/lib/permissoes";
import { duplicarModelo, excluirModelo, importarPadroes } from "./actions";

export default async function Modelos() {
  const { supabase, papel } = await quemSou();
  const podeEditar = papel === "administrador" || papel === "advogado";
  const { data, error } = await supabase.from("modelos").select("id").limit(1);
  const semTabela = Boolean(error);
  const vazia = !error && (data ?? []).length === 0;
  const { modelos } = await listarModelos(supabase);

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Modelos</h1>
          <p>
            Os textos que viram documentos para o cliente assinar (procuração, contrato, declarações). Escreva com marcadores como{" "}
            <code>{"{{QUALIFICACAO}}"}</code> e o CRM preenche com os dados de cada cliente, na ficha › Documentos.
          </p>
        </div>
        {podeEditar && !semTabela && !vazia && (
          <div style={{ marginLeft: "auto" }}><Link className="btn primary" href="/modelos/novo">+ Novo modelo</Link></div>
        )}
      </div>

      {semTabela && (
        <div className="aviso info" style={{ marginBottom: 16 }}>
          Para criar e editar modelos, falta rodar o script <b>supabase/005_modelos_editaveis.sql</b> no Supabase. Até lá, os documentos usam os
          quatro modelos abaixo, que já vêm prontos.
        </div>
      )}
      {vazia && (
        <div className="card" style={{ marginBottom: 16, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <b style={{ fontWeight: 500 }}>Comece pelos modelos do escritório</b>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Traz para cá a procuração, a declaração de hipossuficiência, o contrato de honorários e o termo de renúncia, com o texto que vocês
              já usavam, para editar à vontade. Ou crie um do zero.
            </p>
          </div>
          {podeEditar && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <BotaoAcao acao={importarPadroes} rotulo="Trazer os modelos do escritório" className="btn primary" />
              <Link className="btn" href="/modelos/novo">Criar do zero</Link>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: "6px 6px 2px" }}>
        <div className="list">
          {modelos.map((m) => {
            const perguntas = camposDoModelo(m.conteudo);
            return (
              <div className="li" key={m.id} style={{ padding: "12px" }}>
                <div className="bd">
                  {m.padrao ? <b>{m.nome}</b> : <Link href={`/modelos/${m.id}`}><b>{m.nome}</b></Link>}
                  <small>
                    {[m.descricao, `arquivo: “AAAA-MM-DD ${m.arquivo} - NOME”`, perguntas.length ? `pergunta: ${perguntas.map((p) => p.rotulo).join(", ")}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                {m.padrao ? (
                  <span className="chip">de fábrica</span>
                ) : (
                  podeEditar && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link className="btn sm" href={`/modelos/${m.id}`}>Editar</Link>
                      <BotaoAcao acao={duplicarModelo.bind(null, m.id)} rotulo="Duplicar" />
                      <BotaoAcao acao={excluirModelo.bind(null, m.id)} rotulo="Excluir" className="btn sm perigo" confirmar={`Excluir o modelo “${m.nome}”? Os documentos já salvos no Drive não são afetados.`} />
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
