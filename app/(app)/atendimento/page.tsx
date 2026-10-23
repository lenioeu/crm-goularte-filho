import Link from "next/link";
import { redirect } from "next/navigation";
import { AtivarNotificacoes } from "@/components/AtivarNotificacoes";
import { AtualizarSozinho } from "@/components/AtualizarSozinho";
import { BotaoAcao } from "@/components/BotaoAcao";
import { BotaoPainel } from "@/components/BotaoPainel";
import { CarregandoLink } from "@/components/CarregandoLink";
import { ComposerAtendimento } from "@/components/ComposerAtendimento";
import { FormAcao } from "@/components/FormAcao";
import { NovaConversa } from "@/components/NovaConversa";
import { SalvarDocumento } from "@/components/SalvarDocumento";
import { VincularCliente } from "@/components/VincularCliente";
import { corDoNome, iniciais } from "@/lib/avatar";
import { quemSou } from "@/lib/permissoes";
import { telefoneBR, TZ } from "@/lib/rotulos";
import { RESPOSTAS_PADRAO } from "@/lib/bot";
import { lerTiposContato } from "@/lib/contatos";
import { ehDeAudiencia, lerModelosMensagem, preencherMensagem, quandoEnviar } from "@/lib/modelosMensagem";
import { TipoContato } from "@/components/TipoContato";
import { CadastrarCliente } from "@/components/CadastrarCliente";
import { whatsappConfigurado } from "@/lib/whatsapp";
import { moverTarefa } from "../actions";
import { cancelarAgendamento, reativarAgendamento } from "../agendamentos/actions";
import { criarPastaCliente } from "../integracoes/actions";
import { cadastrarProcesso } from "../processos/actions";
import { assumirConversa, criarLembrete, encerrarConversa, mudarArea, reabrirConversa, salvarDocumento } from "./actions";
import { IconeDrive } from "@/components/IconeDrive";
import { Icone } from "@/components/Icone";

type Rel<T> = T | T[] | null;

/** "hoje às 18:00", "amanhã às 09:00" ou "sex, 24/10 às 09:00" */
function quandoEnvia(iso: string) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("sv-SE", { timeZone: TZ });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (dia === new Date().toLocaleDateString("sv-SE", { timeZone: TZ })) return `hoje às ${hora}`;
  if (dia === new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: TZ })) return `amanhã às ${hora}`;
  const semana = d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short" }).replace(".", "");
  return `${semana}, ${d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" })} às ${hora}`;
}
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  bot: { rotulo: "na triagem", classe: "" },
  aguardando: { rotulo: "aguardando", classe: "warn" },
  em_atendimento: { rotulo: "em atendimento", classe: "acc" },
  resolvida: { rotulo: "encerrada", classe: "good" },
};

const FILTROS = [
  { id: "fila", rotulo: "Fila", status: ["bot", "aguardando"] },
  { id: "meus", rotulo: "Comigo", status: ["em_atendimento"] },
  { id: "atendimento", rotulo: "Em atendimento", status: ["em_atendimento"] },
  { id: "encerradas", rotulo: "Encerradas", status: ["resolvida"] },
];

const MIDIA: Record<string, string> = { documento: "Documento", imagem: "Foto", audio: "Áudio", video: "Vídeo", figurinha: "Figurinha" };

function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const dia = d.toLocaleDateString("sv-SE", { timeZone: TZ });
  return dia === hoje
    ? d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

type Conversa = {
  id: string;
  status: string;
  ultima_mensagem_em: string | null;
  atendente_id: string | null;
  aguardando_resposta?: boolean;
  clientes: Rel<{ id: string; nome: string; telefone_whatsapp: string | null; pasta_drive_url: string | null }>;
  areas: Rel<{ nome: string; cor: string }>;
  perfis: Rel<{ nome: string }>;
};

export default async function Atendimento({ searchParams }: { searchParams: Promise<{ f?: string; c?: string; cliente?: string; nova?: string }> }) {
  const { f = "fila", c, cliente: clienteParam, nova } = await searchParams;
  const { supabase, user } = await quemSou();
  const filtro = FILTROS.find((x) => x.id === f) ?? FILTROS[0];

  // Vindo da ficha do cliente: abre a conversa aberta dele, se houver
  if (clienteParam && !c) {
    const { data: aberta } = await supabase.from("conversas").select("id").eq("cliente_id", clienteParam).neq("status", "resolvida").limit(1).maybeSingle();
    if (aberta) redirect(`/atendimento?c=${aberta.id}`);
  }

  const campos = "id, status, ultima_mensagem_em, atendente_id, clientes(id, nome, telefone_whatsapp, pasta_drive_url), areas(nome, cor), perfis(nome)";
  const listar = (cols: string) => {
    let q = supabase.from("conversas").select(cols).in("status", filtro.status).order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(100);
    if (filtro.id === "meus" && user) q = q.eq("atendente_id", user.id);
    return q;
  };
  // "aguardando_resposta" só existe depois do script 008: se faltar, lista sem o ponto de não lida
  const consulta = listar(campos + ", aguardando_resposta").then(async (r) => (r.error ? listar(campos) : r));

  // 1ª rodada: tudo que não depende de outra consulta vai junto
  const [{ data: lista, error }, { count: naFila }, { data: areas }, sel, novoCliente, { data: cfgRespostas }, tiposContato, { modelos: modelosMsg }] = await Promise.all([
    consulta,
    supabase.from("conversas").select("id", { count: "exact", head: true }).in("status", ["bot", "aguardando"]),
    supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
    c ? supabase.from("conversas").select(campos + ", area_id").eq("id", c).maybeSingle() : Promise.resolve({ data: null }),
    clienteParam && !c ? supabase.from("clientes").select("id, nome, telefone_whatsapp").eq("id", clienteParam).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("configuracoes").select("valor").eq("chave", "respostas_rapidas").maybeSingle(),
    c ? lerTiposContato(supabase) : Promise.resolve([] as string[]),
    c ? lerModelosMensagem(supabase) : Promise.resolve({ modelos: [] as Awaited<ReturnType<typeof lerModelosMensagem>>["modelos"], tabela: false }),
  ]);
  const conversas = (lista ?? []) as unknown as Conversa[];
  const atual = sel.data as unknown as (Conversa & { area_id: string | null }) | null;
  // Enquanto a equipe não salvar as suas, valem as respostas de fábrica
  const respostas = (Array.isArray(cfgRespostas?.valor) ? cfgRespostas.valor : cfgRespostas ? [] : RESPOSTAS_PADRAO) as { atalho: string; texto: string }[];

  type Msg = {
    id: string; direcao: string; texto: string | null; midia_tipo: string | null; midia_nome: string | null; midia_url: string | null;
    nota_interna: boolean; enviada_pelo_bot: boolean; criado_em: string; perfis: unknown; status_envio?: string | null;
  };
  type DadosCliente = {
    id: string; nome: string; cpf_cnpj: string | null; email: string | null; area_id: string | null; origem: string | null;
    cep?: string | null; endereco?: string | null; situacao?: string; contato_tipo?: string | null;
  };
  const ids = conversas.map((k) => k.id);
  const idCli = atual ? um(atual.clientes)?.id : null;
  const nada = Promise.resolve({ data: [] as never[] });
  // "status_envio" só existe depois do script 010
  const colsMsg = "id, direcao, texto, midia_tipo, midia_nome, midia_url, nota_interna, enviada_pelo_bot, criado_em, perfis(nome)";
  const lerMsgs = (cols: string) => supabase.from("mensagens").select(cols).eq("conversa_id", atual!.id).order("criado_em", { ascending: false }).limit(200);
  // Dados do cliente da conversa; colunas novas (scripts 004 e 012) caem fora se ainda não existirem
  const colsCli = "id, nome, cpf_cnpj, email, area_id, origem";
  const lerCli = (cols: string) => supabase.from("clientes").select(cols).eq("id", idCli!).maybeSingle();

  // 2ª rodada: depende da lista e da conversa aberta, também em paralelo
  const [{ data: ultimas }, rMsgs, rCli, { data: processosCli }, { data: lembretes }, { data: programadas }, { data: proxAud }] = await Promise.all([
    // Prévia da última mensagem de cada conversa da lista
    ids.length
      ? supabase.from("mensagens").select("conversa_id, texto, midia_tipo, direcao, nota_interna").in("conversa_id", ids).order("criado_em", { ascending: false }).limit(400)
      : nada,
    atual ? lerMsgs(colsMsg + ", status_envio").then((r) => (r.error ? lerMsgs(colsMsg) : r)) : nada,
    idCli
      ? lerCli(colsCli + ", cep, endereco, situacao, contato_tipo")
          .then((r) => (r.error ? lerCli(colsCli + ", situacao, contato_tipo") : r))
          .then((r) => (r.error ? lerCli(colsCli) : r))
      : Promise.resolve({ data: null }),
    idCli ? supabase.from("processos").select("id, numero_cnj, classe, casos!inner(cliente_id)").eq("casos.cliente_id", idCli).order("criado_em") : nada,
    idCli ? supabase.from("tarefas").select("id, titulo, vence_em, coluna").eq("cliente_id", idCli).neq("coluna", "concluida").order("vence_em", { nullsFirst: false }).limit(10) : nada,
    idCli ? supabase.from("mensagens_agendadas").select("id, texto, enviar_em, cancelar_se_responder").eq("cliente_id", idCli).eq("status", "programada").order("enviar_em").limit(20) : nada,
    idCli
      ? supabase.from("audiencias").select("inicio, tipo, local, modalidade, processos(numero_cnj), casos!inner(cliente_id)").eq("casos.cliente_id", idCli).gte("inicio", new Date().toISOString()).order("inicio").limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const mensagens = (rMsgs.data ?? []) as unknown as Msg[];
  const previa = new Map<string, string>();
  for (const m of (ultimas ?? []) as { conversa_id: string; texto: string | null; midia_tipo: string | null; direcao: string; nota_interna: boolean }[]) {
    if (previa.has(m.conversa_id)) continue;
    const corpo = m.texto ?? (m.midia_tipo ? MIDIA[m.midia_tipo] ?? "Arquivo" : "");
    previa.set(m.conversa_id, `${m.nota_interna ? "Nota: " : m.direcao === "saida" ? "Você: " : ""}${corpo}`);
  }

  // Contato ou cliente? Sem o script 012 tudo conta como cliente
  const dadosCli = rCli.data as unknown as DadosCliente | null;
  const situacaoCli = dadosCli ? { situacao: dadosCli.situacao, contato_tipo: dadosCli.contato_tipo ?? null } : null;
  const ehContato = dadosCli?.situacao === "contato";
  const contato = ehContato ? dadosCli : null;
  const amanha = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: TZ });

  // Modelos de mensagem para o "Programar", já preenchidos com o cliente e a próxima audiência dele
  const prox = proxAud as unknown as { inicio: string; tipo: string; local: string | null; modalidade: string; processos: unknown } | null;
  const audCli = prox
    ? { inicio: prox.inicio, tipo: prox.tipo, local: prox.local, modalidade: prox.modalidade, processo: um(prox.processos as Rel<{ numero_cnj: string }>)?.numero_cnj ?? null }
    : null;
  const nomeCli = atual ? um(atual.clientes)?.nome ?? "" : "";
  const modelosConversa = modelosMsg
    .filter((m) => !ehDeAudiencia(m.gatilho) || audCli)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      texto: preencherMensagem(m.texto, nomeCli, audCli),
      quando: quandoEnviar(m, audCli?.inicio) ?? { data: amanha, hora: m.hora },
      cancelar: m.cancelar_se_responder,
    }))
    .filter((m) => new Date(`${m.quando.data}T${m.quando.hora}:00-03:00`).getTime() > Date.now());

  const ligado = whatsappConfigurado();
  const abertoAgora = Boolean(atual || novoCliente.data);
  const cliAtual = atual ? um(atual.clientes) : null;

  return (
    <div className="view">
      <AtualizarSozinho segundos={8} />
      <div className="vhead">
        <div>
          <h1>Atendimento</h1>
          <p>Conversas do WhatsApp do escritório. Novos contatos passam pela triagem automática e caem na fila da área escolhida.</p>
        </div>
      </div>

      {!ligado && (
        <div className="aviso info" style={{ marginBottom: 16 }}>
          O WhatsApp do escritório ainda não está ligado ao sistema. Siga o passo a passo em Integrações; até lá, dá para registrar notas internas.
        </div>
      )}
      {error && <div className="aviso erro" style={{ marginBottom: 16 }}>{error.message}</div>}
      <AtivarNotificacoes compacto />

      <div className="filtros chat-abas" style={{ alignItems: "center" }}>
        {FILTROS.map((x) => (
          // prefetch: a aba já vem carregada ao passar o mouse/abrir a tela, e a troca fica instantânea
          <Link key={x.id} className={"fp" + (x.id === filtro.id ? " on" : "")} href={`/atendimento?f=${x.id}`} prefetch>
            {x.rotulo}
            {x.id === "fila" && naFila ? ` · ${naFila}` : ""}
            <CarregandoLink />
          </Link>
        ))}
        <NovaConversa abrir={Boolean(nova)} />
      </div>

      <div className={"chat" + (abertoAgora ? " aberto" : "")}>
        <aside className="card chat-lista">
          {conversas.length === 0 ? (
            <div className="vazio">Nenhuma conversa aqui.</div>
          ) : (
            <div className="list">
              {conversas.map((k) => {
                const cli = um(k.clientes);
                const area = um(k.areas);
                return (
                  <Link key={k.id} href={`/atendimento?f=${filtro.id}&c=${k.id}`} className={"li conv" + (k.id === atual?.id ? " sel" : "") + (k.aguardando_resposta ? " nao-lida" : "")}>
                    <span className="avatar" style={{ "--c": corDoNome(cli?.nome ?? "?") } as React.CSSProperties}>{iniciais(cli?.nome ?? "?")}</span>
                    <div className="bd">
                      <div className="conv-linha1">
                        <b>{cli?.nome ?? "Contato"}</b>
                        <small className="conv-hora">{quando(k.ultima_mensagem_em)}</small>
                      </div>
                      <div className="conv-linha2">
                        <small className="conv-previa">{previa.get(k.id) ?? [area?.nome ?? "área a definir", um(k.perfis)?.nome].filter(Boolean).join(" · ")}</small>
                        {k.aguardando_resposta ? <span className="ponto-nao-lida" aria-label="esperando resposta" /> : k.status === "bot" ? <span className="chip">triagem</span> : null}
                      </div>
                    </div>
                    <CarregandoLink />
                  </Link>
                );
              })}
            </div>
          )}
        </aside>

        <section className="card chat-painel">
          {atual && cliAtual ? (
            <>
              <div className="chat-topo">
                <Link href={`/atendimento?f=${filtro.id}`} className="voltar" aria-label="Voltar à lista">‹</Link>
                <span className="avatar" style={{ "--c": corDoNome(cliAtual.nome) } as React.CSSProperties}>{iniciais(cliAtual.nome)}</span>
                <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                  <Link href={`/clientes/${cliAtual.id}`} style={{ fontWeight: 500, fontSize: 16 }}>{cliAtual.nome}</Link>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {telefoneBR(cliAtual.telefone_whatsapp)} · <span className={`chip ${STATUS[atual.status]?.classe ?? ""}`}>{STATUS[atual.status]?.rotulo ?? atual.status}</span>
                    {um(atual.perfis) && ` · com ${um(atual.perfis)!.nome}`}
                  </div>
                  {ehContato && (
                    <div className="contato-linha">
                      <span className="chip warn">Contato · ainda não é cliente</span>
                      <TipoContato id={cliAtual.id} atual={situacaoCli?.contato_tipo ?? null} tipos={tiposContato} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <BotaoPainel />
                  {ehContato && contato && <CadastrarCliente contato={{ ...contato, cep: contato.cep ?? null, endereco: contato.endereco ?? null }} areas={areas ?? []} />}
                  <VincularCliente conversaId={atual.id} atual={cliAtual.id} />
                  {atual.status !== "resolvida" && atual.atendente_id !== user?.id && <BotaoAcao acao={assumirConversa.bind(null, atual.id)} rotulo="Assumir" />}
                  {atual.status !== "resolvida" ? (
                    <BotaoAcao acao={encerrarConversa.bind(null, atual.id)} rotulo="Encerrar" desfazer={reabrirConversa.bind(null, atual.id)} />
                  ) : (
                    <BotaoAcao acao={reabrirConversa.bind(null, atual.id)} rotulo="Reabrir" />
                  )}
                </div>
              </div>

              <div className="chat-msgs">
                {/* A lista é invertida na tela: as programadas, primeiras aqui, aparecem por último, embaixo */}
                {(programadas ?? []).map((g) => (
                  <div key={g.id} className="msg-bloco">
                    <div className="bolha programada">
                      <div className="bolha-rot"><Icone nome="relogio" tamanho={13} /> Programada · {quandoEnvia(g.enviar_em)}{g.cancelar_se_responder ? " · cancela se responder antes" : ""}</div>
                      <div className="bolha-texto">{g.texto}</div>
                      <div className="bolha-hora">
                        <BotaoAcao acao={cancelarAgendamento.bind(null, g.id)} rotulo="Cancelar envio" desfazer={reativarAgendamento.bind(null, g.id)} />
                      </div>
                    </div>
                  </div>
                ))}
                {mensagens.length === 0 && !(programadas ?? []).length && <div className="vazio">Nenhuma mensagem ainda.</div>}
                {mensagens.map((m, i) => {
                  const autor = um(m.perfis as Rel<{ nome: string }>)?.nome;
                  const classe = m.nota_interna ? "nota" : m.direcao === "entrada" ? "entrada" : "saida";
                  // A lista vem da mais nova para a mais antiga (e a tela inverte): a divisão do dia
                  // entra depois da mensagem mais antiga de cada dia
                  const dia = diaDe(m.criado_em);
                  const mudaDia = i === mensagens.length - 1 || diaDe(mensagens[i + 1].criado_em) !== dia;
                  return (
                    <div key={m.id} className="msg-bloco">
                      <div className={`bolha ${classe}`}>
                        {m.nota_interna && <div className="bolha-rot">Nota interna{autor ? ` · ${autor}` : ""}</div>}
                        {m.midia_tipo && (
                          <div className="bolha-midia">
                            <Midia id={m.id} tipo={m.midia_tipo} nome={m.midia_nome} />
                            {m.midia_url ? (
                              <a href={m.midia_url} target="_blank" rel="noopener" className="doc-ok"><IconeDrive tamanho={14} />Salvo no Drive · abrir</a>
                            ) : (
                              m.direcao === "entrada" && m.midia_tipo !== "figurinha" && <SalvarDocumento action={salvarDocumento} mensagemId={m.id} />
                            )}
                          </div>
                        )}
                        {m.texto && <div className="bolha-texto">{m.texto}</div>}
                        <div className="bolha-hora">
                          {!m.nota_interna && m.direcao === "saida" && (m.enviada_pelo_bot ? "triagem automática · " : autor ? `${autor} · ` : "")}
                          {new Date(m.criado_em).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}
                          {!m.nota_interna && m.direcao === "saida" && <Tiques status={m.status_envio ?? null} />}
                        </div>
                      </div>
                      {mudaDia && <div className="divisor-dia"><span>{rotuloDia(m.criado_em)}</span></div>}
                    </div>
                  );
                })}
              </div>

              <ComposerAtendimento conversaId={atual.id} clienteId={cliAtual.id} respostas={respostas} nomeCliente={cliAtual.nome} modelos={modelosConversa} />
            </>
          ) : novoCliente.data ? (
            <>
              <div className="chat-topo">
                <Link href="/atendimento" className="voltar" aria-label="Voltar à lista">‹</Link>
                <div style={{ flex: 1 }}>
                  <Link href={`/clientes/${novoCliente.data.id}`} style={{ fontWeight: 500, fontSize: 16 }}>{novoCliente.data.nome}</Link>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{telefoneBR(novoCliente.data.telefone_whatsapp)} · nova conversa</div>
                </div>
              </div>
              <div className="chat-msgs"><div className="vazio">Escreva abaixo para começar a conversa.</div></div>
              <ComposerAtendimento clienteId={novoCliente.data.id} respostas={respostas} nomeCliente={novoCliente.data.nome} />
            </>
          ) : (
            <div className="vazio" style={{ margin: "auto" }}><b>Escolha uma conversa</b>As que esperam resposta ficam na Fila.</div>
          )}
        </section>

        {atual && cliAtual && (
          <aside className="card chat-cliente" aria-label="Painel do cliente">
            <div className="painel-cliente-topo">
              <span className="avatar lg" style={{ "--c": corDoNome(cliAtual.nome) } as React.CSSProperties}>{iniciais(cliAtual.nome)}</span>
              <b>{cliAtual.nome}</b>
              <small>{telefoneBR(cliAtual.telefone_whatsapp)}</small>
            </div>
              <div className="chat-atalhos">
                <Link className="btn sm" href={`/clientes/${cliAtual.id}`}><Icone nome="usuario" tamanho={16} /> Ficha do cliente</Link>
                {cliAtual.pasta_drive_url ? (
                  <a className="btn sm" href={cliAtual.pasta_drive_url} target="_blank" rel="noopener"><IconeDrive /> Abrir pasta no Drive</a>
                ) : (
                  <BotaoAcao acao={criarPastaCliente.bind(null, cliAtual.id)} rotulo="Criar pasta no Drive" />
                )}
                <Link className="btn sm" href={`/clientes/${cliAtual.id}/documentos?conversa=${atual.id}`}><Icone nome="assinar" tamanho={16} /> Documentos para assinar</Link>
              </div>

              <details className="chat-extra" open>
                <summary>
                  {(processosCli ?? []).length ? (
                    <span className="chip acc"><Icone nome="balanca" tamanho={14} /> {(processosCli ?? []).length} {(processosCli ?? []).length === 1 ? "processo" : "processos"}</span>
                  ) : (
                    <span className="chip warn"><Icone nome="balanca" tamanho={14} /> Nenhum processo cadastrado</span>
                  )}
                  {(lembretes ?? []).length > 0 && <span className="chip warn"><Icone nome="sino" tamanho={14} /> {(lembretes ?? []).length} {(lembretes ?? []).length === 1 ? "lembrete" : "lembretes"}</span>}
                  <span className="chat-extra-dica">processos e lembretes deste cliente</span>
                </summary>
                <div className="chat-extra-corpo">
                  <div>
                    <div className="dayhead" style={{ margin: "0 0 6px" }}>Processos</div>
                    {(processosCli ?? []).map((p) => (
                      <div key={p.id} style={{ fontSize: 13 }}>
                        <span style={{ fontFamily: "var(--f-mono)" }}>{p.numero_cnj}</span>
                        {p.classe && <span style={{ color: "var(--muted)" }}> · {p.classe}</span>}
                      </div>
                    ))}
                    <FormAcao action={cadastrarProcesso} botao="+ Cadastrar processo" className="chat-mini" limparAoSalvar>
                      <input type="hidden" name="cliente_id" value={cliAtual.id} />
                      <input name="numero" required inputMode="numeric" placeholder="Nº do processo (CNJ)" aria-label="Número do processo" />
                    </FormAcao>
                    <small style={{ color: "var(--dim)", fontSize: 12 }}>Um cliente pode ter vários processos; cadastre um de cada vez.</small>
                  </div>
                  <div>
                    <div className="dayhead" style={{ margin: "0 0 6px" }}>Lembretes</div>
                    {(lembretes ?? []).map((t) => (
                      <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ flex: 1 }}>{t.titulo}{t.vence_em && <span style={{ color: "var(--muted)" }}> · até {t.vence_em.split("-").reverse().join("/")}</span>}</span>
                        <BotaoAcao acao={moverTarefa.bind(null, t.id, "concluida")} rotulo="Feito" desfazer={moverTarefa.bind(null, t.id, t.coluna)} />
                      </div>
                    ))}
                    <FormAcao action={criarLembrete} botao="+ Lembrete" className="chat-mini" limparAoSalvar>
                      <input type="hidden" name="cliente_id" value={cliAtual.id} />
                      <input name="titulo" required defaultValue={(processosCli ?? []).length ? "" : `Cadastrar o processo de ${cliAtual.nome}`} placeholder="O que precisa ser feito" aria-label="Lembrete" />
                      <input name="vence_em" type="date" defaultValue={amanha} aria-label="Até quando" style={{ maxWidth: 150 }} />
                    </FormAcao>
                  </div>
                </div>
              </details>

              <FormAcao action={mudarArea} botao="Mudar área" className="chat-area" limparAoSalvar={false}>
                <input type="hidden" name="conversa_id" value={atual.id} />
                <select name="area_id" defaultValue={atual.area_id ?? ""} aria-label="Área da conversa">
                  <option value="">Área a definir</option>
                  {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </FormAcao>

          </aside>
        )}
      </div>
    </div>
  );
}

const diaDe = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
function rotuloDia(iso: string) {
  const dia = diaDe(iso);
  const hoje = diaDe(new Date().toISOString());
  const ontem = diaDe(new Date(Date.now() - 86_400_000).toISOString());
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  const d = new Date(iso);
  const semana = (Date.now() - d.getTime()) / 86_400_000 < 7;
  return d.toLocaleDateString("pt-BR", semana ? { timeZone: TZ, weekday: "long" } : { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" });
}

/** ✓ enviada · ✓✓ entregue · ✓✓ azul lida (como no WhatsApp). */
function Tiques({ status }: { status: string | null }) {
  const duplo = status === "entregue" || status === "lida";
  return (
    <svg className={"tiques" + (status === "lida" ? " lida" : "")} width={duplo ? 18 : 13} height="12" viewBox={duplo ? "0 0 18 12" : "0 0 13 12"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-label={status === "lida" ? "lida" : duplo ? "entregue" : "enviada"}>
      <path d="M1 6.5l3.2 3.2L11.5 2.5" />
      {duplo && <path d="M7 9.7l.2.2 7.3-7.4" />}
    </svg>
  );
}

/** Foto, vídeo e áudio tocam na própria conversa; documento abre em outra aba. */
function Midia({ id, tipo, nome }: { id: string; tipo: string; nome: string | null }) {
  const src = `/api/whatsapp/midia/${id}`;
  if (tipo === "imagem")
    return (
      <a href={src} target="_blank" rel="noopener">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={nome ?? "Foto"} className="bolha-img" loading="lazy" />
      </a>
    );
  if (tipo === "audio") return <audio controls preload="none" src={src} />;
  if (tipo === "video") return <video controls preload="none" src={src} className="bolha-video" />;
  return (
    <a href={src} target="_blank" rel="noopener" className="doc-link">
      <Icone nome="documento" tamanho={16} /> <b>{MIDIA[tipo] ?? "Arquivo"}</b>{nome ? ` · ${nome}` : ""} · abrir
    </a>
  );
}
