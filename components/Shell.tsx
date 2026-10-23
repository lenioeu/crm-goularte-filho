"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Marca } from "@/components/Marca";
import { sair } from "@/app/(app)/actions";

type Item = { href: string; rotulo: string; icone: React.ReactNode; pronto: boolean };

const ic = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {d}
  </svg>
);

const OPERACAO: Item[] = [
  { href: "/", rotulo: "Início", pronto: true, icone: ic(<path d="M4 11l8-6.5 8 6.5v8.5a1 1 0 0 1-1 1h-4.5V15h-5v5.5H5a1 1 0 0 1-1-1z" />) },
  { href: "/atendimento", rotulo: "Atendimento", pronto: true, icone: ic(<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-5 4z" />) },
  { href: "/funil", rotulo: "Funil de casos", pronto: true, icone: ic(<path d="M3.5 5h17l-6.5 7.5v6l-4 2v-8z" />) },
  { href: "/clientes", rotulo: "Clientes", pronto: true, icone: ic(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 6M17.5 19a5 5 0 0 0-2.5-4.3" /></>) },
  { href: "/processos", rotulo: "Processos", pronto: true, icone: ic(<path d="M12 4v16M6 7h12M8 7l-3 6.5a3 3 0 0 0 6 0zM16 7l-3 6.5a3 3 0 0 0 6 0zM8.5 20h7" />) },
  { href: "/audiencias", rotulo: "Audiências", pronto: true, icone: ic(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>) },
  { href: "/agendamentos", rotulo: "Mensagens agendadas", pronto: true, icone: ic(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>) },
  { href: "/tarefas", rotulo: "Tarefas", pronto: true, icone: ic(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.3l2.3 2.3 4.7-4.8" /></>) },
  { href: "/indicadores", rotulo: "Indicadores", pronto: true, icone: ic(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />) },
];

const ESCRITORIO: Item[] = [
  { href: "/areas", rotulo: "Áreas de atuação", pronto: true, icone: ic(<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M16.5 13.5v6M13.5 16.5h6" /></>) },
  { href: "/atendimento-automatico", rotulo: "Atendimento automático", pronto: true, icone: ic(<><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V5M9.5 13h.01M14.5 13h.01M10 16.5h4" /><circle cx="12" cy="4" r="1" /></>) },
  { href: "/modelos", rotulo: "Modelos", pronto: true, icone: ic(<><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M14 3.5V8h4M9 12h6M9 15.5h6" /></>) },
  { href: "/equipe", rotulo: "Equipe e cargos", pronto: true, icone: ic(<><circle cx="8" cy="9" r="2.7" /><circle cx="16" cy="9" r="2.7" /><path d="M3.5 18.5a4.5 4.5 0 0 1 9 0M12.5 18.5a4.5 4.5 0 0 1 8 0" /></>) },
  { href: "/integracoes", rotulo: "Integrações", pronto: true, icone: ic(<path d="M9 6V3M15 6V3M7 6h10v4a5 5 0 0 1-10 0zM12 15v6" />) },
  { href: "/perfil", rotulo: "Meu perfil", pronto: true, icone: ic(<><circle cx="12" cy="8" r="3.4" /><path d="M5 19.5a7 7 0 0 1 14 0" /></>) },
];

/** Dois toques curtos (não precisa de arquivo de som). */
function tocarSom() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.18);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

export function Shell({ nome, cargo, children }: { nome: string; cargo: string; children: React.ReactNode }) {
  const caminho = usePathname();
  const [recolhido, setRecolhido] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => setAberto(false), [caminho]);

  // Conversas esperando resposta: contador no menu, no título da aba e um som quando chega mensagem nova
  const [avisos, setAvisos] = useState(0);
  const ultimaVista = useRef<string | null>(null);
  useEffect(() => {
    let ativo = true;
    async function consultar() {
      try {
        const r = await fetch("/api/avisos", { cache: "no-store" });
        if (!r.ok || !ativo) return;
        const j = (await r.json()) as { total: number; ultima: { em: string | null } | null };
        setAvisos(j.total);
        const marca = j.ultima?.em ?? null;
        if (ultimaVista.current !== null && marca && marca !== ultimaVista.current && j.total > 0) tocarSom();
        ultimaVista.current = marca ?? "";
      } catch {}
    }
    consultar();
    const id = setInterval(consultar, 15000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = avisos ? `(${avisos}) ${base}` : base;
  }, [avisos, caminho]);

  function alternar() {
    if (window.matchMedia("(max-width: 760px)").matches) setAberto((v) => !v);
    else setRecolhido((v) => !v);
  }

  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));
  const link = (i: Item) => (
    <Link key={i.href} href={i.href} className={"nav" + (ativo(i.href) ? " ativo" : "")} title={i.rotulo}>
      {i.icone}
      <span>{i.rotulo}</span>
      {!i.pronto && <span className="breve">em breve</span>}
      {i.href === "/atendimento" && avisos > 0 && <span className="contador" aria-label={`${avisos} esperando resposta`}>{avisos > 99 ? "99+" : avisos}</span>}
    </Link>
  );

  return (
    <>
      <header className="topbar">
        <button className="hbtn" onClick={alternar} aria-label="Menu principal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Marca />
        <form action="/busca" className="busca" role="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M20 20l-4.5-4.5" />
          </svg>
          <input name="q" placeholder="Buscar cliente, CPF, telefone ou nº do processo" aria-label="Buscar" />
        </form>
        <div className="tb-right">
          <div className="me">
            <div className="who">
              <b>{nome}</b>
              <small>{cargo}</small>
            </div>
          </div>
          <form action={sair}>
            <button className="sair" type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>
      <div className={"app" + (recolhido ? " recolhido" : "") + (aberto ? " aberto" : "")}>
        <nav className="rail" aria-label="Menu">
          {OPERACAO.map(link)}
          <div className="nav-sec">Escritório</div>
          {ESCRITORIO.map(link)}
        </nav>
        <main className="main">{children}</main>
      </div>
    </>
  );
}
