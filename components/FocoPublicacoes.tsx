"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { criarPrazo } from "@/app/(app)/prazos/actions";
import { audienciaDaPublicacao, darCiencia, tarefaDaPublicacao, voltarParaTratar } from "@/app/(app)/publicacoes/actions";
import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAcao } from "@/components/FormAcao";
import { FormPrazo } from "@/components/FormPrazo";
import { Icone } from "@/components/Icone";
import { TextoPublicacao } from "@/components/TextoPublicacao";
import { TIPOS_AUDIENCIA, TZ } from "@/lib/rotulos";

export type PubFoco = {
  id: string;
  numero_cnj: string | null;
  processo_id: string | null;
  publicada_em: string | null;
  disponibilizada_em: string | null;
  jornal: string | null;
  caderno: string | null;
  orgao: string | null;
  texto: string;
  link: string | null;
  tipo: "intimacao" | "audiencia" | "distribuicao" | "outro";
  audiencia_em: string | null;
  cliente: { id: string; nome: string } | null;
  audiencias: { tipo: string; inicio: string }[];
};

const TIPO: Record<PubFoco["tipo"], string> = { intimacao: "Intimação", audiencia: "Audiência", distribuicao: "Distribuição", outro: "Outra" };
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** "no prazo de 5 (cinco) dias" → 5. Só uma dica para o formulário; quem confirma é a pessoa. */
function prazoCitado(texto: string) {
  const m = texto.match(/prazo\s+(?:legal\s+|comum\s+)?de\s+(\d{1,3})\s*(?:\([^)]{0,30}\)\s*)?dias?(\s+(?:úteis|uteis|corridos))?/i);
  if (!m) return null;
  const dias = Number(m[1]);
  return dias > 0 && dias <= 120 ? { dias, corridos: /corridos/i.test(m[2] ?? "") } : null;
}

/** Sugestão de vencimento de tarefa: N dias úteis depois da publicação (só pula sábado e domingo). */
function maisDiasUteis(iso: string | null, n: number) {
  const d = new Date(`${iso ?? new Date().toLocaleDateString("sv-SE", { timeZone: TZ })}T12:00:00-03:00`);
  for (let i = 0; i < n; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) i++;
  }
  return d.toISOString().slice(0, 10);
}

// Modo foco (tema Órion): uma publicação por vez, com barra de progresso. Tratou (ciência, prazo, tarefa ou
// audiência), a próxima entra sozinha; "Pular" deixa para depois. Cada ação tem "Desfazer" no aviso do canto.
export function FocoPublicacoes({ pubs, pessoas, feriados }: { pubs: PubFoco[]; pessoas: { id: string; nome: string }[]; feriados: string[] }) {
  const [idx, setIdx] = useState(0);
  const maior = useRef(pubs.length);
  if (pubs.length > maior.current) maior.current = pubs.length;
  const total = maior.current;
  const feitas = total - pubs.length;
  const i = pubs.length ? Math.min(idx, pubs.length - 1) : 0;
  const atual = pubs[i];
  const proximas = pubs.length ? [...pubs.slice(i + 1), ...pubs.slice(0, i)] : [];

  return (
    <div className="orion">
      <div className="op-progresso">
        <div className="op-prog-linha">
          <b>{atual ? `Publicação ${feitas + 1} de ${total}` : "Tudo tratado"}</b>
          <span>{pubs.length ? `faltam ${pubs.length}` : `${total} ${total === 1 ? "tratada" : "tratadas"}`}</span>
        </div>
        <div className="op-barra" role="progressbar" aria-label="Publicações tratadas" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitas}>
          <i style={{ width: `${total ? Math.round((feitas / total) * 100) : 100}%` }} />
        </div>
      </div>

      {!atual ? (
        <div className="op-fim">
          <div className="op-fim-icone"><Icone nome="check" tamanho={34} /></div>
          <h2>Fila zerada</h2>
          <p>Nenhuma publicação esperando tratamento. As tratadas ficam na aba “Tratadas (30 dias)”.</p>
        </div>
      ) : (
        <div className="op-foco">
          <Cartao
            key={atual.id}
            p={atual}
            pessoas={pessoas}
            feriados={feriados}
            pular={pubs.length > 1 ? () => setIdx((i + 1) % pubs.length) : undefined}
          />
          <aside className="op-fila" aria-label="Próximas da fila">
            <h2>Na fila</h2>
            {proximas.length === 0 && <p className="op-dica">Esta é a última.</p>}
            {proximas.slice(0, 12).map((q) => (
              <button key={q.id} type="button" className="op-fila-item" onClick={() => setIdx(pubs.indexOf(q))}>
                <span className={`op-tipo t-${q.tipo}`}>{TIPO[q.tipo]}</span>
                <b>{q.cliente?.nome ?? "Processo não cadastrado"}</b>
                <span className="op-meta op-mono">{q.numero_cnj ?? "sem número"}</span>
              </button>
            ))}
            {proximas.length > 12 && <p className="op-dica">e mais {proximas.length - 12}</p>}
          </aside>
        </div>
      )}
    </div>
  );
}

type Painel = "prazo" | "tarefa" | "audiencia" | null;

function Cartao({ p, pessoas, feriados, pular }: { p: PubFoco; pessoas: { id: string; nome: string }[]; feriados: string[]; pular?: () => void }) {
  const [painel, setPainel] = useState<Painel>(null);
  const citado = prazoCitado(p.texto);
  const audData = p.audiencia_em ? new Date(p.audiencia_em).toLocaleDateString("sv-SE", { timeZone: TZ }) : "";
  const audHora = p.audiencia_em ? new Date(p.audiencia_em).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "";
  const alternar = (x: Painel) => setPainel((v) => (v === x ? null : x));

  return (
    <article className="op-cartao">
      <div className="op-cartao-topo">
        <span className={`op-tipo t-${p.tipo}`}>{TIPO[p.tipo]}</span>
        <span className="op-trib">{[p.jornal, p.caderno].filter(Boolean).join(" · ")}</span>
      </div>
      <div>
        <div className="op-proc">{p.numero_cnj ?? "sem número de processo"}</div>
        {p.orgao && <div className="op-meta-quebra">{p.orgao}</div>}
      </div>
      <div className="op-campos">
        <div className="op-campo">
          <small>Cliente</small>
          {p.cliente ? (
            <Link href={`/clientes/${p.cliente.id}`} className="link-cliente">{p.cliente.nome}</Link>
          ) : p.numero_cnj ? (
            <span className="op-nao-cad">Não cadastrado · <Link href={`/processos?nova=1&numero=${encodeURIComponent(p.numero_cnj)}`}>cadastrar</Link></span>
          ) : (
            <b>—</b>
          )}
        </div>
        <div className="op-campo"><small>Disponibilizada</small><b>{dataBR(p.disponibilizada_em)}</b></div>
        <div className="op-campo"><small>Publicada</small><b>{dataBR(p.publicada_em)}</b></div>
      </div>

      <TextoPublicacao texto={p.texto} />

      {p.tipo === "audiencia" && p.audiencia_em && (
        <div className="op-alerta">
          <Icone nome="calendario" tamanho={18} />
          <span>
            Audiência encontrada no texto: <b>{dataBR(audData)} às {audHora}</b>.
            {p.audiencias.length > 0 && <> Já há no Órion: {p.audiencias.map((a) => `${a.tipo} em ${new Date(a.inicio).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`).join("; ")}. Se for a mesma, edite em Audiências.</>}
          </span>
        </div>
      )}
      {citado && p.tipo !== "distribuicao" && (
        <div className="op-sugestao">
          <small>O texto cita prazo</small>
          <b>{citado.dias} {citado.dias === 1 ? "dia" : "dias"}{citado.corridos ? " corridos" : ""}</b>
          <span>Em “Criar prazo” o Órion já preenche e mostra o vencimento fatal e o interno.</span>
        </div>
      )}
      {p.tipo === "distribuicao" && <p className="op-dica">Distribuição normalmente não abre prazo: basta dar ciência.</p>}

      <div className="op-acoes-foco">
        <BotaoAcao acao={darCiencia.bind(null, p.id)} rotulo="Dar ciência" desfazer={voltarParaTratar.bind(null, p.id)} className="btn op-pri" />
        {p.tipo === "audiencia" && p.processo_id ? (
          <button type="button" className={"btn op-ouro" + (painel === "audiencia" ? " on" : "")} aria-expanded={painel === "audiencia"} onClick={() => alternar("audiencia")}>Agendar audiência</button>
        ) : p.tipo !== "distribuicao" ? (
          <button type="button" className={"btn op-ouro" + (painel === "prazo" ? " on" : "")} aria-expanded={painel === "prazo"} onClick={() => alternar("prazo")}>Criar prazo</button>
        ) : null}
        {pular && <button type="button" className="btn" onClick={pular}>Pular</button>}
      </div>
      <div className="op-acoes-sec">
        {p.tipo === "audiencia" && p.processo_id && (
          <button type="button" className={"btn sm" + (painel === "prazo" ? " on" : "")} aria-expanded={painel === "prazo"} onClick={() => alternar("prazo")}>Criar prazo</button>
        )}
        {p.tipo !== "audiencia" && p.processo_id && (
          <button type="button" className={"btn sm" + (painel === "audiencia" ? " on" : "")} aria-expanded={painel === "audiencia"} onClick={() => alternar("audiencia")}>Agendar audiência</button>
        )}
        <button type="button" className={"btn sm" + (painel === "tarefa" ? " on" : "")} aria-expanded={painel === "tarefa"} onClick={() => alternar("tarefa")}>Criar tarefa</button>
        {p.link && <a className="btn sm" href={p.link} target="_blank" rel="noopener">Abrir no PJe</a>}
      </div>

      {painel === "prazo" && (
        <div className="op-painel">
          <FormPrazo
            action={criarPrazo}
            inicial={{ processo_id: p.processo_id, publicacao_id: p.id, publicado_em: p.publicada_em ?? p.disponibilizada_em, ...(citado ? { descricao: "Manifestação", dias: citado.dias, contagem: citado.corridos ? "corridos" : "uteis" } : {}) }}
            processos={p.processo_id ? undefined : []}
            pessoas={pessoas}
            feriados={feriados}
            botao="Criar prazo"
          />
        </div>
      )}
      {painel === "tarefa" && (
        <div className="op-painel">
          <FormAcao action={tarefaDaPublicacao} botao="Criar tarefa" className="form form-compacto">
            <input type="hidden" name="id" value={p.id} />
            <div className="field full"><label htmlFor={`ft_t_${p.id}`}>O que fazer</label><input id={`ft_t_${p.id}`} name="titulo" required defaultValue={`${TIPO[p.tipo]}: ${p.numero_cnj ?? ""}${p.cliente ? ` · ${p.cliente.nome}` : ""}`} /></div>
            <div className="field"><label htmlFor={`ft_v_${p.id}`}>Até quando</label><input id={`ft_v_${p.id}`} name="vence_em" type="date" defaultValue={maisDiasUteis(p.publicada_em, 5)} /><small className="dica">Sugestão: 5 dias úteis após a publicação. Confira o prazo real.</small></div>
            <div className="field">
              <label htmlFor={`ft_r_${p.id}`}>Responsável</label>
              <select id={`ft_r_${p.id}`} name="responsavel_id" defaultValue="">
                <option value="">Eu</option>
                {pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </div>
          </FormAcao>
        </div>
      )}
      {painel === "audiencia" && p.processo_id && (
        <div className="op-painel">
          <FormAcao action={audienciaDaPublicacao} botao="Agendar audiência" className="form form-compacto">
            <input type="hidden" name="publicacao_id" value={p.id} />
            <input type="hidden" name="processo_id" value={p.processo_id} />
            <div className="field">
              <label htmlFor={`fa_t_${p.id}`}>Tipo</label>
              <select id={`fa_t_${p.id}`} name="tipo" defaultValue={TIPOS_AUDIENCIA[0]}>{TIPOS_AUDIENCIA.map((t) => <option key={t}>{t}</option>)}</select>
            </div>
            <div className="field"><label htmlFor={`fa_d_${p.id}`}>Dia</label><input id={`fa_d_${p.id}`} name="data" type="date" required defaultValue={audData} /></div>
            <div className="field"><label htmlFor={`fa_h_${p.id}`}>Hora</label><input id={`fa_h_${p.id}`} name="hora" type="time" required defaultValue={audHora} /></div>
            <div className="field">
              <label htmlFor={`fa_m_${p.id}`}>Modalidade</label>
              <select id={`fa_m_${p.id}`} name="modalidade" defaultValue="presencial"><option value="presencial">Presencial</option><option value="video">Por vídeo</option></select>
            </div>
            <div className="field full"><label htmlFor={`fa_l_${p.id}`}>Local</label><input id={`fa_l_${p.id}`} name="local" defaultValue={p.orgao?.split(" - ").slice(-1)[0] ?? ""} /></div>
            <small className="dica full">Mensagens ao cliente pelo WhatsApp: programe pelo “Editar” da audiência, em Audiências.</small>
          </FormAcao>
        </div>
      )}
    </article>
  );
}
