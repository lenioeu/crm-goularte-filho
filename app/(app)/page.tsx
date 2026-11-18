import Link from "next/link";
import { moverTarefa } from "@/app/(app)/actions";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Icone, type NomeIcone } from "@/components/Icone";
import { corDoNome, iniciais } from "@/lib/avatar";
import { quemSou } from "@/lib/permissoes";
import { dataBR, primeiroNome, TZ } from "@/lib/rotulos";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

function saudacao() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function quando(iso: string | null) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return dataBR(new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ }));
}

const ATALHOS: { rotulo: string; href: string; icone: NomeIcone }[] = [
  { rotulo: "Nova conversa", href: "/atendimento?nova=1", icone: "conversa" },
  { rotulo: "Novo cliente", href: "/clientes#novo", icone: "usuario" },
  { rotulo: "Cadastrar processo", href: "/processos?nova=1", icone: "balanca" },
  { rotulo: "Agendar audiência", href: "/audiencias?nova=1", icone: "calendario" },
  { rotulo: "Nova tarefa", href: "/tarefas?nova=1", icone: "tarefa" },
];

// Painel do dia: o que precisa de atenção hoje, com atalho para cada coisa.
export default async function Inicio() {
  const { supabase, user } = await quemSou();
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const inicioHoje = new Date(`${hoje}T00:00:00-03:00`).toISOString();
  const fimHoje = new Date(new Date(inicioHoje).getTime() + 86_400_000).toISOString();
  const em7 = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const em7dia = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: TZ });

  const [{ data: perfil }, { data: audiencias }, esperando, { data: tarefas }, { count: agendadasHoje }, { count: pubNovas }, { data: prazosUrg }] = await Promise.all([
    supabase.from("perfis").select("nome").eq("id", user?.id ?? "").maybeSingle(),
    supabase.from("audiencias").select("id, tipo, inicio, local, modalidade, casos(titulo, clientes(id, nome))").gte("inicio", inicioHoje).lte("inicio", em7).order("inicio").limit(8),
    supabase
      .from("conversas")
      .select("id, ultima_mensagem_em, atendente_id, clientes(nome), areas(nome)")
      .eq("aguardando_resposta", true)
      .in("status", ["aguardando", "em_atendimento"])
      .order("ultima_mensagem_em", { ascending: true })
      .limit(6),
    supabase
      .from("tarefas")
      .select("id, titulo, vence_em, coluna, clientes(id, nome)")
      .eq("responsavel_id", user?.id ?? "")
      .neq("coluna", "concluida")
      .or(`vence_em.lte.${hoje},vence_em.is.null`)
      .order("vence_em", { nullsFirst: false })
      .limit(8),
    supabase.from("mensagens_agendadas").select("id", { count: "exact", head: true }).eq("status", "programada").gte("enviar_em", new Date().toISOString()).lt("enviar_em", fimHoje),
    supabase.from("publicacoes").select("id", { count: "exact", head: true }).eq("situacao", "nova"),
    supabase
      .from("prazos")
      .select("id, descricao, vence_em, vence_interno, processos(numero_cnj), clientes(id, nome)")
      .eq("situacao", "aberto")
      .lte("vence_em", em7dia)
      .order("vence_em")
      .limit(200),
  ]);
  // Antes do script 008 não existe "aguardando_resposta": usa a fila
  const { data: fila } = esperando.error
    ? await supabase.from("conversas").select("id, ultima_mensagem_em, atendente_id, clientes(nome), areas(nome)").in("status", ["bot", "aguardando"]).order("ultima_mensagem_em", { ascending: true }).limit(6)
    : { data: esperando.data };

  const audHoje = (audiencias ?? []).filter((a) => a.inicio < fimHoje);
  const audProximas = (audiencias ?? []).filter((a) => a.inicio >= fimHoje);
  const atrasadas = (tarefas ?? []).filter((t) => t.vence_em && t.vence_em < hoje).length;
  const dataLonga = new Date().toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

  const prazos7 = (prazosUrg ?? []).map((p) => ({ ...p, dia: String(p.vence_em).slice(0, 10) }));
  const prazosVencidos = prazos7.filter((p) => p.dia < hoje).length;
  const prazosHoje = prazos7.filter((p) => p.dia === hoje).length;

  const numeros: { rotulo: string; valor: number; href: string; icone: NomeIcone; alerta?: boolean }[] = [
    { rotulo: "Publicações para tratar", valor: pubNovas ?? 0, href: "/publicacoes", icone: "documento", alerta: (pubNovas ?? 0) > 0 },
    {
      rotulo: prazosVencidos ? `Prazos que vencem hoje · ${prazosVencidos} vencido${prazosVencidos > 1 ? "s" : ""}` : "Prazos que vencem hoje",
      valor: prazosHoje,
      href: "/prazos",
      icone: "relogio",
      alerta: prazosHoje + prazosVencidos > 0,
    },
    { rotulo: "Conversas esperando resposta", valor: (fila ?? []).length, href: "/atendimento", icone: "conversa", alerta: (fila ?? []).length > 0 },
    { rotulo: "Audiências hoje", valor: audHoje.length, href: "/audiencias", icone: "calendario" },
    { rotulo: atrasadas ? `Suas tarefas para hoje · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : "Suas tarefas para hoje", valor: (tarefas ?? []).length, href: "/tarefas?minhas=1", icone: "tarefa", alerta: atrasadas > 0 },
  ];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>{saudacao()}{perfil?.nome ? `, ${primeiroNome(perfil.nome)}` : ""}</h1>
          <p>{dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)}{agendadasHoje ? ` · ${agendadasHoje} mensage${agendadasHoje > 1 ? "ns programadas" : "m programada"} para hoje` : ""}</p>
        </div>
      </div>

      <div className="atalhos">
        {ATALHOS.map((a) => (
          <Link key={a.href} href={a.href} className="atalho"><Icone nome={a.icone} tamanho={18} /> {a.rotulo}</Link>
        ))}
        <span className="atalho-dica">ou <kbd>Ctrl</kbd>+<kbd>K</kbd> para buscar qualquer coisa</span>
      </div>

      <div className="grid kpis kpis-6">
        {numeros.map((n) => (
          <Link key={n.rotulo} href={n.href} className={"card kpi kpi-link" + (n.alerta ? " alerta" : "")}>
            <div className="lbl"><Icone nome={n.icone} tamanho={16} /> {n.rotulo}</div>
            <div className="val">{n.valor}</div>
          </Link>
        ))}
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="ctitle"><h3>Agenda</h3><Link href="/audiencias" className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>ver todas</Link></div>
          {audHoje.length + audProximas.length === 0 ? (
            <div className="vazio"><b>Nenhuma audiência nos próximos 7 dias</b>Bom momento para colocar os processos em dia.</div>
          ) : (
            <div className="list">
              {audHoje.length === 0 && <div className="dayhead" style={{ margin: "0 0 4px" }}>Hoje não há audiências · próximos dias</div>}
              {[...audHoje, ...audProximas].slice(0, 6).map((a) => {
                const cli = um(um(a.casos as Rel<{ titulo: string; clientes: Rel<{ id: string; nome: string }> }>)?.clientes ?? null);
                const ehHoje = a.inicio < fimHoje;
                return (
                  <Link className="li" key={a.id} href={cli ? `/clientes/${cli.id}` : "/audiencias"}>
                    <div className={"datebox" + (ehHoje ? " hoje" : "")}>
                      <small>{ehHoje ? "hoje" : new Date(a.inicio).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit" })}</small>
                      <b style={{ fontSize: 15 }}>{hora(a.inicio)}</b>
                    </div>
                    <div className="bd">
                      <b>{a.tipo}{cli ? ` · ${cli.nome}` : ""}</b>
                      <small>{a.local ?? (a.modalidade === "video" ? "por vídeo" : "local a definir")}</small>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="ctitle"><h3>Esperando resposta</h3><Link href="/atendimento" className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>abrir atendimento</Link></div>
          {(fila ?? []).length === 0 ? (
            <div className="vazio"><b>Ninguém esperando</b>Todas as conversas foram respondidas.</div>
          ) : (
            <div className="list">
              {(fila ?? []).map((c) => {
                const nome = um(c.clientes as Rel<{ nome: string }>)?.nome ?? "Contato";
                return (
                  <Link className="li" key={c.id} href={`/atendimento?c=${c.id}`}>
                    <span className="avatar" style={{ "--c": corDoNome(nome) } as React.CSSProperties}>{iniciais(nome)}</span>
                    <div className="bd"><b>{nome}</b><small>{um(c.areas as Rel<{ nome: string }>)?.nome ?? "área a definir"} · esperando {quando(c.ultima_mensagem_em)}</small></div>
                    {!c.atendente_id && <span className="chip warn">na fila</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="ctitle"><h3>Prazos vencendo nos próximos 7 dias</h3><Link href="/prazos" className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>abrir prazos</Link></div>
          {prazos7.length === 0 ? (
            <div className="vazio"><b>Nenhum prazo vencendo</b>Nada vence nos próximos 7 dias.</div>
          ) : (
            <div className="list">
              {prazos7.slice(0, 8).map((p) => {
                const cli = um(p.clientes as Rel<{ id: string; nome: string }>);
                const proc = um(p.processos as Rel<{ numero_cnj: string }>);
                const vencido = p.dia < hoje;
                const ehHoje = p.dia === hoje;
                const sem = new Date(`${p.dia}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short" }).replace(".", "");
                return (
                  <Link className="li" key={p.id} href="/prazos">
                    <div className={"datebox" + (vencido || ehHoje ? " prazo-urgente" : "")}>
                      <small>{vencido ? "vencido" : ehHoje ? "hoje" : sem}</small>
                      <b style={{ fontSize: 15 }}>{dataBR(p.dia).slice(0, 5)}</b>
                    </div>
                    <div className="bd">
                      <b>{p.descricao}{cli ? ` · ${cli.nome}` : ""}</b>
                      <small>{[proc?.numero_cnj, `interno ${dataBR(String(p.vence_interno).slice(0, 10)).slice(0, 5)}`].filter(Boolean).join(" · ")}</small>
                    </div>
                  </Link>
                );
              })}
              {prazos7.length > 8 && <Link href="/prazos" className="dayhead" style={{ margin: "6px 0 0", color: "var(--accent)" }}>e mais {prazos7.length - 8}</Link>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="ctitle"><h3>Suas tarefas</h3><Link href="/tarefas?minhas=1" className="tag" style={{ marginLeft: "auto", color: "var(--accent)" }}>todas</Link></div>
          {(tarefas ?? []).length === 0 ? (
            <div className="vazio"><b>Nada para hoje</b>Nenhuma tarefa sua vencendo hoje ou atrasada.</div>
          ) : (
            <div className="list">
              {(tarefas ?? []).map((t) => {
                const cli = um(t.clientes as Rel<{ id: string; nome: string }>);
                const atrasada = t.vence_em && t.vence_em < hoje;
                return (
                  <div className="li" key={t.id}>
                    <div className="bd">
                      <b>{t.titulo}</b>
                      <small>
                        {cli && <Link href={`/clientes/${cli.id}`} style={{ color: "inherit" }}>{cli.nome} · </Link>}
                        {t.vence_em ? (atrasada ? <span style={{ color: "var(--crit)" }}>atrasada · {dataBR(t.vence_em)}</span> : "vence hoje") : "sem data"}
                      </small>
                    </div>
                    <BotaoAcao acao={moverTarefa.bind(null, t.id, "concluida")} rotulo="Feito" desfazer={moverTarefa.bind(null, t.id, t.coluna)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
