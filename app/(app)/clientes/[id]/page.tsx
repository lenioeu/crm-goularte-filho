import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAcao } from "@/components/FormAcao";
import { COLUNA_TAREFA, dataBR, dataHoraBR, ETAPA, telefoneBR, TIPO_AGENDAMENTO } from "@/lib/rotulos";
import { supabaseServer } from "@/lib/supabase/server";
import { atualizarCliente } from "../../actions";
import { criarPastaCliente } from "../../integracoes/actions";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: c } = await supabase
    .from("clientes")
    .select("id, nome, cpf_cnpj, telefone_whatsapp, email, origem, observacoes, pasta_drive_url, area_id, responsavel_id, criado_em, areas(nome, cor), perfis(nome)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const { data: casos } = await supabase
    .from("casos")
    .select("id, titulo, etapa, parte_contraria, sigiloso, motivo_nao_viavel, atualizado_em, perfis(nome), areas(nome, cor)")
    .eq("cliente_id", id)
    .order("atualizado_em", { ascending: false });
  const idsCasos = (casos ?? []).map((x) => x.id);
  const nenhum = ["00000000-0000-0000-0000-000000000000"];

  const [{ data: processos }, { data: audiencias }, { data: tarefas }, { data: agendadas }, { data: areas }, { data: pessoas }, { data: google }] =
    await Promise.all([
      supabase.from("processos").select("id, numero_cnj, tribunal, vara, ultima_movimentacao, ultima_movimentacao_em").in("caso_id", idsCasos.length ? idsCasos : nenhum),
      supabase.from("audiencias").select("id, tipo, inicio, local, modalidade").in("caso_id", idsCasos.length ? idsCasos : nenhum).order("inicio", { ascending: false }).limit(20),
      supabase.from("tarefas").select("id, titulo, coluna, vence_em").eq("cliente_id", id).neq("coluna", "concluida").order("vence_em", { nullsFirst: false }),
      supabase.from("mensagens_agendadas").select("id, tipo, texto, enviar_em").eq("cliente_id", id).eq("status", "programada").order("enviar_em"),
      supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
      supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("configuracoes").select("chave").in("chave", ["google_email", "pasta_clientes"]),
    ]);

  const area = um(c.areas as Rel<{ nome: string; cor: string }>);
  const resp = um(c.perfis as Rel<{ nome: string }>);
  const agora = Date.now();
  const proximas = (audiencias ?? []).filter((a) => new Date(a.inicio).getTime() >= agora).reverse();
  const passadas = (audiencias ?? []).filter((a) => new Date(a.inicio).getTime() < agora);
  const driveLigado = (google ?? []).length === 2;

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <Link href="/clientes" style={{ color: "var(--accent)", fontSize: 13 }}>‹ Clientes</Link>
          <h1 style={{ marginTop: 4 }}>{c.nome}</h1>
          <p style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {area && <span className="chip area" style={{ "--c": area.cor } as React.CSSProperties}>{area.nome}</span>}
            <span>WhatsApp {telefoneBR(c.telefone_whatsapp)}</span>
            {c.cpf_cnpj && <span>· {c.cpf_cnpj}</span>}
            {resp && <span>· Responsável: {resp.nome}</span>}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {c.pasta_drive_url ? (
            <a className="btn" href={c.pasta_drive_url} target="_blank" rel="noopener">Abrir pasta no Drive</a>
          ) : driveLigado ? (
            <BotaoAcao acao={criarPastaCliente.bind(null, c.id)} rotulo="Criar pasta no Drive" className="btn" />
          ) : null}
          <Link className="btn primary" href={`/agendamentos?cliente=${c.id}`}>Agendar mensagem</Link>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="ctitle"><h3>Casos</h3><Link href="/funil" className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>Funil</Link></div>
          {(casos ?? []).length === 0 ? (
            <div className="vazio"><b>Nenhum caso</b>Crie pelo Funil de casos, escolhendo este cliente.</div>
          ) : (
            <div className="list">
              {(casos ?? []).map((k) => (
                <div className="li" key={k.id}>
                  <div className="bd">
                    <b>{k.titulo}</b>
                    <small>
                      {[k.parte_contraria && `× ${k.parte_contraria}`, um(k.perfis as Rel<{ nome: string }>)?.nome, k.etapa === "nao_viavel" && k.motivo_nao_viavel && `Motivo: ${k.motivo_nao_viavel}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  {k.sigiloso && <span className="chip warn">sigiloso</span>}
                  <span className={"chip" + (k.etapa === "contrato_assinado" ? " good" : k.etapa === "nao_viavel" ? "" : " acc")}>{ETAPA[k.etapa]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="ctitle"><h3>Audiências</h3></div>
          {proximas.length + passadas.length === 0 ? (
            <div className="vazio">Nenhuma audiência.</div>
          ) : (
            <div className="list">
              {[...proximas, ...passadas.slice(0, 5)].map((a) => (
                <div className="li" key={a.id}>
                  <div className="bd">
                    <b>{a.tipo}</b>
                    <small>{dataHoraBR(a.inicio)} · {a.local ?? (a.modalidade === "video" ? "por vídeo" : "local a definir")}</small>
                  </div>
                  {new Date(a.inicio).getTime() >= agora ? <span className="chip acc">próxima</span> : <span className="chip">realizada</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="ctitle"><h3>Processos</h3></div>
          {(processos ?? []).length === 0 ? (
            <div className="vazio">Nenhum processo cadastrado.</div>
          ) : (
            <div className="list">
              {(processos ?? []).map((p) => (
                <div className="li" key={p.id}>
                  <div className="bd">
                    <b style={{ fontFamily: "var(--f-mono)", fontSize: 13 }}>{p.numero_cnj}</b>
                    <small>{[p.tribunal, p.vara].filter(Boolean).join(" · ")}</small>
                    {p.ultima_movimentacao && <small>{dataBR(p.ultima_movimentacao_em)} · {p.ultima_movimentacao}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="ctitle"><h3>Tarefas abertas e mensagens programadas</h3></div>
          {(tarefas ?? []).length + (agendadas ?? []).length === 0 ? (
            <div className="vazio">Nada pendente para este cliente.</div>
          ) : (
            <div className="list">
              {(tarefas ?? []).map((t) => (
                <div className="li" key={t.id}>
                  <div className="bd"><b>{t.titulo}</b><small>{COLUNA_TAREFA[t.coluna]}{t.vence_em && ` · até ${dataBR(t.vence_em)}`}</small></div>
                  <span className="chip">tarefa</span>
                </div>
              ))}
              {(agendadas ?? []).map((m) => (
                <div className="li" key={m.id}>
                  <div className="bd"><b>{TIPO_AGENDAMENTO[m.tipo]}</b><small>{dataHoraBR(m.enviar_em)} · {m.texto.slice(0, 80)}{m.texto.length > 80 ? "…" : ""}</small></div>
                  <span className="chip acc">programada</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Dados do cliente</summary>
        <div style={{ marginTop: 14 }}>
          <FormAcao action={atualizarCliente} botao="Salvar dados" className="form" limparAoSalvar={false}>
            <input type="hidden" name="id" value={c.id} />
            <div className="field full"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" required defaultValue={c.nome} /></div>
            <div className="field"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" defaultValue={c.telefone_whatsapp ?? ""} /></div>
            <div className="field"><label htmlFor="cpf">CPF ou CNPJ</label><input id="cpf" name="cpf" defaultValue={c.cpf_cnpj ?? ""} /></div>
            <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" defaultValue={c.email ?? ""} /></div>
            <div className="field"><label htmlFor="origem">Como chegou ao escritório</label><input id="origem" name="origem" defaultValue={c.origem ?? ""} placeholder="ex.: indicação, Instagram" /></div>
            <div className="field">
              <label htmlFor="area_id">Área</label>
              <select id="area_id" name="area_id" defaultValue={c.area_id ?? ""}>
                <option value="">A definir</option>
                {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="responsavel_id">Responsável</label>
              <select id="responsavel_id" name="responsavel_id" defaultValue={c.responsavel_id ?? ""}>
                <option value="">A definir</option>
                {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="field full"><label htmlFor="observacoes">Observações internas</label><textarea id="observacoes" name="observacoes" rows={3} defaultValue={c.observacoes ?? ""} /></div>
          </FormAcao>
          <p style={{ fontSize: 12, color: "var(--dim)", margin: "10px 0 0" }}>Cadastrado em {dataBR(c.criado_em)}.</p>
        </div>
      </details>
    </div>
  );
}
