import Link from "next/link";
import { EditarAudiencia, type ModeloDaAudiencia } from "@/components/EditarAudiencia";
import { ExcluirAudiencia } from "@/components/ExcluirAudiencia";
import { FormAudiencia, type ProcessoOpcao } from "@/components/FormAudiencia";
import { ehDeAudiencia, lerModelosMensagem, type ModeloMensagem, quandoEnviar } from "@/lib/modelosMensagem";
import { supabaseServer } from "@/lib/supabase/server";

const TZ = "America/Sao_Paulo";

type Audiencia = {
  id: string;
  tipo: string;
  inicio: string;
  local: string | null;
  modalidade: "presencial" | "video";
  observacoes: string | null;
  responsavel_id: string | null;
  perfis: { nome: string } | null;
  processos: { numero_cnj: string } | null;
  casos: { titulo: string; clientes: { id: string; nome: string } | null; areas: { nome: string; cor: string } | null } | null;
};

function diaTitulo(iso: string) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("sv-SE", { timeZone: TZ });
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const amanha = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: TZ });
  const extenso = d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  if (dia === hoje) return `Hoje · ${extenso}`;
  if (dia === amanha) return `Amanhã · ${extenso}`;
  return extenso;
}

type Apoio = { pessoas: { id: string; nome: string }[]; modelos: ModeloMensagem[]; programadas: Map<string, Set<number>> };

function Linha({ a, apoio }: { a: Audiencia; apoio: Apoio }) {
  const hora = new Date(a.inicio).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const cli = a.casos?.clientes ?? null;
  const cliente = cli?.nome ?? "Cliente";
  // Modelos de mensagem: marcado quando há uma mensagem ainda programada para o horário daquele modelo
  const pendentes = apoio.programadas.get(a.id);
  const modelos: ModeloDaAudiencia[] = apoio.modelos.map((m) => {
    const q = quandoEnviar(m, a.inicio);
    const ms = q ? new Date(`${q.data}T${q.hora}:00-03:00`).getTime() : NaN;
    return {
      id: m.id,
      nome: m.nome,
      quando: `${m.dias === 0 ? "no dia" : `${m.dias} ${m.dias === 1 ? "dia" : "dias"} ${m.gatilho === "antes_audiencia" ? "antes" : "depois"}`}, às ${m.hora.replace(":00", "h")}`,
      marcado: Boolean(pendentes?.has(ms)),
    };
  });
  return (
    <div className="li">
      <div className="hora">{hora}<small>{a.modalidade === "video" ? "vídeo" : "presencial"}</small></div>
      <div className="bd">
        <b>{a.tipo} · {cli ? <Link href={`/clientes/${cli.id}`} className="link-cliente">{cliente}</Link> : cliente}</b>
        <small>{[a.processos?.numero_cnj ?? a.casos?.titulo, a.local, a.perfis?.nome].filter(Boolean).join(" · ")}</small>
        {a.observacoes && <small style={{ color: "var(--dim)" }}>{a.observacoes}</small>}
      </div>
      {a.casos?.areas && <span className="chip area" style={{ "--c": a.casos.areas.cor } as React.CSSProperties}>{a.casos.areas.nome}</span>}
      <EditarAudiencia
        aud={{
          id: a.id,
          tipo: a.tipo,
          data: new Date(a.inicio).toLocaleDateString("sv-SE", { timeZone: TZ }),
          hora,
          modalidade: a.modalidade,
          local: a.local,
          observacoes: a.observacoes,
          responsavel_id: a.responsavel_id,
          descricao: `${a.tipo} · ${cliente}${a.processos ? ` · ${a.processos.numero_cnj}` : ""}`,
        }}
        pessoas={apoio.pessoas}
        modelos={modelos}
      />
      <ExcluirAudiencia id={a.id} descricao={`${a.tipo} · ${cliente}`} />
    </div>
  );
}

export default async function Audiencias({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const { nova } = await searchParams;
  const supabase = await supabaseServer();
  const inicioHoje = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: TZ })}T00:00:00-03:00`).toISOString();
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const campos = "id, tipo, inicio, local, modalidade, observacoes, responsavel_id, perfis(nome), processos(numero_cnj), casos(titulo, clientes(id, nome), areas(nome, cor))";

  const [{ data: proximas, error }, { data: passadas }, { data: procs }, { data: pessoas }, { modelos: modelosMensagem }, { data: msgs }] = await Promise.all([
    supabase.from("audiencias").select(campos).gte("inicio", inicioHoje).order("inicio").limit(300),
    supabase.from("audiencias").select(campos).lt("inicio", inicioHoje).gte("inicio", ha30).order("inicio", { ascending: false }).limit(100),
    supabase.from("processos").select("id, numero_cnj, vara, casos(clientes(nome))").order("criado_em", { ascending: false }).limit(3000),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    lerModelosMensagem(supabase),
    // Mensagens automáticas ainda por sair, para marcar no "Editar" os modelos que estão programados
    supabase.from("mensagens_agendadas").select("audiencia_id, enviar_em").eq("status", "programada").eq("automatico", true).not("audiencia_id", "is", null).limit(3000),
  ]);
  const programadas = new Map<string, Set<number>>();
  for (const m of msgs ?? []) {
    if (!m.audiencia_id) continue;
    if (!programadas.has(m.audiencia_id)) programadas.set(m.audiencia_id, new Set());
    programadas.get(m.audiencia_id)!.add(new Date(m.enviar_em).getTime());
  }
  const apoio: Apoio = { pessoas: pessoas ?? [], modelos: modelosMensagem.filter((m) => ehDeAudiencia(m.gatilho)), programadas };

  const lista = (proximas ?? []) as unknown as Audiencia[];
  const antigas = (passadas ?? []) as unknown as Audiencia[];
  const opcoes: ProcessoOpcao[] = ((procs ?? []) as unknown as { id: string; numero_cnj: string; vara: string | null; casos: { clientes: { nome: string } | null } | null }[])
    .map((p) => ({ id: p.id, numero_cnj: p.numero_cnj, vara: p.vara, cliente: p.casos?.clientes?.nome ?? null }))
    .sort((a, b) => (a.cliente ?? "").localeCompare(b.cliente ?? "", "pt-BR"));

  const porDia: { titulo: string; itens: Audiencia[] }[] = [];
  lista.forEach((a) => {
    const t = diaTitulo(a.inicio);
    const grupo = porDia.find((g) => g.titulo === t);
    if (grupo) grupo.itens.push(a);
    else porDia.push({ titulo: t, itens: [a] });
  });

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Audiências</h1>
          <p>
            Cada audiência entra na Google Agenda do escritório e programa mensagens ao cliente pelo WhatsApp, pelos modelos que você marcar
            ao cadastrar (os modelos ficam em Mensagens agendadas).
          </p>
        </div>
      </div>

      <details className="card novo" style={{ marginBottom: 16 }} open={Boolean(nova)}>
        <summary><span className="btn primary">+ Agendar audiência</span></summary>
        {opcoes.length === 0 ? (
          <div className="aviso info">Toda audiência fica ligada a um processo, e não há nenhum processo que você possa ver. Cadastre o processo em Processos (ou, se ele já existe, peça ao administrador para rodar o script supabase/014_equipe_ve_processos.sql).</div>
        ) : (
          <FormAudiencia processos={opcoes} pessoas={pessoas ?? []} modelosMensagem={modelosMensagem} />
        )}
      </details>

      {error && <div className="aviso erro" style={{ marginBottom: 16 }}>Não foi possível carregar as audiências: {error.message}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ctitle"><h3>Próximas</h3><span className="tag">{lista.length} {lista.length === 1 ? "audiência" : "audiências"}</span></div>
        {porDia.length === 0 ? (
          <div className="vazio"><b>Nenhuma audiência marcada</b>Use “+ Agendar audiência” para cadastrar a primeira.</div>
        ) : (
          porDia.map((g) => (
            <div key={g.titulo}>
              <div className="dayhead">{g.titulo}</div>
              <div className="list">{g.itens.map((a) => <Linha key={a.id} a={a} apoio={apoio} />)}</div>
            </div>
          ))
        )}
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Últimos 30 dias · {antigas.length}</summary>
        {antigas.length === 0 ? (
          <div className="vazio">Nenhuma audiência nos últimos 30 dias.</div>
        ) : (
          <div className="list" style={{ marginTop: 10 }}>{antigas.map((a) => <Linha key={a.id} a={a} apoio={apoio} />)}</div>
        )}
      </details>
    </div>
  );
}
