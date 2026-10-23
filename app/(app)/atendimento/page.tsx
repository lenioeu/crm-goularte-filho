import Link from "next/link";
import { redirect } from "next/navigation";
import { AtualizarSozinho } from "@/components/AtualizarSozinho";
import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAcao } from "@/components/FormAcao";
import { SalvarDocumento } from "@/components/SalvarDocumento";
import { quemSou } from "@/lib/permissoes";
import { telefoneBR, TZ } from "@/lib/rotulos";
import { whatsappConfigurado } from "@/lib/whatsapp";
import { assumirConversa, encerrarConversa, enviarMensagem, mudarArea, reabrirConversa, salvarDocumento } from "./actions";

type Rel<T> = T | T[] | null;
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
  clientes: Rel<{ id: string; nome: string; telefone_whatsapp: string | null }>;
  areas: Rel<{ nome: string; cor: string }>;
  perfis: Rel<{ nome: string }>;
};

export default async function Atendimento({ searchParams }: { searchParams: Promise<{ f?: string; c?: string; cliente?: string }> }) {
  const { f = "fila", c, cliente: clienteParam } = await searchParams;
  const { supabase, user } = await quemSou();
  const filtro = FILTROS.find((x) => x.id === f) ?? FILTROS[0];

  // Vindo da ficha do cliente: abre a conversa aberta dele, se houver
  if (clienteParam && !c) {
    const { data: aberta } = await supabase.from("conversas").select("id").eq("cliente_id", clienteParam).neq("status", "resolvida").limit(1).maybeSingle();
    if (aberta) redirect(`/atendimento?c=${aberta.id}`);
  }

  const campos = "id, status, ultima_mensagem_em, atendente_id, clientes(id, nome, telefone_whatsapp), areas(nome, cor), perfis(nome)";
  let consulta = supabase.from("conversas").select(campos).in("status", filtro.status).order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(100);
  if (filtro.id === "meus" && user) consulta = consulta.eq("atendente_id", user.id);

  const [{ data: lista, error }, { count: naFila }, { data: areas }, sel, novoCliente] = await Promise.all([
    consulta,
    supabase.from("conversas").select("id", { count: "exact", head: true }).in("status", ["bot", "aguardando"]),
    supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
    c ? supabase.from("conversas").select(campos + ", area_id").eq("id", c).maybeSingle() : Promise.resolve({ data: null }),
    clienteParam && !c ? supabase.from("clientes").select("id, nome, telefone_whatsapp").eq("id", clienteParam).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const conversas = (lista ?? []) as unknown as Conversa[];
  const atual = sel.data as unknown as (Conversa & { area_id: string | null }) | null;

  const { data: mensagens } = atual
    ? await supabase
        .from("mensagens")
        .select("id, direcao, texto, midia_tipo, midia_nome, midia_url, nota_interna, enviada_pelo_bot, criado_em, perfis(nome)")
        .eq("conversa_id", atual.id)
        .order("criado_em", { ascending: false })
        .limit(200)
    : { data: [] };

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

      <div className={"chat" + (abertoAgora ? " aberto" : "")}>
        <aside className="card chat-lista">
          <div className="filtros" style={{ marginBottom: 8 }}>
            {FILTROS.map((x) => (
              <Link key={x.id} className={"fp" + (x.id === filtro.id ? " on" : "")} href={`/atendimento?f=${x.id}`}>
                {x.rotulo}
                {x.id === "fila" && naFila ? ` · ${naFila}` : ""}
              </Link>
            ))}
          </div>
          {conversas.length === 0 ? (
            <div className="vazio">Nenhuma conversa aqui.</div>
          ) : (
            <div className="list">
              {conversas.map((k) => {
                const cli = um(k.clientes);
                const area = um(k.areas);
                return (
                  <Link key={k.id} href={`/atendimento?f=${filtro.id}&c=${k.id}`} className={"li conv" + (k.id === atual?.id ? " sel" : "")}>
                    <div className="bd">
                      <b>{cli?.nome ?? "Contato"}</b>
                      <small>{[area?.nome ?? "área a definir", um(k.perfis)?.nome].filter(Boolean).join(" · ")}</small>
                    </div>
                    <div className="conv-dir">
                      <small>{quando(k.ultima_mensagem_em)}</small>
                      <span className={`chip ${STATUS[k.status]?.classe ?? ""}`}>{STATUS[k.status]?.rotulo ?? k.status}</span>
                    </div>
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
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link href={`/clientes/${cliAtual.id}`} style={{ fontWeight: 500, fontSize: 16 }}>{cliAtual.nome}</Link>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {telefoneBR(cliAtual.telefone_whatsapp)} · <span className={`chip ${STATUS[atual.status]?.classe ?? ""}`}>{STATUS[atual.status]?.rotulo ?? atual.status}</span>
                    {um(atual.perfis) && ` · com ${um(atual.perfis)!.nome}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {atual.status !== "resolvida" && atual.atendente_id !== user?.id && <BotaoAcao acao={assumirConversa.bind(null, atual.id)} rotulo="Assumir" />}
                  {atual.status !== "resolvida" ? (
                    <BotaoAcao acao={encerrarConversa.bind(null, atual.id)} rotulo="Encerrar" confirmar="Encerrar esta conversa? Se o cliente escrever de novo, abre outra." />
                  ) : (
                    <BotaoAcao acao={reabrirConversa.bind(null, atual.id)} rotulo="Reabrir" />
                  )}
                </div>
              </div>

              <FormAcao action={mudarArea} botao="Mudar área" className="chat-area" limparAoSalvar={false}>
                <input type="hidden" name="conversa_id" value={atual.id} />
                <select name="area_id" defaultValue={atual.area_id ?? ""} aria-label="Área da conversa">
                  <option value="">Área a definir</option>
                  {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </FormAcao>

              <div className="chat-msgs">
                {(mensagens ?? []).length === 0 && <div className="vazio">Nenhuma mensagem ainda.</div>}
                {(mensagens ?? []).map((m) => {
                  const autor = um(m.perfis as Rel<{ nome: string }>)?.nome;
                  const classe = m.nota_interna ? "nota" : m.direcao === "entrada" ? "entrada" : "saida";
                  return (
                    <div key={m.id} className={`bolha ${classe}`}>
                      {m.nota_interna && <div className="bolha-rot">Nota interna{autor ? ` · ${autor}` : ""}</div>}
                      {m.midia_tipo && (
                        <div className="bolha-midia">
                          <b>{MIDIA[m.midia_tipo] ?? "Arquivo"}</b>
                          {m.midia_nome && <span> · {m.midia_nome}</span>}
                          {m.midia_url ? (
                            <a href={m.midia_url} target="_blank" rel="noopener" className="doc-ok">Salvo no Drive · abrir</a>
                          ) : (
                            m.direcao === "entrada" && m.midia_tipo !== "figurinha" && <SalvarDocumento action={salvarDocumento} mensagemId={m.id} />
                          )}
                        </div>
                      )}
                      {m.texto && <div className="bolha-texto">{m.texto}</div>}
                      <div className="bolha-hora">
                        {!m.nota_interna && m.direcao === "saida" && (m.enviada_pelo_bot ? "triagem automática · " : autor ? `${autor} · ` : "")}
                        {quando(m.criado_em)}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Composer conversaId={atual.id} />
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
              <Composer clienteId={novoCliente.data.id} />
            </>
          ) : (
            <div className="vazio" style={{ margin: "auto" }}><b>Escolha uma conversa</b>As que esperam resposta ficam na Fila.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Composer({ conversaId, clienteId }: { conversaId?: string; clienteId?: string }) {
  return (
    <FormAcao action={enviarMensagem} botao="Enviar" className="chat-escrever">
      {conversaId && <input type="hidden" name="conversa_id" value={conversaId} />}
      {clienteId && <input type="hidden" name="cliente_id" value={clienteId} />}
      <textarea name="texto" rows={3} required placeholder="Escreva a mensagem" aria-label="Mensagem" />
      <label className="nota-check">
        <input type="checkbox" name="nota" /> Nota interna (não vai para o cliente)
      </label>
    </FormAcao>
  );
}
