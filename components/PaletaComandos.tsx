"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Achado, buscaRapida } from "@/app/(app)/busca/actions";
import { Icone, type NomeIcone } from "@/components/Icone";

type Item = { titulo: string; detalhe?: string; href: string; icone: NomeIcone; grupo: string };

const ACOES: Item[] = [
  { titulo: "Nova conversa no WhatsApp", href: "/atendimento?nova=1", icone: "conversa", grupo: "Ações" },
  { titulo: "Novo cliente", href: "/clientes#novo", icone: "usuario", grupo: "Ações" },
  { titulo: "Cadastrar processo", href: "/processos?nova=1", icone: "balanca", grupo: "Ações" },
  { titulo: "Agendar audiência", href: "/audiencias?nova=1", icone: "calendario", grupo: "Ações" },
  { titulo: "Nova tarefa", href: "/tarefas?nova=1", icone: "tarefa", grupo: "Ações" },
  { titulo: "Agendar mensagem", href: "/agendamentos", icone: "relogio", grupo: "Ações" },
  { titulo: "Novo caso no funil", href: "/funil?nova=1", icone: "pasta", grupo: "Ações" },
];
const PAGINAS: Item[] = [
  ["Início", "/", "painel"], ["Atendimento", "/atendimento", "conversa"], ["Clientes", "/clientes", "usuario"], ["Processos", "/processos", "balanca"],
  ["Audiências", "/audiencias", "calendario"], ["Mensagens agendadas", "/agendamentos", "relogio"], ["Tarefas", "/tarefas", "tarefa"],
  ["Indicadores", "/indicadores", "painel"], ["Áreas de atuação", "/areas", "pasta"], ["Funil de casos", "/funil", "etapa"],
  ["Atendimento automático", "/atendimento-automatico", "raio"], ["Modelos", "/modelos", "documento"], ["Equipe e cargos", "/equipe", "usuario"],
  ["Integrações", "/integracoes", "automatico"], ["Meu perfil", "/perfil", "usuario"],
].map(([titulo, href, icone]) => ({ titulo, href, icone: icone as NomeIcone, grupo: "Ir para" }));

const ICONE_ACHADO: Record<Achado["tipo"], NomeIcone> = { cliente: "usuario", processo: "balanca", caso: "pasta" };
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Caixa de comando (Ctrl+K): procura clientes, processos e casos, abre páginas e faz ações rápidas.
export function PaletaComandos({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<Achado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aberta) {
      setQ("");
      setAchados([]);
      setSel(0);
      setTimeout(() => campo.current?.focus(), 10);
    }
  }, [aberta]);

  // Busca no banco com uma pequena espera depois da última tecla
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) return setAchados([]);
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscaRapida(termo).catch(() => []);
      setAchados(r);
      setBuscando(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const itens = useMemo<Item[]>(() => {
    const termo = sem(q.trim());
    const filtra = (xs: Item[]) => (termo ? xs.filter((x) => sem(x.titulo).includes(termo)) : xs);
    const doBanco: Item[] = achados.map((a) => ({
      titulo: a.titulo,
      detalhe: a.detalhe,
      href: a.href,
      icone: ICONE_ACHADO[a.tipo],
      grupo: a.tipo === "cliente" ? "Clientes" : a.tipo === "processo" ? "Processos" : "Casos",
    }));
    const extra: Item[] = termo.length >= 2 ? [{ titulo: `Buscar “${q.trim()}” em tudo`, href: `/busca?q=${encodeURIComponent(q.trim())}`, icone: "busca", grupo: "Busca completa" }] : [];
    return [...doBanco, ...filtra(ACOES), ...filtra(PAGINAS).slice(0, termo ? 6 : 15), ...extra];
  }, [achados, q]);

  useEffect(() => setSel(0), [itens.length]);
  useEffect(() => {
    lista.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function ir(item: Item | undefined) {
    if (!item) return;
    fechar();
    router.push(item.href);
  }

  if (!aberta) return null;
  let grupoAtual = "";
  return (
    <div className="paleta-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Buscar ou ir para">
        <div className="paleta-campo">
          <Icone nome="busca" tamanho={20} />
          <input
            ref={campo}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente, CPF, processo… ou digite uma ação"
            aria-label="Buscar ou ir para"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, itens.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); ir(itens[sel]); }
              else if (e.key === "Escape") fechar();
            }}
          />
          {buscando && <span className="paleta-dica">buscando…</span>}
          <kbd>Esc</kbd>
        </div>
        <div className="paleta-lista" ref={lista}>
          {itens.map((it, i) => {
            const titulo = it.grupo !== grupoAtual ? (grupoAtual = it.grupo) : null;
            return (
              <div key={it.grupo + it.href + it.titulo}>
                {titulo && <div className="paleta-grupo">{titulo}</div>}
                <button type="button" data-i={i} className={"paleta-item" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onClick={() => ir(it)}>
                  <Icone nome={it.icone} tamanho={18} />
                  <span className="paleta-texto"><b>{it.titulo}</b>{it.detalhe && <small>{it.detalhe}</small>}</span>
                  {i === sel && <Icone nome="seta" tamanho={16} />}
                </button>
              </div>
            );
          })}
          {q.trim().length >= 2 && !buscando && !achados.length && <div className="paleta-vazio">Nenhum cliente ou processo com “{q.trim()}”.</div>}
        </div>
        <div className="paleta-rodape"><kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> abrir · <kbd>Ctrl</kbd>+<kbd>K</kbd> de qualquer tela</div>
      </div>
    </div>
  );
}
