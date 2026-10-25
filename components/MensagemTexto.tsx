"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { apagarMensagem, editarMensagem } from "@/app/(app)/atendimento/actions";
import { useAviso } from "@/components/Avisos";
import { Icone } from "@/components/Icone";

// Texto de uma mensagem do escritório com o menu "Editar / Apagar" (como no WhatsApp).
export function MensagemTexto({
  id,
  texto,
  podeEditar,
  podeApagar,
  nota,
}: {
  id: string;
  texto: string | null;
  podeEditar: boolean;
  podeApagar: boolean;
  nota: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [menu, setMenu] = useState<React.CSSProperties | null>(null);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(texto ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou rolar a conversa
  useEffect(() => {
    if (!menu) return;
    const fora = (e: Event) => !caixa.current?.contains(e.target as Node) && setMenu(null);
    const fechar = () => setMenu(null);
    // Só fecha quando a pessoa rola de verdade (o próprio toque no botão pode mexer alguns pixels)
    const lista = caixa.current?.closest(".chat-msgs");
    const inicio = lista?.scrollTop ?? 0;
    const rolou = () => lista && Math.abs(lista.scrollTop - inicio) > 40 && fechar();
    document.addEventListener("pointerdown", fora);
    lista?.addEventListener("scroll", rolou);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("pointerdown", fora);
      lista?.removeEventListener("scroll", rolou);
      window.removeEventListener("resize", fechar);
    };
  }, [menu]);

  /** O menu flutua por cima da tela (a lista de mensagens corta o que passa da borda): abre embaixo ou, sem espaço, em cima. */
  function abrirMenu(botao: HTMLElement) {
    if (menu) return setMenu(null);
    const r = botao.getBoundingClientRect();
    const direita = Math.max(8, window.innerWidth - r.right);
    setMenu(window.innerHeight - r.bottom > 120 ? { top: r.bottom + 4, right: direita } : { bottom: window.innerHeight - r.top + 4, right: direita });
  }

  function rodar(acao: () => Promise<{ erro: string | null; ok: string | null }>, depois?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (r.erro) return setErro(r.erro);
      if (aviso && r.ok) aviso(r.ok);
      depois?.();
      router.refresh();
    });
  }

  function apagar() {
    setMenu(null);
    const pergunta = nota ? "Apagar esta nota interna?" : "Apagar esta mensagem para todos? Ela some também do WhatsApp do cliente.";
    if (!window.confirm(pergunta)) return;
    rodar(() => apagarMensagem(id));
  }

  return (
    <>
      {editando ? (
        <div className="bolha-editar">
          <textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            rows={Math.min(8, Math.max(2, rascunho.split("\n").length))}
            autoFocus
            aria-label="Editar mensagem"
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditando(false);
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) rodar(() => editarMensagem(id, rascunho), () => setEditando(false));
            }}
          />
          <div className="bolha-editar-acoes">
            <button type="button" className="btn sm" onClick={() => { setEditando(false); setRascunho(texto ?? ""); setErro(null); }} disabled={pendente}>Cancelar</button>
            <button type="button" className="btn sm primary" onClick={() => rodar(() => editarMensagem(id, rascunho), () => setEditando(false))} disabled={pendente || !rascunho.trim()}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      ) : (
        texto && <div className="bolha-texto">{texto}</div>
      )}
      {(podeEditar || podeApagar) && !editando && (
        <div className="bolha-menu" ref={caixa}>
          <button type="button" className="bolha-menu-botao" onClick={(e) => abrirMenu(e.currentTarget)} aria-label="Opções da mensagem" aria-expanded={Boolean(menu)} disabled={pendente}>
            {pendente ? <span className="girando" style={{ margin: 0 }} /> : <Icone nome="opcoes" tamanho={16} />}
          </button>
          {menu && (
            <div className="bolha-menu-lista" role="menu" style={menu}>
              {podeEditar && (
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setEditando(true); }}>
                  <Icone nome="lapis" tamanho={15} /> Editar
                </button>
              )}
              {podeApagar && (
                <button type="button" role="menuitem" className="perigo" onClick={apagar}>
                  <Icone nome="lixeira" tamanho={15} /> {nota ? "Apagar nota" : "Apagar para todos"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {erro && <div className="bolha-erro">{erro}</div>}
    </>
  );
}
