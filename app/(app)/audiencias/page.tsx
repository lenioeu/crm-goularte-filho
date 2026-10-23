import { ExcluirAudiencia } from "@/components/ExcluirAudiencia";
import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { criarAudiencia } from "../actions";

const TZ = "America/Sao_Paulo";
const TIPOS = ["Conciliação", "Instrução", "Instrução e julgamento", "Una", "Inicial", "Perícia", "Custódia", "Sessão de julgamento"];

type Audiencia = {
  id: string;
  tipo: string;
  inicio: string;
  local: string | null;
  modalidade: "presencial" | "video";
  observacoes: string | null;
  perfis: { nome: string } | null;
  casos: { titulo: string; clientes: { nome: string } | null; areas: { nome: string; cor: string } | null } | null;
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

function Linha({ a }: { a: Audiencia }) {
  const hora = new Date(a.inicio).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const cliente = a.casos?.clientes?.nome ?? "Cliente";
  return (
    <div className="li">
      <div className="hora">{hora}<small>{a.modalidade === "video" ? "vídeo" : "presencial"}</small></div>
      <div className="bd">
        <b>{a.tipo} · {cliente}</b>
        <small>{[a.casos?.titulo, a.local, a.perfis?.nome].filter(Boolean).join(" · ")}</small>
        {a.observacoes && <small style={{ color: "var(--dim)" }}>{a.observacoes}</small>}
      </div>
      {a.casos?.areas && <span className="chip area" style={{ "--c": a.casos.areas.cor } as React.CSSProperties}>{a.casos.areas.nome}</span>}
      <ExcluirAudiencia id={a.id} descricao={`${a.tipo} · ${cliente}`} />
    </div>
  );
}

export default async function Audiencias({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const { nova } = await searchParams;
  const supabase = await supabaseServer();
  const inicioHoje = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: TZ })}T00:00:00-03:00`).toISOString();
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const campos = "id, tipo, inicio, local, modalidade, observacoes, perfis(nome), casos(titulo, clientes(nome), areas(nome, cor))";

  const [{ data: proximas, error }, { data: passadas }, { data: casos }, { data: pessoas }] = await Promise.all([
    supabase.from("audiencias").select(campos).gte("inicio", inicioHoje).order("inicio").limit(300),
    supabase.from("audiencias").select(campos).lt("inicio", inicioHoje).gte("inicio", ha30).order("inicio", { ascending: false }).limit(100),
    supabase.from("casos").select("id, titulo, clientes(nome)").neq("etapa", "nao_viavel").order("atualizado_em", { ascending: false }).limit(1000),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const lista = (proximas ?? []) as unknown as Audiencia[];
  const antigas = (passadas ?? []) as unknown as Audiencia[];
  const listaCasos = (casos ?? []) as unknown as { id: string; titulo: string; clientes: { nome: string } | null }[];

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
            Cada audiência entra na Google Agenda do escritório e programa lembretes ao cliente pelo WhatsApp: 3 dias antes, às 10h, e na
            véspera, às 18h (dá para desmarcar qualquer um ao cadastrar).
          </p>
        </div>
      </div>

      <details className="card novo" style={{ marginBottom: 16 }} open={Boolean(nova)}>
        <summary><span className="btn primary">+ Agendar audiência</span></summary>
        {listaCasos.length === 0 ? (
          <div className="aviso info">Toda audiência fica ligada a um caso. Crie o caso primeiro no Funil de casos.</div>
        ) : (
          <FormAcao action={criarAudiencia} botao="Agendar audiência" className="form">
            <div className="field full">
              <label htmlFor="caso_id">Caso</label>
              <select id="caso_id" name="caso_id" required defaultValue="">
                <option value="" disabled>Escolha o caso</option>
                {listaCasos.map((c) => <option key={c.id} value={c.id}>{c.clientes?.nome} · {c.titulo}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" name="tipo" defaultValue="Conciliação">
                {TIPOS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="tipo_outro">Outro tipo (opcional)</label><input id="tipo_outro" name="tipo_outro" placeholder="se não estiver na lista" /></div>
            <div className="field"><label htmlFor="data">Dia</label><input id="data" name="data" type="date" required /></div>
            <div className="field"><label htmlFor="hora">Hora</label><input id="hora" name="hora" type="time" required /></div>
            <div className="field">
              <label htmlFor="modalidade">Modalidade</label>
              <select id="modalidade" name="modalidade" defaultValue="presencial">
                <option value="presencial">Presencial</option>
                <option value="video">Por vídeo</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="responsavel_id">Quem vai</label>
              <select id="responsavel_id" name="responsavel_id" defaultValue="">
                <option value="">A definir</option>
                {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="field full"><label htmlFor="local">Local</label><input id="local" name="local" placeholder="ex.: 2ª Vara do Trabalho de Vitória · sala 3" /></div>
            <div className="field full"><label htmlFor="observacoes">Observações</label><textarea id="observacoes" name="observacoes" rows={2} placeholder="ex.: levar testemunhas; cliente confirmou presença" /></div>
            <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" name="lembrete3" defaultChecked style={{ width: 18, height: 18 }} /> Lembrete ao cliente 3 dias antes, às 10h
            </label>
            <label className="full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" name="lembrete" defaultChecked style={{ width: 18, height: 18 }} /> Lembrete ao cliente na véspera, às 18h
            </label>
          </FormAcao>
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
              <div className="list">{g.itens.map((a) => <Linha key={a.id} a={a} />)}</div>
            </div>
          ))
        )}
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Últimos 30 dias · {antigas.length}</summary>
        {antigas.length === 0 ? (
          <div className="vazio">Nenhuma audiência nos últimos 30 dias.</div>
        ) : (
          <div className="list" style={{ marginTop: 10 }}>{antigas.map((a) => <Linha key={a.id} a={a} />)}</div>
        )}
      </details>
    </div>
  );
}
