import { Calendario } from "@/components/Calendario";
import type { AudienciaEditavel, ModeloDaAudiencia } from "@/components/EditarAudiencia";
import type { CompromissoEditavel } from "@/components/FormCompromisso";
import type { ProcessoOpcao } from "@/components/FormAudiencia";
import type { EventoCal, TipoCompromisso } from "@/lib/calendario";
import { eventosDaAgendaDoUsuario } from "@/lib/googleUsuario";
import { ehDeAudiencia, lerModelosMensagem, quandoEnviar } from "@/lib/modelosMensagem";
import { quemSou } from "@/lib/permissoes";
import { TZ } from "@/lib/rotulos";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);
const somar = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const horaSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const NOVOS = ["audiencia", "reuniao", "atendimento", "diligencia", "compromisso", "outro"];

// Calendário do escritório: audiências, reuniões, atendimentos, diligências, compromissos, prazos e tarefas.
// Substitui a antiga aba Audiências (que continua funcionando por aqui: agendar, editar, mensagens ao cliente).
export default async function PaginaCalendario({ searchParams }: { searchParams: Promise<{ d?: string; v?: string; nova?: string }> }) {
  const q = await searchParams;
  const { supabase, user } = await quemSou();
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const cursor = q.d && /^\d{4}-\d{2}-\d{2}$/.test(q.d) ? q.d : hoje;
  const visao = q.v === "semana" || q.v === "lista" ? q.v : "mes";
  const nova = q.nova === "1" ? "audiencia" : q.nova && NOVOS.includes(q.nova) ? q.nova : null;

  // Período carregado: o mês do cursor com folga (a grade do mês e a semana em volta do dia)
  const primeiro = `${cursor.slice(0, 7)}-01`;
  const [a, m] = cursor.split("-").map(Number);
  const ultimo = somar(new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10), -1);
  const de = [somar(primeiro, -7), somar(cursor, -7)].sort()[0];
  const ate = [somar(ultimo, 14), somar(cursor, 14)].sort()[1];
  const deIso = new Date(`${de}T00:00:00-03:00`).toISOString();
  const ateIso = new Date(`${ate}T23:59:59-03:00`).toISOString();

  const [auds, comps, prazos, tarefas, { data: procs }, { data: clientes }, { data: pessoas }, { modelos: modelosMensagem }, { data: msgs }] = await Promise.all([
    supabase
      .from("audiencias")
      .select("id, tipo, inicio, local, modalidade, observacoes, responsavel_id, perfis(nome), processos(numero_cnj), casos(titulo, clientes(id, nome))")
      .gte("inicio", deIso)
      .lte("inicio", ateIso)
      .order("inicio")
      .limit(1000),
    supabase
      .from("compromissos")
      .select("id, tipo, titulo, inicio, fim, local, observacoes, cliente_id, processo_id, responsavel_id, clientes(id, nome), processos(numero_cnj), perfis!compromissos_responsavel_id_fkey(nome)")
      .gte("inicio", deIso)
      .lte("inicio", ateIso)
      .order("inicio")
      .limit(1000),
    supabase
      .from("prazos")
      .select("id, descricao, vence_em, vence_interno, processos(numero_cnj), clientes(id, nome)")
      .eq("situacao", "aberto")
      .gte("vence_em", de)
      .lte("vence_em", ate)
      .limit(1000),
    supabase
      .from("tarefas")
      .select("id, titulo, vence_em, coluna, clientes(id, nome), responsavel:perfis!tarefas_responsavel_id_fkey(nome)")
      .neq("coluna", "concluida")
      .gte("vence_em", de)
      .lte("vence_em", ate)
      .limit(1000),
    supabase.from("processos").select("id, numero_cnj, vara, casos(clientes(nome))").order("criado_em", { ascending: false }).limit(3000),
    supabase.from("clientes").select("id, nome").order("nome").limit(3000),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    lerModelosMensagem(supabase),
    supabase.from("mensagens_agendadas").select("audiencia_id, enviar_em").eq("status", "programada").eq("automatico", true).not("audiencia_id", "is", null).limit(3000),
  ]);

  const eventos: EventoCal[] = [];
  const audiencias: Record<string, { aud: AudienciaEditavel; modelos: ModeloDaAudiencia[] }> = {};
  const compromissos: Record<string, CompromissoEditavel> = {};

  // Audiências, com o que o "Editar" precisa (modelos de mensagem já programados)
  const programadas = new Map<string, Set<number>>();
  for (const x of msgs ?? []) {
    if (!x.audiencia_id) continue;
    if (!programadas.has(x.audiencia_id)) programadas.set(x.audiencia_id, new Set());
    programadas.get(x.audiencia_id)!.add(new Date(x.enviar_em).getTime());
  }
  const modelosAud = modelosMensagem.filter((x) => ehDeAudiencia(x.gatilho));
  for (const r of auds.data ?? []) {
    const caso = um(r.casos as Rel<{ titulo: string; clientes: Rel<{ id: string; nome: string }> }>);
    const cli = um(caso?.clientes ?? null);
    const proc = um(r.processos as Rel<{ numero_cnj: string }>);
    const resp = um(r.perfis as Rel<{ nome: string }>);
    const hora = horaSP(r.inicio);
    eventos.push({
      chave: `a-${r.id}`,
      id: r.id,
      tipo: "audiencia",
      dia: diaSP(r.inicio),
      hora,
      titulo: `Audiência de ${String(r.tipo).toLowerCase()}`,
      detalhe: [proc?.numero_cnj, r.modalidade === "video" ? "por vídeo" : r.local, resp?.nome && `vai: ${resp.nome}`, r.observacoes].filter(Boolean).join(" · ") || null,
      cliente: cli,
      href: null,
    });
    const pend = programadas.get(r.id);
    audiencias[r.id] = {
      aud: {
        id: r.id,
        tipo: r.tipo,
        data: diaSP(r.inicio),
        hora,
        modalidade: r.modalidade,
        local: r.local,
        observacoes: r.observacoes,
        responsavel_id: r.responsavel_id,
        descricao: `${r.tipo} · ${cli?.nome ?? "Cliente"}${proc ? ` · ${proc.numero_cnj}` : ""}`,
      },
      modelos: modelosAud.map((mm) => {
        const qq = quandoEnviar(mm, r.inicio);
        const ms = qq ? new Date(`${qq.data}T${qq.hora}:00-03:00`).getTime() : NaN;
        return {
          id: mm.id,
          nome: mm.nome,
          quando: `${mm.dias === 0 ? "no dia" : `${mm.dias} ${mm.dias === 1 ? "dia" : "dias"} ${mm.gatilho === "antes_audiencia" ? "antes" : "depois"}`}, às ${mm.hora.replace(":00", "h")}`,
          marcado: Boolean(pend?.has(ms)),
        };
      }),
    };
  }

  // Reuniões, atendimentos, diligências, compromissos e outros
  const semTabela = Boolean(comps.error && /compromissos|does not exist|schema cache|relationship/i.test(comps.error.message));
  for (const r of comps.data ?? []) {
    const cli = um(r.clientes as Rel<{ id: string; nome: string }>);
    const proc = um(r.processos as Rel<{ numero_cnj: string }>);
    const resp = um(r.perfis as Rel<{ nome: string }>);
    const fim = r.fim ? horaSP(r.fim) : null;
    eventos.push({
      chave: `c-${r.id}`,
      id: r.id,
      tipo: r.tipo as TipoCompromisso,
      dia: diaSP(r.inicio),
      hora: horaSP(r.inicio),
      titulo: r.titulo,
      detalhe: [fim && `até ${fim}`, r.local, proc?.numero_cnj, resp?.nome && `vai: ${resp.nome}`, r.observacoes].filter(Boolean).join(" · ") || null,
      cliente: cli,
      href: null,
    });
    compromissos[r.id] = {
      id: r.id,
      tipo: r.tipo as TipoCompromisso,
      titulo: r.titulo,
      data: diaSP(r.inicio),
      hora: horaSP(r.inicio),
      duracao: r.fim ? Math.round((new Date(r.fim).getTime() - new Date(r.inicio).getTime()) / 60_000) : 60,
      local: r.local,
      observacoes: r.observacoes,
      cliente_id: r.cliente_id,
      processo_id: r.processo_id,
      responsavel_id: r.responsavel_id,
    };
  }

  // Prazos abertos (no dia do vencimento fatal) e tarefas com data
  for (const r of prazos.data ?? []) {
    const venc = String(r.vence_em).slice(0, 10);
    const proc = um(r.processos as Rel<{ numero_cnj: string }>);
    eventos.push({
      chave: `p-${r.id}`,
      id: r.id,
      tipo: "prazo",
      dia: venc,
      hora: null,
      titulo: `Prazo fatal: ${r.descricao}`,
      detalhe: [proc?.numero_cnj, `interno ${String(r.vence_interno).slice(0, 10).split("-").reverse().join("/").slice(0, 5)}`].filter(Boolean).join(" · "),
      cliente: um(r.clientes as Rel<{ id: string; nome: string }>),
      href: "/prazos",
      urgente: venc <= hoje,
    });
  }
  for (const r of tarefas.data ?? []) {
    const venc = String(r.vence_em).slice(0, 10);
    const resp = um(r.responsavel as Rel<{ nome: string }>);
    eventos.push({
      chave: `t-${r.id}`,
      id: r.id,
      tipo: "tarefa",
      dia: venc,
      hora: null,
      titulo: r.titulo,
      detalhe: resp?.nome ? `responsável: ${resp.nome}` : null,
      cliente: um(r.clientes as Rel<{ id: string; nome: string }>),
      href: user ? "/tarefas" : null,
      urgente: venc < hoje,
    });
  }

  // Eventos pessoais da agenda Google de quem está vendo (se ligou a Agenda em Meu perfil)
  const pessoais = user ? await eventosDaAgendaDoUsuario(user.id, de, ate).catch(() => null) : null;
  for (const g of pessoais ?? []) {
    const ini = g.start?.dateTime ?? g.start?.date;
    if (!ini) continue;
    const diaInteiro = !g.start?.dateTime;
    eventos.push({
      chave: `g-${g.id}`,
      id: g.id,
      tipo: "google",
      dia: diaInteiro ? ini.slice(0, 10) : diaSP(ini),
      hora: diaInteiro ? null : horaSP(ini),
      titulo: g.summary || "(sem título)",
      detalhe: [g.end?.dateTime && `até ${horaSP(g.end.dateTime)}`, g.location].filter(Boolean).join(" · ") || null,
      cliente: null,
      href: g.htmlLink ?? null,
    });
  }

  const processos: ProcessoOpcao[] = ((procs ?? []) as unknown as { id: string; numero_cnj: string; vara: string | null; casos: Rel<{ clientes: Rel<{ nome: string }> }> }[])
    .map((p) => ({ id: p.id, numero_cnj: p.numero_cnj, vara: p.vara, cliente: um(um(p.casos)?.clientes ?? null)?.nome ?? null }))
    .sort((x, y) => (x.cliente ?? "").localeCompare(y.cliente ?? "", "pt-BR"));

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Calendário</h1>
          <p>
            Audiências, reuniões, atendimentos, diligências, prazos e tarefas num lugar só. Audiências e compromissos entram na Google Agenda do
            escritório; as audiências também programam as mensagens ao cliente pelo WhatsApp.
          </p>
        </div>
      </div>
      {semTabela && <div className="aviso info" style={{ marginBottom: 16 }}>Falta rodar o script supabase/019_calendario_partes_vinculos.sql no Supabase para agendar reuniões e compromissos.</div>}
      {auds.error && <div className="aviso erro" style={{ marginBottom: 16 }}>Não foi possível carregar as audiências: {auds.error.message}</div>}
      <Calendario
        key={`${cursor}-${visao}`}
        eventos={eventos}
        audiencias={audiencias}
        compromissos={compromissos}
        janela={{ de, ate }}
        hoje={hoje}
        temGoogle={pessoais !== null}
        cursorInicial={cursor}
        visaoInicial={visao}
        novoInicial={nova as "audiencia" | TipoCompromisso | null}
        processos={processos}
        clientes={clientes ?? []}
        pessoas={pessoas ?? []}
        modelosMensagem={modelosMensagem}
      />
    </div>
  );
}
