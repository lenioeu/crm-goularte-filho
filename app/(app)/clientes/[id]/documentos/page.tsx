import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { FormAcao } from "@/components/FormAcao";
import { FolhaPrevia } from "@/components/FolhaPrevia";
import { advogadosDaEquipe, carregarCliente, dadosDoEscritorio, escolherAdvogados, listarModelos } from "@/lib/documentos";
import { camposDoModelo, faltando, renderizar, usaAdvogados } from "@/lib/modelos";
import { quemSou } from "@/lib/permissoes";
import { TZ } from "@/lib/rotulos";
import { enviarDocumentoWhatsApp, gerarDocumento, salvarEscritorio } from "./actions";

type Busca = Record<string, string | string[] | undefined>;
const um = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) ?? "";

export default async function Documentos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Busca> }) {
  const { id } = await params;
  const q = await searchParams;
  const conversa = /^[0-9a-f-]{36}$/.test(um(q.conversa)) ? um(q.conversa) : "";
  const extraUrl = conversa ? `&conversa=${conversa}` : "";
  const { supabase, papel } = await quemSou();
  const [{ cliente, erro }, equipe, escritorio, { modelos }] = await Promise.all([
    carregarCliente(supabase, id),
    advogadosDaEquipe(supabase),
    dadosDoEscritorio(supabase),
    listarModelos(supabase),
  ]);
  if (!cliente && !erro) notFound();
  const modelo = modelos.find((m) => m.id === um(q.modelo)) ?? modelos[0];
  const campos = camposDoModelo(modelo.conteudo);

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const data = /^\d{4}-\d{2}-\d{2}$/.test(um(q.data)) ? um(q.data) : hoje;
  const idsAdv = q.advogado === undefined ? equipe.slice(0, 1).map((p) => p.id) : ([] as string[]).concat(q.advogado);
  const extra = Object.fromEntries(campos.map((c) => [c.chave, q[`campo_${c.chave}`] !== undefined ? um(q[`campo_${c.chave}`]) : c.padrao]));
  const blocos = cliente ? renderizar(modelo.conteudo, { cliente, advogados: escolherAdvogados(equipe, idsAdv), escritorio, data, extra }) : [];
  const faltam = cliente ? faltando(cliente) : [];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          {conversa ? (
            <Link href={`/atendimento?c=${conversa}`} style={{ color: "var(--accent)", fontSize: 13 }}>‹ Voltar para a conversa</Link>
          ) : (
            <Link href={`/clientes/${id}`} style={{ color: "var(--accent)", fontSize: 13 }}>‹ {cliente?.nome ?? "Cliente"}</Link>
          )}
          <h1 style={{ marginTop: 4 }}>Documentos</h1>
          <p>
            Modelos do escritório preenchidos com os dados do cliente. Salve no Drive para revisar no Google Docs ou imprima direto. Para mudar o
            texto, use a aba <Link href="/modelos" style={{ color: "var(--accent)" }}>Modelos</Link>.
          </p>
        </div>
      </div>

      {erro && <div className="aviso erro" style={{ marginBottom: 16 }}>{erro}</div>}

      <div className="filtros">
        {modelos.map((m) => (
          <Link key={m.id} className={"fp" + (m.id === modelo.id ? " on" : "")} href={`/clientes/${id}/documentos?modelo=${m.id}${extraUrl}`}>{m.nome}</Link>
        ))}
      </div>

      <div className="grid cols-2e">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="ctitle"><h3>{modelo.nome}</h3></div>
            {modelo.descricao && <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>{modelo.descricao}</p>}
            {faltam.length > 0 && (
              <div className="aviso info" style={{ marginBottom: 12 }}>
                Faltam no cadastro: <b>{faltam.join(", ")}</b>. Saem como “______”.{" "}
                <Link href={`/clientes/${id}#qualificacao`} style={{ textDecoration: "underline" }}>Completar na ficha</Link>
              </div>
            )}
            <form method="get" className="form">
              <input type="hidden" name="modelo" value={modelo.id} />
              {conversa && <input type="hidden" name="conversa" value={conversa} />}
              {campos.map((c) => (
                <div className="field full" key={c.chave}>
                  <label htmlFor={`campo_${c.chave}`}>{c.rotulo.charAt(0).toUpperCase() + c.rotulo.slice(1)}</label>
                  <textarea id={`campo_${c.chave}`} name={`campo_${c.chave}`} rows={2} defaultValue={extra[c.chave]} />
                </div>
              ))}
              {usaAdvogados(modelo.conteudo) && (
                <div className="field full">
                  <label>Advogado(s)</label>
                  {equipe.length === 0 ? (
                    <small style={{ color: "var(--muted)" }}>Ninguém da equipe tem OAB cadastrada em Meu perfil; sai o advogado padrão do escritório.</small>
                  ) : (
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {equipe.map((p) => (
                        <label key={p.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
                          <input type="checkbox" name="advogado" value={p.id} defaultChecked={idsAdv.includes(p.id)} style={{ width: 16, height: 16 }} />
                          {p.nome} <span style={{ color: "var(--muted)" }}>({p.oab})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="field"><label htmlFor="data">Data do documento</label><input id="data" name="data" type="date" defaultValue={data} /></div>
              <div className="field" style={{ justifyContent: "end" }}><button className="btn" type="submit">Atualizar prévia</button></div>
            </form>
          </div>

          {cliente && (
            <div className="card">
              <div className="ctitle"><h3>Salvar</h3></div>
              <FormAcao action={gerarDocumento} botao="Salvar no Drive (Google Docs)" limparAoSalvar={false}>
                <input type="hidden" name="cliente_id" value={id} />
                <input type="hidden" name="modelo" value={modelo.id} />
                <input type="hidden" name="data" value={data} />
                {idsAdv.map((a) => <input key={a} type="hidden" name="advogado" value={a} />)}
                {campos.map((c) => <input key={c.chave} type="hidden" name={`campo_${c.chave}`} value={extra[c.chave]} />)}
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--muted)", gridColumn: "1 / -1" }}>
                  Salva o que está na prévia. Se mudou algum campo, clique em “Atualizar prévia” antes.
                </p>
              </FormAcao>
              <div style={{ marginTop: 10 }}><BotaoImprimir /></div>
            </div>
          )}

          {cliente && conversa && (
            <div className="card">
              <div className="ctitle"><h3>Mandar para o cliente assinar</h3></div>
              <FormAcao action={enviarDocumentoWhatsApp} botao="Enviar pelo WhatsApp (PDF)" className="form" limparAoSalvar={false}>
                <input type="hidden" name="cliente_id" value={id} />
                <input type="hidden" name="modelo" value={modelo.id} />
                <input type="hidden" name="data" value={data} />
                {idsAdv.map((a) => <input key={a} type="hidden" name="advogado" value={a} />)}
                {campos.map((c) => <input key={c.chave} type="hidden" name={`campo_${c.chave}`} value={extra[c.chave]} />)}
                <div className="field full">
                  <label htmlFor="legenda">Mensagem junto com o arquivo</label>
                  <textarea id="legenda" name="legenda" rows={2} defaultValue={`Segue o documento para assinatura. Qualquer dúvida, é só chamar por aqui.`} />
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", gridColumn: "1 / -1" }}>
                  Manda o que está na prévia, em PDF, e guarda uma cópia na pasta do cliente. Confira a prévia antes.
                </p>
              </FormAcao>
            </div>
          )}

          {papel === "administrador" && (
            <details className="card">
              <summary style={{ cursor: "pointer", fontWeight: 500 }}>Dados do escritório nos documentos</summary>
              <FormAcao action={salvarEscritorio} botao="Salvar dados do escritório" className="form" limparAoSalvar={false}>
                <div className="field full"><label htmlFor="endereco">Endereço profissional</label><input id="endereco" name="endereco" defaultValue={escritorio.endereco} /></div>
                <div className="field"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" defaultValue={escritorio.telefone} /></div>
                <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" defaultValue={escritorio.email} /></div>
                <div className="field"><label htmlFor="cidade">Cidade da assinatura</label><input id="cidade" name="cidade" defaultValue={escritorio.cidade} /></div>
                <div className="field"><label htmlFor="foro">Foro do contrato</label><input id="foro" name="foro" defaultValue={escritorio.foro} /></div>
                <div className="field full">
                  <label htmlFor="pagamento">Conta para pagamento (contrato)</label>
                  <textarea id="pagamento" name="pagamento" rows={3} defaultValue={escritorio.pagamento} placeholder="Banco, agência, conta, titular e PIX" />
                  <small style={{ color: "var(--dim)", fontSize: 12 }}>Fica só no banco de dados do CRM, não no código. Em branco, o contrato diz “na conta indicada pelo CONTRATADO”.</small>
                </div>
              </FormAcao>
            </details>
          )}
        </div>

        <FolhaPrevia blocos={blocos} escritorio={escritorio} />
      </div>
    </div>
  );
}
