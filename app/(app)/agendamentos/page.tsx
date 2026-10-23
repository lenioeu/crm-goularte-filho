import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { CamposModeloMensagem } from "@/components/CamposModeloMensagem";
import { FormAcao } from "@/components/FormAcao";
import { FormAgendamento } from "@/components/FormAgendamento";
import { type DadosAudiencia, GATILHOS, lerModelosMensagem } from "@/lib/modelosMensagem";
import { TIPO_AGENDAMENTO, TZ } from "@/lib/rotulos";
import { supabaseServer } from "@/lib/supabase/server";
import { cancelarAgendamento, criarAgendamento, excluirModeloMensagem, reativarAgendamento, salvarModeloMensagem } from "./actions";

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
  const [{ data: clientes }, { data: programadas, error }, { data: recentes }, { modelos, tabela }, { data: auds }] = await Promise.all([
    supabase.from("clientes").select("id, nome").order("nome").limit(3000),
    supabase.from("mensagens_agendadas").select(campos).eq("status", "programada").order("enviar_em").limit(300),
    supabase.from("mensagens_agendadas").select(campos).neq("status", "programada").order("enviar_em", { ascending: false }).limit(20),
    lerModelosMensagem(supabase),
    supabase.from("audiencias").select("inicio, tipo, local, modalidade, processos(numero_cnj), casos(cliente_id)").gte("inicio", new Date().toISOString()).order("inicio").limit(500),
  ]);
  // Próxima audiência de cada cliente, para os modelos "antes/depois da audiência"
  const audiencias: Record<string, DadosAudiencia> = {};
  for (const a of (auds ?? []) as unknown as { inicio: string; tipo: string; local: string | null; modalidade: string; processos: { numero_cnj: string } | null; casos: { cliente_id: string } | null }[]) {
    const id = a.casos?.cliente_id;
    if (id && !audiencias[id]) audiencias[id] = { inicio: a.inicio, tipo: a.tipo, local: a.local, modalidade: a.modalidade, processo: a.processos?.numero_cnj ?? null };
  }
  const fila = (programadas ?? []) as unknown as Item[];

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Mensagens agendadas</h1>
          <p>
            Programe uma mensagem de WhatsApp para dia e hora certos, do zero ou por um modelo. As mensagens das audiências entram aqui
            sozinhas, pelos modelos marcados ao agendar a audiência.
          </p>
        </div>
      </div>

      <div className="grid cols-2e">
        <div className="card">
          <div className="ctitle"><h3>Nova mensagem</h3></div>
          <FormAgendamento action={criarAgendamento} clientes={clientes ?? []} clienteInicial={cliente} modelos={modelos} audiencias={audiencias} />
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

      <div className="card" id="modelos" style={{ marginTop: 16 }}>
        <div className="ctitle"><h3>Modelos de mensagem</h3><span className="tag">{modelos.length} {modelos.length === 1 ? "modelo" : "modelos"}</span></div>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13.5 }}>
          Mensagens prontas que já sabem quando sair. Os modelos ligados à audiência viram caixinhas no formulário de audiência; todos aparecem em
          “Usar modelo” aqui e no “Programar” da conversa.
        </p>
        {!tabela && <div className="aviso info" style={{ marginBottom: 12 }}>Estes são os modelos de fábrica. Para editar, criar ou apagar, rode o script supabase/013_modelos_mensagem.sql no Supabase.</div>}
        <div className="list">
          {modelos.map((m) => (
            <details key={m.id} className="li modelo-msg">
              <summary>
                <b>{m.nome}</b>
                <small>
                  {m.gatilho === "livre" ? "quando você escolher" : `${m.dias} ${GATILHOS.find((g) => g.id === m.gatilho)?.rotulo.replace("dias", m.dias === 1 ? "dia" : "dias")}`}
                  {m.gatilho !== "livre" && `, às ${m.hora}`}
                  {m.marcado && " · já vem marcado na audiência"}
                </small>
              </summary>
              <FormAcao action={salvarModeloMensagem} botao="Salvar modelo" className="form" limparAoSalvar={false}>
                <CamposModeloMensagem m={m} />
              </FormAcao>
              {tabela && (
                <div style={{ marginTop: 10 }}>
                  <BotaoAcao acao={excluirModeloMensagem.bind(null, m.id)} rotulo="Apagar modelo" className="btn sm perigo" confirmar={`Apagar o modelo “${m.nome}”?`} />
                </div>
              )}
            </details>
          ))}
        </div>
        {tabela && (
          <details className="ficha-novo" style={{ marginTop: 12 }}>
            <summary><span className="btn sm">+ Novo modelo</span></summary>
            <FormAcao action={salvarModeloMensagem} botao="Criar modelo" className="form" limparAoSalvar>
              <CamposModeloMensagem />
            </FormAcao>
          </details>
        )}
      </div>
    </div>
  );
}
