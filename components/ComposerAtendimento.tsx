"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Resultado } from "@/app/(app)/actions";
import { enviarArquivoNaConversa, enviarMensagem } from "@/app/(app)/atendimento/actions";
import { supabaseBrowser } from "@/lib/supabase/client";

const LIMITE_MB = 64;

function nomeSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || "arquivo";
}
const tamanho = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Campo de escrever da conversa: texto, nota interna, anexo (foto, vídeo, áudio, documento) e áudio gravado.
export function ComposerAtendimento({ conversaId, clienteId }: { conversaId?: string; clienteId?: string }) {
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
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar();
            }}
            placeholder={arquivo ? "Legenda (opcional)" : "Escreva a mensagem · Ctrl+Enter envia"}
            aria-label="Mensagem"
          />
          {arquivo && (
            <div className="anexo">
              📎 {arquivo.name} <small>({tamanho(arquivo.size)})</small>
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
              <button type="button" className="btn" onClick={() => campoArquivo.current?.click()} disabled={pendente || nota || !conversaId} title={conversaId ? "Foto, vídeo, áudio ou documento" : "Mande um texto primeiro"}>
                📎 Anexar
              </button>
              <button type="button" className="btn" onClick={comecarGravacao} disabled={pendente || nota || !conversaId} title={conversaId ? "Gravar mensagem de voz" : "Mande um texto primeiro"}>
                🎤 Gravar áudio
              </button>
              <button type="button" className="btn primary" onClick={enviar} disabled={pendente || (!arquivo && !texto.trim())}>
                {pendente ? etapa ?? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </>
      )}
      {r?.erro && <span className="aviso erro">{r.erro}</span>}
    </div>
  );
}
