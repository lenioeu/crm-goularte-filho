"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cumprirPrazo, excluirPrazo, reabrirPrazo } from "@/app/(app)/prazos/actions";
import { BotaoAcao } from "@/components/BotaoAcao";
import { EditarPrazo } from "@/components/EditarPrazo";
import { dataBR, diasSemExpediente, diasUteisAte, ehDiaUtil } from "@/lib/prazos";

export type PrazoPainel = {
  id: string;
  descricao: string;
  publicado_em: string;
  dias: number;
  contagem: "uteis" | "corridos";
  vence_em: string;
  vence_interno: string;
  responsavel_id: string | null;
  observacao: string | null;
  numero_cnj: string | null;
  cliente: { id: string; nome: string } | null;
  responsavel: string | null;
};

type Urg = "vencido" | "hoje" | "semana" | "depois";
type Filtro = { dia: string } | { grupo: Urg } | null;

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_FAIXA = 14;
const somar = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const sem = (s: string) => SEMANA[new Date(`${s.slice(0, 10)}T12:00:00Z`).getUTCDay()];
const comSemana = (s: string) => `${dataBR(s).slice(0, 5)} (${sem(s)})`;

const GRUPOS: { id: Urg; titulo: string; dica: string }[] = [
  { id: "vencido", titulo: "Vencidos", dica: "conferir agora" },
  { id: "hoje", titulo: "Vencem hoje", dica: "protocolar até 23h59" },
  { id: "semana", titulo: "Até 5 dias úteis", dica: "preparar esta semana" },
  { id: "depois", titulo: "Depois", dica: "no radar" },
];

// Painel da aba Prazos (tema Órion): números grandes, faixa dos próximos 14 dias úteis e lista com detalhe.
// Clicar num dia ou num número filtra a lista na hora, sem recarregar a página.
export function PainelPrazos({ prazos, hoje, feriados, pessoas }: { prazos: PrazoPainel[]; hoje: string; feriados: string[]; pessoas: { id: string; nome: string }[] }) {
  const conjunto = useMemo(() => diasSemExpediente(feriados), [feriados]);
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [selId, setSelId] = useState<string | null>(null);

  const comUrg = useMemo(
    () =>
      prazos.map((p) => {
        const venc = p.vence_em.slice(0, 10);
        const faltam = diasUteisAte(hoje, venc, conjunto);
        const urg: Urg = venc < hoje ? "vencido" : venc === hoje ? "hoje" : faltam <= 5 ? "semana" : "depois";
        return { ...p, venc, faltam, urg };
      }),
    [prazos, hoje, conjunto],
  );

  const contagem = Object.fromEntries(GRUPOS.map((g) => [g.id, comUrg.filter((p) => p.urg === g.id).length])) as Record<Urg, number>;

  // Faixa: a partir de hoje, os próximos 14 dias úteis; dias de semana sem expediente aparecem com ✕
  const faixa = useMemo(() => {
    const dias: { dia: string; util: boolean }[] = [];
    let d = hoje;
    let uteis = 0;
    for (let voltas = 0; uteis < DIAS_FAIXA && dias.length < DIAS_FAIXA + 6 && voltas < 60; voltas++, d = somar(d, 1)) {
      const s = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (s === 0 || s === 6) continue;
      const util = ehDiaUtil(d, conjunto);
      dias.push({ dia: d, util });
      if (util) uteis++;
    }
    return dias;
  }, [hoje, conjunto]);

  const visiveis = comUrg.filter((p) => (!filtro ? true : "dia" in filtro ? p.venc === filtro.dia : p.urg === filtro.grupo));
  const sel = comUrg.find((p) => p.id === selId) ?? visiveis[0] ?? null;
  const tituloLista = !filtro
    ? `Todos os prazos abertos (${comUrg.length})`
    : "dia" in filtro
      ? `Vencem em ${comSemana(filtro.dia)}`
      : `${GRUPOS.find((g) => g.id === filtro.grupo)?.titulo} (${visiveis.length})`;

  function quando(p: (typeof comUrg)[number]) {
    if (p.urg === "vencido") return `venceu ${dataBR(p.venc).slice(0, 5)}`;
    if (p.urg === "hoje") return "vence hoje";
    return p.faltam === 1 ? "vence amanhã" : `em ${p.faltam} dias úteis`;
  }
  function nota(p: (typeof comUrg)[number]) {
    if (p.urg === "vencido" || p.urg === "hoje") return null;
    const int = p.vence_interno.slice(0, 10);
    return int < hoje ? "interno passou" : int === hoje ? "interno hoje" : null;
  }

  return (
    <div className="orion">
      <section className="op-kpis" aria-label="Resumo dos prazos abertos">
        {GRUPOS.map((g) => {
          const ativo = Boolean(filtro && "grupo" in filtro && filtro.grupo === g.id);
          return (
            <button key={g.id} type="button" className={`op-kpi u-${g.id}${ativo ? " ativo" : ""}`} aria-pressed={ativo} onClick={() => setFiltro(ativo ? null : { grupo: g.id })}>
              <span>{g.titulo}</span>
              <b>{contagem[g.id]}</b>
              <small>{g.dica}</small>
            </button>
          );
        })}
      </section>

      <section className="op-faixa" aria-label="Próximos dias úteis">
        <div className="op-faixa-topo">
          <h2>Próximos dias · clique num dia para filtrar</h2>
          <div className="op-legenda">
            <span><i className="op-dot u-hoje" />hoje ou vencido</span>
            <span><i className="op-dot u-semana" />até 5 dias úteis</span>
            <span><i className="op-dot u-depois" />depois</span>
            <span><b className="op-x">✕</b>sem expediente</span>
          </div>
        </div>
        <div className="op-dias">
          {faixa.map(({ dia, util }, i) => {
            const doDia = comUrg.filter((p) => p.venc === dia);
            const ativo = Boolean(filtro && "dia" in filtro && filtro.dia === dia);
            const mes = i === 0 || dia.slice(8) === "01" || (i > 0 && faixa[i - 1].dia.slice(5, 7) !== dia.slice(5, 7)) ? MESES[Number(dia.slice(5, 7)) - 1] : "";
            const rot = !util ? "sem expediente" : doDia.length ? `${doDia.length} ${doDia.length > 1 ? "prazos" : "prazo"}` : "livre";
            return (
              <button
                key={dia}
                type="button"
                className={"op-dia" + (dia === hoje ? " hoje" : "") + (ativo ? " ativo" : "") + (!util ? " feriado" : "")}
                disabled={!util}
                aria-pressed={ativo}
                aria-label={`${dataBR(dia).slice(0, 5)}, ${rot}`}
                onClick={() => setFiltro(ativo ? null : { dia })}
              >
                <span className="mes">{mes}</span>
                <span className="sem">{sem(dia)}</span>
                <span className="n">{dia.slice(8)}</span>
                <span className="op-dots">
                  {!util ? <b className="op-x">✕</b> : doDia.slice(0, 8).map((p) => <i key={p.id} className={`op-dot u-${p.urg}`} />)}
                </span>
                <span className="rot">{util ? (doDia.length ? rot : "livre") : "feriado"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="op-cols">
        <section className="op-lista" aria-label="Lista de prazos">
          <div className="op-lista-topo">
            <h2>{tituloLista}</h2>
            {filtro && <button type="button" className="op-link" onClick={() => setFiltro(null)}>Ver todos</button>}
          </div>
          {visiveis.length === 0 ? (
            <p className="vazio">{comUrg.length ? "Nenhum prazo aberto aqui." : "Nenhum prazo aberto. Crie pelo “+ Novo prazo” ou, em Publicações, pelo “Criar prazo”."}</p>
          ) : (
            visiveis.map((p) => {
              const aberto = sel?.id === p.id;
              const n = nota(p);
              return (
                <div key={p.id} className={`op-item u-${p.urg}${aberto ? " sel" : ""}`}>
                  <button type="button" className="op-linha" onClick={() => setSelId(p.id)} aria-expanded={aberto}>
                    <span className="op-data"><small>{sem(p.venc)}</small>{dataBR(p.venc).slice(0, 5)}</span>
                    <span className="op-corpo">
                      <span className="op-titulo">{p.descricao}{p.cliente && <span className="op-cliente"> · {p.cliente.nome}</span>}</span>
                      <span className="op-meta">{[p.numero_cnj, `interno ${dataBR(p.vence_interno).slice(0, 5)}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="op-lado">
                      <span className={`op-chip u-${p.urg}`}>{quando(p)}</span>
                      {n && <span className="op-chip nota">{n}</span>}
                      {p.responsavel && <span className="op-resp">{p.responsavel}</span>}
                    </span>
                  </button>
                  {aberto && <div className="op-inline"><Detalhe p={p} quando={quando(p)} conjunto={conjunto} feriados={feriados} pessoas={pessoas} /></div>}
                </div>
              );
            })
          )}
        </section>
        <aside className="op-aside" aria-label="Prazo selecionado">
          {sel ? <Detalhe p={sel} quando={quando(sel)} conjunto={conjunto} feriados={feriados} pessoas={pessoas} /> : <p className="vazio">Escolha um prazo na lista.</p>}
        </aside>
      </div>
    </div>
  );
}

function Detalhe({ p, quando, conjunto, feriados, pessoas }: { p: PrazoPainel & { venc: string; urg: Urg }; quando: string; conjunto: Set<string>; feriados: string[]; pessoas: { id: string; nome: string }[] }) {
  return (
    <div className="op-detalhe">
      <span className={`op-chip u-${p.urg}`}>{quando}</span>
      <h2 className="op-det-titulo">{p.descricao}</h2>
      {p.cliente && <Link href={`/clientes/${p.cliente.id}`} className="link-cliente">{p.cliente.nome}</Link>}
      {p.numero_cnj && <div className="op-meta op-mono">{p.numero_cnj}</div>}
      <div className="op-marcos">
        <div className="op-marco"><small>Começou</small><b>{comSemana(somarUtil(p.publicado_em, conjunto))}</b></div>
        <div className="op-marco interno"><small>Interno</small><b>{comSemana(p.vence_interno)}</b></div>
        <div className="op-marco fatal"><small>Fatal</small><b>{comSemana(p.venc)}</b></div>
      </div>
      <dl className="op-ficha">
        <dt>Publicação</dt><dd>{dataBR(p.publicado_em)}</dd>
        <dt>Contagem</dt><dd>{p.dias} {p.contagem === "uteis" ? "dias úteis" : "dias corridos"}</dd>
        <dt>Responsável</dt><dd>{p.responsavel ?? "—"}</dd>
        {p.observacao && <><dt>Observação</dt><dd>{p.observacao}</dd></>}
      </dl>
      <div className="op-acoes">
        <BotaoAcao acao={cumprirPrazo.bind(null, p.id)} rotulo="Marcar cumprido" desfazer={reabrirPrazo.bind(null, p.id)} className="btn op-ouro" />
        <EditarPrazo
          prazo={{ id: p.id, descricao: p.descricao, publicado_em: p.publicado_em, dias: p.dias, contagem: p.contagem, interno_dias: Math.max(0, diasUteisAte(p.vence_interno, p.venc, conjunto)), responsavel_id: p.responsavel_id, observacao: p.observacao }}
          pessoas={pessoas}
          feriados={feriados}
          titulo={[p.descricao, p.cliente?.nome, p.numero_cnj].filter(Boolean).join(" · ")}
        />
        <BotaoAcao acao={excluirPrazo.bind(null, p.id)} rotulo="Excluir" className="linkbtn" confirmar={`Excluir o prazo “${p.descricao}”? Se ele veio de uma publicação, ela volta para “Para tratar”.`} />
      </div>
    </div>
  );
}

/** Primeiro dia contado: o dia útil seguinte à publicação. */
function somarUtil(pub: string, feriados: Set<string>) {
  let d = somar(pub.slice(0, 10), 1);
  for (let i = 0; i < 60 && !ehDiaUtil(d, feriados); i++) d = somar(d, 1);
  return d;
}
