import Link from "next/link";
import type { Evento } from "@/lib/linhaDoTempo";
import { TZ } from "@/lib/rotulos";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function quando(iso: string) {
  // Movimentações do CNJ vêm só com a data
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().slice(0, 2).join("/");
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
const mesDe = (iso: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
  return `${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;
};

function Item({ e }: { e: Evento }) {
  const conteudo = (
    <>
      <b>{e.texto}</b>
      {e.detalhe && <small>{e.detalhe}</small>}
    </>
  );
  return (
    <div className={"tl-item" + (e.futuro ? " futuro" : "")}>
      <span className="tl-icone" aria-hidden="true">{e.icone}</span>
      <div className="bd">
        {e.link ? (e.link.startsWith("/") ? <Link href={e.link}>{conteudo}</Link> : <a href={e.link} target="_blank" rel="noopener">{conteudo}</a>) : conteudo}
      </div>
      <span className="tl-data">{e.futuro ? "marcada · " : ""}{quando(e.em)}</span>
    </div>
  );
}

// Linha do tempo agrupada por mês; mostra os 40 mais recentes e o resto num "ver tudo".
export function LinhaDoTempo({ eventos }: { eventos: Evento[] }) {
  const grupos = (lista: Evento[]) => {
    const g: { mes: string; itens: Evento[] }[] = [];
    for (const e of lista) {
      const mes = mesDe(e.em);
      if (g.at(-1)?.mes !== mes) g.push({ mes, itens: [] });
      g.at(-1)!.itens.push(e);
    }
    return g.map((x) => (
      <div key={x.mes + x.itens[0].em}>
        <div className="dayhead">{x.mes}</div>
        {x.itens.map((e, i) => <Item key={i} e={e} />)}
      </div>
    ));
  };
  if (!eventos.length) return <div className="vazio">Nada registrado ainda.</div>;
  return (
    <div className="tl">
      {grupos(eventos.slice(0, 40))}
      {eventos.length > 40 && (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--accent)", fontSize: 13.5, margin: "10px 0" }}>Ver tudo ({eventos.length - 40} mais antigos)</summary>
          {grupos(eventos.slice(40))}
        </details>
      )}
    </div>
  );
}
