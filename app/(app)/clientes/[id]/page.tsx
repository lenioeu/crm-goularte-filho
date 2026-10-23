import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { CampoCpf } from "@/components/CampoCpf";
import { CampoEndereco } from "@/components/CampoEndereco";
import { FormAcao } from "@/components/FormAcao";
import { LinhaDoTempo } from "@/components/LinhaDoTempo";
import { linhaDoTempo } from "@/lib/linhaDoTempo";
import { COLUNA_TAREFA, dataBR, dataHoraBR, ETAPA, telefoneBR, TIPO_AGENDAMENTO } from "@/lib/rotulos";
import { quemSou } from "@/lib/permissoes";
import { atualizarCliente, criarNota, excluirCliente, moverTarefa } from "../../actions";
import { criarPastaCliente } from "../../integracoes/actions";
import { atualizarQualificacao } from "./documentos/actions";
import { IconeDrive } from "@/components/IconeDrive";
import { Icone } from "@/components/Icone";
import { corDoNome, iniciais } from "@/lib/avatar";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, papel } = await quemSou();

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

  const [{ data: processos }, { data: audiencias }, { data: tarefas }, { data: agendadas }, { data: areas }, { data: pessoas }, { data: google }, { data: documentos }, { data: qualif, error: erroQualif }] =
    await Promise.all([
      supabase.from("processos").select("id, numero_cnj, tribunal, vara, ultima_movimentacao, ultima_movimentacao_em").in("caso_id", idsCasos.length ? idsCasos : nenhum),
      supabase.from("audiencias").select("id, tipo, inicio, local, modalidade").in("caso_id", idsCasos.length ? idsCasos : nenhum).order("inicio", { ascending: false }).limit(20),
      supabase.from("tarefas").select("id, titulo, coluna, vence_em").eq("cliente_id", id).neq("coluna", "concluida").order("vence_em", { nullsFirst: false }),
      supabase.from("mensagens_agendadas").select("id, tipo, texto, enviar_em").eq("cliente_id", id).eq("status", "programada").order("enviar_em"),
      supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
      supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("configuracoes").select("chave").in("chave", ["google_email", "pasta_clientes"]),
      supabase.from("documentos").select("id, nome_salvo, drive_url, salvo_em").eq("cliente_id", id).order("salvo_em", { ascending: false }).limit(30),
      // Separado: as colunas só existem depois do script 004_modelos.sql
      supabase.from("clientes").select("rg, nacionalidade, estado_civil, profissao, endereco, cep, genero").eq("id", id).maybeSingle(),
    ]);

  const eventos = await linhaDoTempo(supabase, id);
  const area = um(c.areas as Rel<{ nome: string; cor: string }>);
  const resp = um(c.perfis as Rel<{ nome: string }>);
  const agora = Date.now();
  const proximas = (audiencias ?? []).filter((a) => new Date(a.inicio).getTime() >= agora).reverse();
  const passadas = (audiencias ?? []).filter((a) => new Date(a.inicio).getTime() < agora);
  const driveLigado = (google ?? []).length === 2;

  const nomeArea = area?.nome;
  return (
    <div className="view">
      <Link href="/clientes" style={{ color: "var(--accent)", fontSize: 13 }}>‹ Clientes</Link>

      <div className="ficha">
        {/* ---------------- Esquerda: quem é o cliente ---------------- */}
        <aside className="ficha-esq">
          <div className="card ficha-pessoa">
            <span className="avatar lg" style={{ "--c": corDoNome(c.nome) } as React.CSSProperties}>{iniciais(c.nome)}</span>
            <h1>{c.nome}</h1>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {area ? <span className="chip area" style={{ "--c": area.cor } as React.CSSProperties}>{nomeArea}</span> : <span className="chip">área a definir</span>}
              {(processos ?? []).length > 0 && <span className="chip acc"><Icone nome="balanca" tamanho={14} /> {(processos ?? []).length}</span>}
            </div>
            <div className="ficha-acoes">
              <Link className="btn primary" href={`/atendimento?cliente=${c.id}`}><Icone nome="conversa" tamanho={16} /> Conversar no WhatsApp</Link>
              {c.pasta_drive_url ? (
                <a className="btn" href={c.pasta_drive_url} target="_blank" rel="noopener"><IconeDrive /> Abrir pasta no Drive</a>
              ) : driveLigado ? (
                <BotaoAcao acao={criarPastaCliente.bind(null, c.id)} rotulo="Criar pasta no Drive" className="btn" />
              ) : null}
              <Link className="btn" href={`/clientes/${c.id}/documentos`}><Icone nome="assinar" tamanho={16} /> Documentos para assinar</Link>
              <Link className="btn" href={`/agendamentos?cliente=${c.id}`}><Icone nome="relogio" tamanho={16} /> Agendar mensagem</Link>
            </div>
            <dl className="ficha-dados">
              <dt>WhatsApp</dt><dd>{telefoneBR(c.telefone_whatsapp)}</dd>
              <dt>CPF/CNPJ</dt><dd>{c.cpf_cnpj ?? "—"}</dd>
              <dt>E-mail</dt><dd>{c.email ?? "—"}</dd>
              {qualif?.endereco && (<><dt>Endereço</dt><dd>{qualif.endereco}{qualif.cep ? ` · ${qualif.cep}` : ""}</dd></>)}
              <dt>Responsável</dt><dd>{resp?.nome ?? "—"}</dd>
              <dt>Origem</dt><dd>{c.origem ?? "—"}</dd>
              <dt>Desde</dt><dd>{dataBR(c.criado_em)}</dd>
            </dl>
            {c.observacoes && <div className="ficha-obs">{c.observacoes}</div>}
          </div>

          <details className="card">
            <summary className="ficha-sumario">Editar dados</summary>
            <div style={{ marginTop: 12 }}>
          <FormAcao action={atualizarCliente} botao="Salvar dados" className="form maiusculas" limparAoSalvar={false}>
            <input type="hidden" name="id" value={c.id} />
            <div className="field full"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" required defaultValue={c.nome} /></div>
            <div className="field"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" defaultValue={c.telefone_whatsapp ?? ""} /></div>
            <div className="field"><label htmlFor="cpf">CPF ou CNPJ</label><CampoCpf defaultValue={c.cpf_cnpj} /></div>
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
          {papel === "administrador" && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <BotaoAcao
                acao={excluirCliente.bind(null, c.id)}
                rotulo="Excluir cliente"
                className="btn sm perigo"
                confirmar={`Excluir ${c.nome}? Some do CRM junto com casos, processos, audiências, tarefas, conversas e mensagens agendadas dele. Não dá para desfazer. A pasta no Drive não é apagada.`}
              />
              <small style={{ color: "var(--dim)", fontSize: 12 }}>A pasta no Drive continua lá. Se rodar “Importar clientes do Drive” de novo, ele volta a ser cadastrado.</small>
            </div>
          )}
            </div>
          </details>

          <details className="card" id="qualificacao">
            <summary className="ficha-sumario">Qualificação (procuração, contrato e declarações)</summary>
            <div style={{ marginTop: 12 }}>
          {erroQualif ? (
            <div className="aviso info">Falta rodar o script supabase/004_modelos.sql no Supabase para guardar RG, estado civil e endereço.</div>
          ) : (
            <FormAcao action={atualizarQualificacao} botao="Salvar qualificação" className="form maiusculas" limparAoSalvar={false}>
              <input type="hidden" name="id" value={c.id} />
              <div className="field"><label htmlFor="rg">RG (com órgão)</label><input id="rg" name="rg" defaultValue={qualif?.rg ?? ""} placeholder="ex.: 1234567-SSP/ES" /></div>
              <div className="field">
                <label htmlFor="genero">Tratamento</label>
                <select id="genero" name="genero" defaultValue={qualif?.genero ?? ""}>
                  <option value="">Masculino (padrão)</option>
                  <option value="m">Masculino</option>
                  <option value="f">Feminino</option>
                </select>
              </div>
              <div className="field"><label htmlFor="nacionalidade">Nacionalidade</label><input id="nacionalidade" name="nacionalidade" defaultValue={qualif?.nacionalidade ?? ""} placeholder="ex.: brasileira" /></div>
              <div className="field"><label htmlFor="estado_civil">Estado civil</label><input id="estado_civil" name="estado_civil" defaultValue={qualif?.estado_civil ?? ""} placeholder="ex.: casado" /></div>
              <div className="field"><label htmlFor="profissao">Profissão</label><input id="profissao" name="profissao" defaultValue={qualif?.profissao ?? ""} placeholder="ex.: mecânico" /></div>
              <CampoEndereco cepInicial={qualif?.cep ?? null} enderecoInicial={qualif?.endereco ?? null} />
            </FormAcao>
          )}
            </div>
          </details>
        </aside>

        {/* ---------------- Centro: o que aconteceu ---------------- */}
        <section className="ficha-centro">
          <div className="card">
            <FormAcao action={criarNota} botao="Registrar nota" className="nota-rapida">
              <input type="hidden" name="cliente_id" value={c.id} />
              <textarea name="texto" rows={2} required placeholder="Escreva uma nota sobre o cliente (ligação, reunião, combinado…)" aria-label="Nota sobre o cliente" />
            </FormAcao>
          </div>
          <div className="card">
            <div className="ctitle"><h3>Linha do tempo</h3><span className="tag">{eventos.length} {eventos.length === 1 ? "registro" : "registros"}</span></div>
            <LinhaDoTempo eventos={eventos} />
          </div>
        </section>

        {/* ---------------- Direita: casos, processos e pendências ---------------- */}
        <aside className="ficha-dir">
          <div className="card">
            <div className="ctitle"><h3>Processos</h3><Link href={`/processos?cliente=${c.id}`} className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>+ Cadastrar</Link></div>
            {(processos ?? []).length === 0 ? (
              <div className="vazio" style={{ padding: "10px 4px" }}>Nenhum processo cadastrado.</div>
            ) : (
              <div className="list">
                {(processos ?? []).map((p) => (
                  <div className="li" key={p.id}>
                    <div className="bd">
                      <b style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>{p.numero_cnj}</b>
                      <small>{[p.tribunal, p.vara].filter(Boolean).join(" · ")}</small>
                      {p.ultima_movimentacao && <small>{dataBR(p.ultima_movimentacao_em)} · {p.ultima_movimentacao}</small>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="ctitle"><h3>Audiências</h3></div>
            {proximas.length + passadas.length === 0 ? (
              <div className="vazio" style={{ padding: "10px 4px" }}>Nenhuma audiência.</div>
            ) : (
              <div className="list">
                {[...proximas, ...passadas.slice(0, 4)].map((a) => (
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

          <div className="card">
            <div className="ctitle"><h3>Pendências</h3></div>
            {(tarefas ?? []).length + (agendadas ?? []).length === 0 ? (
              <div className="vazio" style={{ padding: "10px 4px" }}>Nada pendente.</div>
            ) : (
              <div className="list">
                {(tarefas ?? []).map((t) => (
                  <div className="li" key={t.id}>
                    <div className="bd"><b>{t.titulo}</b><small>{COLUNA_TAREFA[t.coluna]}{t.vence_em && ` · até ${dataBR(t.vence_em)}`}</small></div>
                    <BotaoAcao acao={moverTarefa.bind(null, t.id, "concluida")} rotulo="Feito" desfazer={moverTarefa.bind(null, t.id, t.coluna)} />
                  </div>
                ))}
                {(agendadas ?? []).map((m) => (
                  <div className="li" key={m.id}>
                    <div className="bd"><b>{TIPO_AGENDAMENTO[m.tipo]}</b><small>{dataHoraBR(m.enviar_em)} · {m.texto.slice(0, 70)}{m.texto.length > 70 ? "…" : ""}</small></div>
                    <span className="chip acc">programada</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="ctitle"><h3>Casos</h3><Link href="/funil" className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>Funil</Link></div>
            {(casos ?? []).length === 0 ? (
              <div className="vazio" style={{ padding: "10px 4px" }}>Nenhum caso.</div>
            ) : (
              <div className="list">
                {(casos ?? []).map((k) => (
                  <div className="li" key={k.id}>
                    <div className="bd">
                      <b>{k.titulo}</b>
                      <small>{[k.parte_contraria && `× ${k.parte_contraria}`, um(k.perfis as Rel<{ nome: string }>)?.nome].filter(Boolean).join(" · ")}</small>
                    </div>
                    {k.sigiloso && <span className="chip warn">sigiloso</span>}
                    <span className={"chip" + (k.etapa === "contrato_assinado" ? " good" : k.etapa === "nao_viavel" ? "" : " acc")}>{ETAPA[k.etapa]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(documentos ?? []).length > 0 && (
            <div className="card">
              <div className="ctitle"><h3>Documentos</h3>{c.pasta_drive_url && <a className="tag" href={c.pasta_drive_url} target="_blank" rel="noopener" style={{ marginLeft: "auto", color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}><IconeDrive tamanho={14} /> pasta</a>}</div>
              <div className="list">
                {(documentos ?? []).slice(0, 8).map((d) => (
                  <a className="li" key={d.id} href={d.drive_url ?? "#"} target="_blank" rel="noopener">
                    <IconeDrive tamanho={16} />
                    <div className="bd"><b style={{ fontSize: 13 }}>{d.nome_salvo}</b><small>{dataBR(d.salvo_em)}</small></div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
