"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { moverTarefa } from "@/app/(app)/actions";
import { excluirCompromisso } from "@/app/(app)/calendario/actions";
import { BotaoAcao } from "@/components/BotaoAcao";
import { EditarAudiencia, type AudienciaEditavel, type ModeloDaAudiencia } from "@/components/EditarAudiencia";
import { ExcluirAudiencia } from "@/components/ExcluirAudiencia";
import { FormAudiencia, type ProcessoOpcao } from "@/components/FormAudiencia";
import { type CompromissoEditavel, FormCompromisso } from "@/components/FormCompromisso";
import { Icone } from "@/components/Icone";
import { corDoTipo, type EventoCal, rotuloDoTipo, TIPOS_COMPROMISSO, TIPOS_EVENTO, type TipoCompromisso, type TipoEvento } from "@/lib/calendario";
import type { ModeloMensagem } from "@/lib/modelosMensagem";

type Visao = "mes" | "semana" | "lista";
type Novo = "audiencia" | TipoCompromisso;

const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const somar = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaSemana = (s: string) => (new Date(`${s}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
const inicioSemana = (s: string) => somar(s, -diaSemana(s));
const extenso = (s: string) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

const FILTRO_SALVO = "orion-cal-filtro";

export function Calendario({
  eventos,
  audiencias,
  compromissos,
  janela,
  hoje,
  temGoogle = false,
  cursorInicial,
  visaoInicial,
  novoInicial,
  processos,
  clientes,
  pessoas,
  modelosMensagem,
}: {
  eventos: EventoCal[];
  audiencias: Record<string, { aud: AudienciaEditavel; modelos: ModeloDaAudiencia[] }>;
  compromissos: Record<string, CompromissoEditavel>;
  janela: { de: string; ate: string };
  hoje: string;
  temGoogle?: boolean;
  cursorInicial: string;
  visaoInicial: Visao;
  novoInicial: Novo | null;
  processos: ProcessoOpcao[];
  clientes: { id: string; nome: string }[];
  pessoas: { id: string; nome: string }[];
  modelosMensagem: ModeloMensagem[];
}) {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>(visaoInicial);
  const [cursor, setCursor] = useState(cursorInicial);
  const [diaSel, setDiaSel] = useState(cursorInicial);
  const [ocultos, setOcultos] = useState<Set<TipoEvento>>(new Set());
  const [novo, setNovo] = useState<{ tipo: Novo; dia: string } | null>(novoInicial ? { tipo: novoInicial, dia: cursorInicial } : null);
  const [editando, setEditando] = useState<string | null>(null);

  // Filtro de tipos lembrado neste aparelho
  useEffect(() => {
    try {
      const s = localStorage.getItem(FILTRO_SALVO);
      if (s) setOcultos(new Set(JSON.parse(s) as TipoEvento[]));
    } catch {}
  }, []);
  function alternarTipo(t: TipoEvento) {
    setOcultos((o) => {
      const n = new Set(o);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      try {
        localStorage.setItem(FILTRO_SALVO, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  }

  useEffect(() => {
    if (!novo && !editando) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setNovo(null);
      setEditando(null);
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [novo, editando]);

  const visiveis = useMemo(() => eventos.filter((e) => !ocultos.has(e.tipo)), [eventos, ocultos]);
  const porDia = useMemo(() => {
    const m = new Map<string, EventoCal[]>();
    for (const e of visiveis) m.set(e.dia, [...(m.get(e.dia) ?? []), e]);
    for (const l of m.values()) l.sort((a, b) => (a.hora ?? "00:00").localeCompare(b.hora ?? "00:00"));
    return m;
  }, [visiveis]);

  // Navegação: dentro do período já carregado muda na hora; fora dele, pede ao servidor
  function irPara(dia: string, v: Visao = visao) {
    const mesFora = dia.slice(0, 7) !== cursorInicial.slice(0, 7);
    const semanaFora = v === "semana" && (inicioSemana(dia) < janela.de || somar(inicioSemana(dia), 6) > janela.ate);
    setCursor(dia);
    setDiaSel(dia);
    setVisao(v);
    if ((v !== "semana" && mesFora) || semanaFora) router.push(`/calendario?d=${dia}&v=${v}`, { scroll: false });
  }
  function passo(n: number) {
    if (visao === "semana") return irPara(somar(cursor, 7 * n));
    const [a, m] = cursor.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    irPara(d.toISOString().slice(0, 10));
  }

  const [ano, mes] = cursor.split("-").map(Number);
  const titulo = visao === "semana"
    ? (() => {
        const i = inicioSemana(cursor);
        const f = somar(i, 6);
        return `${Number(i.slice(8))} ${MESES[Number(i.slice(5, 7)) - 1].slice(0, 3)} – ${Number(f.slice(8))} ${MESES[Number(f.slice(5, 7)) - 1].slice(0, 3)} ${f.slice(0, 4)}`;
      })()
    : `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} de ${ano}`;

  // Grade do mês: começa na segunda-feira da semana do dia 1º
  const primeiro = `${cursor.slice(0, 7)}-01`;
  const gradeInicio = inicioSemana(primeiro);
  const ultimoDoMes = somar(`${new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 7)}-01`, -1);
  const semanas = Math.ceil((diaSemana(primeiro) + Number(ultimoDoMes.slice(8))) / 7);
  const dias = Array.from({ length: semanas * 7 }, (_, i) => somar(gradeInicio, i));
  const diasSemana = Array.from({ length: 7 }, (_, i) => somar(inicioSemana(cursor), i));
  const diasLista = [...porDia.keys()].filter((d) => d.slice(0, 7) === cursor.slice(0, 7)).sort();

  function Chip({ e, compacto = false }: { e: EventoCal; compacto?: boolean }) {
    return (
      <span className={"cal-chip" + (e.urgente ? " urgente" : "")} style={{ "--c": corDoTipo(e.tipo) } as React.CSSProperties} title={`${rotuloDoTipo(e.tipo)} · ${e.titulo}`}>
        <i aria-hidden="true" />
        {e.hora && <b>{e.hora}</b>}
        <span>{compacto ? e.titulo : `${e.titulo}${e.cliente ? ` · ${e.cliente.nome}` : ""}`}</span>
      </span>
    );
  }

  function Evento({ e }: { e: EventoCal }) {
    const aud = e.tipo === "audiencia" ? audiencias[e.id] : null;
    const comp = compromissos[e.id] && e.tipo !== "audiencia" && e.tipo !== "prazo" && e.tipo !== "tarefa" ? compromissos[e.id] : null;
    return (
      <div className={"cal-evento" + (e.urgente ? " urgente" : "")} style={{ "--c": corDoTipo(e.tipo) } as React.CSSProperties}>
        <div className="cal-ev-hora">{e.hora ?? "dia todo"}</div>
        <div className="cal-ev-corpo">
          <span className="cal-ev-tipo">{rotuloDoTipo(e.tipo)}</span>
          <b>{e.titulo}</b>
          {e.cliente && <Link href={`/clientes/${e.cliente.id}`} className="link-cliente">{e.cliente.nome}</Link>}
          {e.detalhe && <small>{e.detalhe}</small>}
          <div className="cal-ev-acoes">
            {aud && (
              <>
                <EditarAudiencia aud={aud.aud} pessoas={pessoas} modelos={aud.modelos} />
                <ExcluirAudiencia id={e.id} descricao={aud.aud.descricao} />
              </>
            )}
            {comp && (
              <>
                <button type="button" className="linkbtn editar" onClick={() => setEditando(e.id)}>Editar</button>
                <BotaoAcao acao={excluirCompromisso.bind(null, e.id)} rotulo="Excluir" className="linkbtn" confirmar={`Excluir “${e.titulo}”? Sai também da Google Agenda.`} />
              </>
            )}
            {e.tipo === "tarefa" && <BotaoAcao acao={moverTarefa.bind(null, e.id, "concluida")} rotulo="Feito" />}
            {e.href && (e.tipo === "prazo" || e.tipo === "tarefa") && <Link href={e.href} className="linkbtn editar">Abrir</Link>}
            {e.href && e.tipo === "google" && <a href={e.href} target="_blank" rel="noopener" className="linkbtn editar">Abrir no Google</a>}
          </div>
        </div>
      </div>
    );
  }

  const doDia = porDia.get(diaSel) ?? [];
  const compEditando = editando ? compromissos[editando] : null;

  return (
    <div className="cal">
      <div className="cal-barra">
        <div className="cal-nav">
          <button type="button" className="btn sm" onClick={() => irPara(hoje)}>Hoje</button>
          <button type="button" className="hbtn-claro" onClick={() => passo(-1)} aria-label={visao === "semana" ? "Semana anterior" : "Mês anterior"}>‹</button>
          <button type="button" className="hbtn-claro" onClick={() => passo(1)} aria-label={visao === "semana" ? "Próxima semana" : "Próximo mês"}>›</button>
          <h2 className="cal-titulo">{titulo}</h2>
        </div>
        <div className="cal-visoes" role="group" aria-label="Visualização">
          {(["mes", "semana", "lista"] as Visao[]).map((v) => (
            <button key={v} type="button" className={visao === v ? "on" : ""} aria-pressed={visao === v} onClick={() => irPara(cursor, v)}>
              {v === "mes" ? "Mês" : v === "semana" ? "Semana" : "Lista"}
            </button>
          ))}
        </div>
        <button type="button" className="btn primary" onClick={() => setNovo({ tipo: "audiencia", dia: diaSel })}>+ Novo</button>
      </div>

      <div className="cal-filtros" role="group" aria-label="Tipos de evento">
        {TIPOS_EVENTO.filter((t) => t.id !== "google" || temGoogle).map((t) => (
          <label key={t.id} className={"cal-filtro" + (ocultos.has(t.id) ? " off" : "")} style={{ "--c": t.cor } as React.CSSProperties}>
            <input type="checkbox" checked={!ocultos.has(t.id)} onChange={() => alternarTipo(t.id)} />
            <i aria-hidden="true" />
            {t.rotulo}
          </label>
        ))}
      </div>

      <div className={"cal-corpo v-" + visao}>
        <div className="cal-principal">
          {visao === "mes" && (
            <div className="cal-mes">
              {SEMANA.map((s) => <div key={s} className="cal-cab">{s}</div>)}
              {dias.map((d) => {
                const evs = porDia.get(d) ?? [];
                const fora = d.slice(0, 7) !== cursor.slice(0, 7);
                return (
                  <button
                    key={d}
                    type="button"
                    className={"cal-dia" + (fora ? " fora" : "") + (d === hoje ? " hoje" : "") + (d === diaSel ? " sel" : "")}
                    onClick={() => setDiaSel(d)}
                    onDoubleClick={() => setNovo({ tipo: "audiencia", dia: d })}
                    aria-label={`${extenso(d)}: ${evs.length ? `${evs.length} ${evs.length > 1 ? "eventos" : "evento"}` : "livre"}`}
                  >
                    <span className="cal-num">{Number(d.slice(8))}</span>
                    <span className="cal-chips">
                      {evs.slice(0, 3).map((e) => <Chip key={e.chave} e={e} compacto />)}
                      {evs.length > 3 && <span className="cal-mais">+{evs.length - 3}</span>}
                    </span>
                    <span className="cal-pontos" aria-hidden="true">
                      {evs.slice(0, 5).map((e) => <i key={e.chave} style={{ background: corDoTipo(e.tipo) }} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {visao === "semana" && (
            <div className="cal-semana">
              {diasSemana.map((d, i) => {
                const evs = porDia.get(d) ?? [];
                return (
                  <section key={d} className={"cal-col" + (d === hoje ? " hoje" : "") + (d === diaSel ? " sel" : "")}>
                    <button type="button" className="cal-col-cab" onClick={() => setDiaSel(d)}>
                      <small>{SEMANA[i]}</small>
                      <b>{Number(d.slice(8))}</b>
                    </button>
                    <div className="cal-col-evs">
                      {evs.length === 0 ? <span className="cal-livre">livre</span> : evs.map((e) => (
                        <button key={e.chave} type="button" className="cal-col-ev" onClick={() => setDiaSel(d)}><Chip e={e} /></button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {visao === "lista" && (
            <div className="cal-lista">
              {diasLista.length === 0 ? (
                <div className="vazio"><b>Nada neste mês</b>Use “+ Novo” para agendar.</div>
              ) : (
                diasLista.map((d) => (
                  <section key={d}>
                    <div className={"dayhead" + (d === hoje ? " hoje" : "")}>{d === hoje ? "Hoje · " : ""}{extenso(d)}</div>
                    {(porDia.get(d) ?? []).map((e) => <Evento key={e.chave} e={e} />)}
                  </section>
                ))
              )}
            </div>
          )}
        </div>

        {visao !== "lista" && (
          <aside className="cal-lado" aria-label="Dia escolhido">
            <div className="cal-lado-cab">
              <h3>{diaSel === hoje ? "Hoje" : extenso(diaSel).split(",")[0]}</h3>
              <small>{extenso(diaSel).split(", ").slice(1).join(", ")}</small>
              <button type="button" className="btn sm" onClick={() => setNovo({ tipo: "audiencia", dia: diaSel })}>+ Neste dia</button>
            </div>
            {doDia.length === 0 ? (
              <p className="vazio" style={{ padding: "14px 4px" }}>Nada marcado neste dia.</p>
            ) : (
              doDia.map((e) => <Evento key={e.chave} e={e} />)
            )}
          </aside>
        )}
      </div>

      {novo && (
        <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && setNovo(null)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-label="Novo evento">
            <div className="ctitle">
              <h3>Novo · {extenso(novo.dia)}</h3>
              <button type="button" className="hbtn-claro" onClick={() => setNovo(null)} aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <div className="cal-novo-tipos" role="group" aria-label="Tipo">
              {[{ id: "audiencia" as Novo, rotulo: "Audiência", cor: corDoTipo("audiencia") }, ...TIPOS_COMPROMISSO].map((t) => (
                <button key={t.id} type="button" className={novo.tipo === t.id ? "on" : ""} aria-pressed={novo.tipo === t.id} style={{ "--c": t.cor } as React.CSSProperties} onClick={() => setNovo({ ...novo, tipo: t.id })}>
                  <i aria-hidden="true" />{t.rotulo}
                </button>
              ))}
              <Link href="/prazos?nova=1" className="cal-novo-link">Prazo ›</Link>
              <Link href="/tarefas?nova=1" className="cal-novo-link">Tarefa ›</Link>
            </div>
            {novo.tipo === "audiencia" ? (
              processos.length === 0 ? (
                <div className="aviso info">Toda audiência fica ligada a um processo. Cadastre o processo em Processos primeiro.</div>
              ) : (
                <FormAudiencia key={`a-${novo.dia}`} processos={processos} pessoas={pessoas} modelosMensagem={modelosMensagem} dataInicial={novo.dia} aoSalvar={() => setNovo(null)} />
              )
            ) : (
              <FormCompromisso key={`c-${novo.tipo}-${novo.dia}`} tipoInicial={novo.tipo} dataInicial={novo.dia} clientes={clientes} processos={processos} pessoas={pessoas} aoSalvar={() => setNovo(null)} />
            )}
          </div>
        </div>
      )}

      {compEditando && (
        <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && setEditando(null)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-label="Editar">
            <div className="ctitle">
              <h3>Editar {rotuloDoTipo(compEditando.tipo).toLowerCase()}</h3>
              <button type="button" className="hbtn-claro" onClick={() => setEditando(null)} aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <FormCompromisso inicial={compEditando} clientes={clientes} processos={processos} pessoas={pessoas} aoSalvar={() => setEditando(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
