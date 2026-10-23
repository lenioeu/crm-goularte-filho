import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAgendamento } from "@/components/FormAgendamento";
import { TIPO_AGENDAMENTO, TZ } from "@/lib/rotulos";
import { supabaseServer } from "@/lib/supabase/server";
import { cancelarAgendamento, criarAgendamento, reativarAgendamento } from "./actions";

type Item = {
  id: string;
  tipo: string;
  texto: string;
  enviar_em: string;
  status: string;
  automatico: boolean;
  cancelar_se_responder: boolean;
  erro: string | null;
  clientes: { id: string; nome: string } | null;
};

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  enviada: { rotulo: "enviada", classe: "good" },
  cancelada: { rotulo: "cancelada", classe: "" },
  falhou: { rotulo: "falhou", classe: "crit" },
};

function quando(iso: string) {
  const d = new Date(iso);
  return {
    dia: d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }),
    hora: d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }),
  };
}

function Linha({ m, cancelavel }: { m: Item; cancelavel: boolean }) {
  const q = quando(m.enviar_em);
  return (
    <div className="li">
      <div className="datebox" style={{ width: 70 }}><small>{q.dia}</small><b style={{ fontSize: 15 }}>{q.hora}</b></div>
      <div className="bd">
        <b>{m.clientes ? <Link href={`/clientes/${m.clientes.id}`}>{m.clientes.nome}</Link> : "Cliente"}</b>
        <small style={{ whiteSpace: "pre-line" }}>{m.texto.length > 160 ? m.texto.slice(0, 160) + "…" : m.texto}</small>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
          <span className={"chip" + (m.tipo === "follow_up" ? " warn" : m.tipo === "lembrete_audiencia" ? " acc" : "")}>{TIPO_AGENDAMENTO[m.tipo]}</span>
          {m.automatico && <span className="chip">automático</span>}
          {m.cancelar_se_responder && <span className="chip">cancela se responder</span>}
          {!cancelavel && STATUS[m.status] && <span className={`chip ${STATUS[m.status].classe}`}>{STATUS[m.status].rotulo}</span>}
          {m.erro && <span className="chip crit">{m.erro}</span>}
        </div>
      </div>
      {cancelavel && <BotaoAcao acao={cancelarAgendamento.bind(null, m.id)} rotulo="Cancelar" desfazer={reativarAgendamento.bind(null, m.id)} />}
    </div>
  );
}

export default async function Agendamentos({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const supabase = await supabaseServer();
  const campos = "id, tipo, texto, enviar_em, status, automatico, cancelar_se_responder, erro, clientes(id, nome)";
  const [{ data: clientes }, { data: programadas, error }, { data: recentes }] = await Promise.all([
    supabase.from("clientes").select("id, nome").order("nome").limit(3000),
    supabase.from("mensagens_agendadas").select(campos).eq("status", "programada").order("enviar_em").limit(300),
    supabase.from("mensagens_agendadas").select(campos).neq("status", "programada").order("enviar_em", { ascending: false }).limit(20),
  ]);
  const fila = (programadas ?? []) as unknown as Item[];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Mensagens agendadas</h1>
          <p>
            Programe uma mensagem de WhatsApp para dia e hora certos. Os lembretes da véspera das audiências entram aqui sozinhos.
            Os envios começam quando o WhatsApp do escritório for ligado ao sistema.
          </p>
        </div>
      </div>

      <div className="grid cols-2e">
        <div className="card">
          <div className="ctitle"><h3>Nova mensagem</h3></div>
          <FormAgendamento action={criarAgendamento} clientes={clientes ?? []} clienteInicial={cliente} />
          <p style={{ fontSize: 12, color: "var(--dim)", margin: "12px 0 0" }}>
            Follow-up é só para quem procurou o escritório: mensagem para quem nunca fez contato esbarra na regra da OAB contra captação de clientes.
          </p>
        </div>
        <div className="card">
          <div className="ctitle"><h3>Programadas</h3><span className="tag">{fila.length} a enviar</span></div>
          {error && <div className="aviso erro">{error.message}</div>}
          {fila.length === 0 ? <div className="vazio">Nenhuma mensagem programada.</div> : <div className="list">{fila.map((m) => <Linha key={m.id} m={m} cancelavel />)}</div>}
          {(recentes ?? []).length > 0 && (
            <>
              <div className="dayhead" style={{ marginTop: 18 }}>Últimas enviadas ou canceladas</div>
              <div className="list">{(recentes as unknown as Item[]).map((m) => <Linha key={m.id} m={m} cancelavel={false} />)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
