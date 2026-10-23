import { NextResponse } from "next/server";
import { quemSou } from "@/lib/permissoes";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { baixarMidia } from "@/lib/whatsapp";

export const maxDuration = 60;

const EXTENSAO: Record<string, string> = {
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "video/mp4": "mp4", "image/jpeg": "jpg",
  "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

// Abre o arquivo de uma mensagem (para ouvir, ver ou baixar dentro do CRM).
// Recebido do cliente: na primeira vez baixa do WhatsApp e guarda no armazenamento do Supabase.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, papel } = await quemSou();
  if (!papel) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const { data: m } = await supabase.from("mensagens").select("id, conversa_id, whatsapp_id, arquivo_caminho").eq("id", id).maybeSingle();
  if (!m) return NextResponse.json({ erro: "mensagem não encontrada" }, { status: 404 });

  let caminho = m.arquivo_caminho as string | null;
  if (!caminho) {
    if (!m.whatsapp_id) return NextResponse.json({ erro: "sem arquivo" }, { status: 404 });
    try {
      const arq = await baixarMidia(m.whatsapp_id);
      const tipo = (arq.mimetype ?? "application/octet-stream").split(";")[0];
      const ext = arq.fileName?.includes(".") ? arq.fileName.split(".").pop() : EXTENSAO[tipo] ?? "bin";
      caminho = `${m.conversa_id}/recebido-${m.id}.${ext}`;
      const admin = supabaseAdmin();
      const { error } = await admin.storage.from("whatsapp").upload(caminho, Buffer.from(arq.base64, "base64"), { contentType: tipo, upsert: true });
      if (error) throw new Error(error.message);
      await admin.from("mensagens").update({ arquivo_caminho: caminho }).eq("id", m.id);
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  const { data: link } = await supabase.storage.from("whatsapp").createSignedUrl(caminho, 60 * 60);
  if (!link) return NextResponse.json({ erro: "arquivo não encontrado" }, { status: 404 });
  return NextResponse.redirect(link.signedUrl, { headers: { "Cache-Control": "private, max-age=1800" } });
}
