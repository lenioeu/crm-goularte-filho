"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { criarAgendamento } from "@/app/(app)/agendamentos/actions";
import { adicionarResposta } from "@/app/(app)/atendimento-automatico/actions";
import { enviarArquivoNaConversa, enviarMensagem } from "@/app/(app)/atendimento/actions";
import { useAviso } from "@/components/Avisos";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icone } from "@/components/Icone";

const LIMITE_MB = 64;

function nomeSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || "arquivo";
}
const TZ = "America/Sao_Paulo";
const diaSP = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: TZ });
/** Atalhos de horário para programar: hoje 18h (se ainda der), amanhã 9h e segunda 9h. */
function atalhosDeHorario() {
  const agora = Date.now();
  const horaSP = Number(new Date(agora).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", hour12: false }));
  const lista: { rotulo: string; data: string; hora: string }[] = [];
  if (horaSP < 17) lista.push({ rotulo: "Hoje 18h", data: diaSP(agora), hora: "18:00" });
  lista.push({ rotulo: "Amanhã 9h", data: diaSP(agora + 86_400_000), hora: "09:00" });
  const semana = new Date(diaSP(agora) + "T12:00:00").getDay();
  const ateSegunda = ((8 - semana) % 7) || 7;
  if (ateSegunda > 1) lista.push({ rotulo: "Segunda 9h", data: diaSP(agora + ateSegunda * 86_400_000), hora: "09:00" });
  return lista;
}

const tamanho = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Campo de escrever da conversa: texto, nota interna, anexo (foto, vídeo, áudio, documento) e áudio gravado.
export function ComposerAtendimento({
  conversaId,
  clienteId,
  respostas = [],
  nomeCliente = "",
  modelos = [],
}: {
  conversaId?: string;
  clienteId?: string;
  respostas?: { atalho: string; texto: string }[];
  nomeCliente?: string;
  /** Modelos de mensagem já preenchidos para este cliente, com o dia e a hora sugeridos */
  modelos?: { id: string; nome: string; texto: string; quando: { data: string; hora: string }; cancelar: boolean }[];
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [r, setR] = useState<Resultado | null>(null);
  const [pendente, iniciar] = useTransition();
  const [etapa, setEtapa] = useState<string | null>(null);
  const [gravando, setGravando] = useState<{ inicio: number } | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const cancelado = useRef(false);
  const campoArquivo = useRef<HTMLInputElement>(null);
  const [verRespostas, setVerRespostas] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const aviso = useAviso();
  const [programar, setProgramar] = useState(false);
  const [quando, setQuando] = useState(() => ({ data: diaSP(Date.now() + 86_400_000), hora: "09:00" }));
  const [cancelarSeResponder, setCancelarSeResponder] = useState(true);
  const [nova, setNova] = useState<{ atalho: string; texto: string } | null>(null);
  const [salvandoResposta, setSalvandoResposta] = useState(false);
  const [erroResposta, setErroResposta] = useState<string | null>(null);

  // Respostas rápidas: "/" no começo do campo mostra as opções
  const termo = texto.startsWith("/") && !/\s/.test(texto) ? texto.slice(1).toLowerCase() : null;
  const opcoes = termo !== null || verRespostas ? respostas.filter((r) => !termo || r.atalho.startsWith(termo)).slice(0, verRespostas ? 50 : 8) : [];
  const primeiro = nomeCliente && !/^\d+$/.test(nomeCliente) ? nomeCliente.trim().split(/\s+/)[0] : "";
  const nomeBonito = primeiro ? primeiro.charAt(0) + primeiro.slice(1).toLowerCase() : "";
  function usarResposta(r: { texto: string }) {
    setTexto(r.texto.replace(/\{nome\}/g, nomeBonito).replace(/,\s*([!?.])/g, "$1"));
    setVerRespostas(false);
    setDestaque(0);
  }

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(id);
  }, [gravando]);

  /** Sobe o arquivo para o armazenamento e manda pelo WhatsApp. */
  async function subirEEnviar(blob: Blob, nome: string, voz: boolean, legenda?: string): Promise<Resultado> {
    if (!conversaId) return { erro: "Mande um texto primeiro para abrir a conversa.", ok: null };
    if (blob.size > LIMITE_MB * 1048576) return { erro: `O arquivo passa de ${LIMITE_MB} MB.`, ok: null };
    setEtapa("Enviando o arquivo…");
    const caminho = `${conversaId}/${Date.now()}-${nomeSeguro(nome)}`;
    const mimetype = blob.type || "application/octet-stream";
    const { error } = await supabaseBrowser().storage.from("whatsapp").upload(caminho, blob, { contentType: mimetype });
    if (error) {
      return { erro: /bucket|not found/i.test(error.message) ? "Falta rodar o script supabase/007_arquivos_whatsapp.sql no Supabase." : `Não consegui subir o arquivo: ${error.message}`, ok: null };
    }
    setEtapa("Mandando pelo WhatsApp…");
    return enviarArquivoNaConversa({ conversaId, caminho, nome, mimetype, legenda, voz });
  }

  function enviar() {
    if (pendente) return;
    if (!arquivo && !texto.trim()) return;
    setR(null);
    iniciar(async () => {
      let res: Resultado;
      if (arquivo && !nota) {
        res = await subirEEnviar(arquivo, arquivo.name, false, texto);
      } else {
        const f = new FormData();
        f.set("texto", texto);
        if (nota) f.set("nota", "on");
        if (conversaId) f.set("conversa_id", conversaId);
        if (clienteId) f.set("cliente_id", clienteId);
        res = await enviarMensagem({ erro: null, ok: null }, f);
      }
      setEtapa(null);
      setR(res);
      if (res.ok) {
        setTexto("");
        setArquivo(null);
        if (campoArquivo.current) campoArquivo.current.value = "";
        router.refresh();
      }
    });
  }

  /** Guarda uma resposta rápida nova, já disponível com "/" nas próximas conversas. */
  async function salvarResposta() {
    if (!nova) return;
    setSalvandoResposta(true);
    setErroResposta(null);
    const res = await adicionarResposta(nova);
    setSalvandoResposta(false);
    if (res.erro) return setErroResposta(res.erro);
    setNova(null);
    if (aviso && res.ok) aviso(res.ok);
    router.refresh();
  }

  /** Programa o texto do campo para sair sozinho no dia e hora escolhidos (Mensagens agendadas). */
  function programarEnvio() {
    if (pendente || !clienteId || !texto.trim()) return;
    setR(null);
    iniciar(async () => {
      const f = new FormData();
      f.set("cliente_id", clienteId);
      f.set("tipo", "livre");
      f.set("texto", texto);
      f.set("data", quando.data);
      f.set("hora", quando.hora);
      if (cancelarSeResponder) f.set("cancelar", "on");
      const res = await criarAgendamento({ erro: null, ok: null }, f);
      if (res.ok && aviso) aviso(res.ok);
      setR(res.ok && aviso ? null : res);
      if (res.ok) {
        setTexto("");
        setProgramar(false);
        router.refresh();
      }
    });
  }

  async function comecarGravacao() {
    setR(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pedacos.current = [];
      cancelado.current = false;
      rec.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(null);
        if (cancelado.current) return;
        const blob = new Blob(pedacos.current, { type: (rec.mimeType || "audio/webm").split(";")[0] });
        const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        iniciar(async () => {
          const res = await subirEEnviar(blob, `audio.${ext}`, true);
          setEtapa(null);
          setR(res);
          if (res.ok) router.refresh();
        });
      };
      rec.start();
      gravador.current = rec;
      setGravando({ inicio: Date.now() });
      setAgora(Date.now());
    } catch {
      setR({ erro: "Não consegui usar o microfone. Libere o acesso ao microfone no navegador.", ok: null });
    }
  }

  function pararGravacao(cancelar: boolean) {
    cancelado.current = cancelar;
    gravador.current?.stop();
  }

  const segundos = gravando ? Math.floor((agora - gravando.inicio) / 1000) : 0;

  return (
    <div className="chat-escrever">
      {gravando ? (
        <div className="gravando">
          <span className="ponto-rec" aria-hidden="true" /> Gravando {String(Math.floor(segundos / 60)).padStart(2, "0")}:{String(segundos % 60).padStart(2, "0")}
          <button type="button" className="btn sm" onClick={() => pararGravacao(true)}>Cancelar</button>
          <button type="button" className="btn primary" onClick={() => pararGravacao(false)}>Parar e enviar</button>
        </div>
      ) : (
        <>
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (opcoes.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setDestaque((d) => (d + (e.key === "ArrowDown" ? 1 : opcoes.length - 1)) % opcoes.length);
              } else if (opcoes.length && (e.key === "Enter" || e.key === "Tab") && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                usarResposta(opcoes[Math.min(destaque, opcoes.length - 1)]);
              } else if (e.key === "Escape") { setVerRespostas(false); setNova(null); }
              else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) (programar ? programarEnvio() : enviar());
            }}
            placeholder={arquivo ? "Legenda (opcional)" : respostas.length ? "Escreva a mensagem · / para respostas rápidas · Ctrl+Enter envia" : "Escreva a mensagem · Ctrl+Enter envia"}
            aria-label="Mensagem"
          />
          {(opcoes.length > 0 || verRespostas || (termo !== null && respostas.length === 0)) && (
            <div className="respostas-lista" role="listbox" aria-label="Respostas rápidas">
              {opcoes.map((r, i) => (
                <button key={r.atalho} type="button" role="option" aria-selected={i === destaque} className={"resposta-op" + (i === destaque ? " on" : "")} onMouseDown={(e) => { e.preventDefault(); usarResposta(r); }}>
                  <code>/{r.atalho}</code> <span>{r.texto.slice(0, 90)}{r.texto.length > 90 ? "…" : ""}</span>
                </button>
              ))}
              {opcoes.length === 0 && !nova && <div className="respostas-vazia">Nenhuma resposta rápida ainda.</div>}
              {nova ? (
                <div className="resposta-nova">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "var(--accent)", fontFamily: "var(--f-mono)" }}>/</span>
                    <input
                      value={nova.atalho}
                      onChange={(e) => setNova({ ...nova, atalho: e.target.value })}
                      placeholder="atalho, ex.: docs"
                      aria-label="Atalho da resposta"
                      autoFocus
                      style={{ maxWidth: 180 }}
                    />
                    <small style={{ color: "var(--dim)" }}>Use {"{nome}"} para o primeiro nome do cliente</small>
                  </div>
                  <textarea rows={3} value={nova.texto} onChange={(e) => setNova({ ...nova, texto: e.target.value })} placeholder="Texto da resposta" aria-label="Texto da resposta" />
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className="btn primary sm" onClick={salvarResposta} disabled={salvandoResposta}>{salvandoResposta ? "Salvando…" : "Salvar resposta"}</button>
                    <button type="button" className="btn sm" onClick={() => { setNova(null); setErroResposta(null); }}>Cancelar</button>
                    {erroResposta && <span className="aviso erro">{erroResposta}</span>}
                  </div>
                </div>
              ) : (
                <button type="button" className="resposta-op resposta-criar" onMouseDown={(e) => { e.preventDefault(); setVerRespostas(true); setNova({ atalho: termo ?? "", texto: termo === null ? texto.trim() : "" }); }}>
                  <Icone nome="mais" tamanho={15} /> {texto.trim() && termo === null ? "Salvar o texto escrito como resposta rápida" : "Nova resposta rápida"}
                </button>
              )}
            </div>
          )}
          {programar && (
            <div className="programar-linha">
              {modelos.length > 0 && (
                <select
                  className="tipo-contato"
                  defaultValue=""
                  aria-label="Usar modelo"
                  onChange={(e) => {
                    const m = modelos.find((x) => x.id === e.target.value);
                    if (!m) return;
                    setTexto(m.texto);
                    setQuando(m.quando);
                    setCancelarSeResponder(m.cancelar);
                  }}
                >
                  <option value="" disabled>Usar modelo…</option>
                  {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              )}
              <Icone nome="relogio" tamanho={16} /> <b style={{ fontWeight: 500 }}>Enviar em</b>
              <input type="date" value={quando.data} min={diaSP(Date.now())} onChange={(e) => setQuando((q) => ({ ...q, data: e.target.value }))} aria-label="Dia do envio" />
              <input type="time" value={quando.hora} onChange={(e) => setQuando((q) => ({ ...q, hora: e.target.value }))} aria-label="Hora do envio" />
              <span className="atalhos-hora">
                {atalhosDeHorario().map((a) => (
                  <button key={a.rotulo} type="button" className={"btn sm" + (a.data === quando.data && a.hora === quando.hora ? " primary" : "")} onClick={() => setQuando({ data: a.data, hora: a.hora })}>{a.rotulo}</button>
                ))}
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={cancelarSeResponder} onChange={(e) => setCancelarSeResponder(e.target.checked)} /> Cancelar se o cliente responder antes
              </label>
            </div>
          )}
          {arquivo && (
            <div className="anexo">
              <Icone nome="clipe" tamanho={16} /> {arquivo.name} <small>({tamanho(arquivo.size)})</small>
              <button type="button" className="btn sm" onClick={() => { setArquivo(null); if (campoArquivo.current) campoArquivo.current.value = ""; }}>Tirar</button>
            </div>
          )}
          <div className="escrever-acoes">
            <label className="nota-check">
              <input type="checkbox" checked={nota} onChange={(e) => setNota(e.target.checked)} /> Nota interna (não vai para o cliente)
            </label>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
              <input
                ref={campoArquivo}
                type="file"
                hidden
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.odt,.txt,.zip"
              />
              <button type="button" className={"btn" + (verRespostas ? " on" : "")} onClick={() => { setVerRespostas((v) => !v); setNova(null); }} title="Usar ou criar respostas rápidas" aria-pressed={verRespostas}>
                <Icone nome="raio" tamanho={16} /> Respostas
              </button>
              <button type="button" className="btn" onClick={() => campoArquivo.current?.click()} disabled={pendente || nota || !conversaId} title={conversaId ? "Foto, vídeo, áudio ou documento" : "Mande um texto primeiro"}>
                <Icone nome="clipe" tamanho={16} /> Anexar
              </button>
              <button type="button" className="btn" onClick={comecarGravacao} disabled={pendente || nota || !conversaId} title={conversaId ? "Gravar mensagem de voz" : "Mande um texto primeiro"}>
                <Icone nome="microfone" tamanho={16} /> Gravar áudio
              </button>
              {clienteId && (
                <button
                  type="button"
                  className={"btn" + (programar ? " on" : "")}
                  onClick={() => setProgramar((v) => !v)}
                  disabled={nota || Boolean(arquivo)}
                  title="Escolher dia e hora para a mensagem sair sozinha"
                  aria-pressed={programar}
                >
                  <Icone nome="relogio" tamanho={16} /> {programar ? "Não programar" : "Programar"}
                </button>
              )}
              {programar ? (
                <button type="button" className="btn primary" onClick={programarEnvio} disabled={pendente || !texto.trim()}>
                  {pendente ? "Programando…" : "Programar envio"}
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={enviar} disabled={pendente || (!arquivo && !texto.trim())}>
                  {pendente ? etapa ?? "Enviando…" : "Enviar"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {r?.erro && <span className="aviso erro">{r.erro}</span>}
    </div>
  );
}
