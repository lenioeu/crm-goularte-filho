import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { trocarCodigo } from "@/lib/google";
import { ESCOPOS } from "@/lib/googleUsuario";
import { quemSou } from "@/lib/permissoes";
import { importarRecorteDoGmail } from "@/lib/recorteImportar";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

function emailDoIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const corpo = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof corpo.email === "string" ? corpo.email : null;
  } catch {
    return null;
  }
}

// Volta da autorização do Google da pessoa: guarda o que ela liberou (Agenda e/ou Gmail).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origem = url.origin;
  const voltar = (status: string) => {
    const r = NextResponse.redirect(`${origem}/perfil?google=${status}#google`);
    r.cookies.delete("google_usuario_estado");
    return r;
  };
  const code = url.searchParams.get("code");
  const estado = url.searchParams.get("state");
  const guardado = (await cookies()).get("google_usuario_estado")?.value;
  if (url.searchParams.get("error")) return voltar("cancelado");
  if (!code || !estado || estado !== guardado) return voltar("erro");

  const { user, papel } = await quemSou();
  if (!user || !papel) return voltar("erro");

  try {
    const tokens = (await trocarCodigo(code, `${origem}/api/google/usuario/callback`)) as { access_token: string; refresh_token?: string; id_token?: string; scope?: string };
    if (!tokens.refresh_token) return voltar("sem-permanente");
    const escopos = (tokens.scope ?? "").split(" ");
    const agenda = escopos.includes(ESCOPOS.agenda);
    const gmail = escopos.includes(ESCOPOS.gmail);
    if (!agenda && !gmail) return voltar("sem-permissao");
    const admin = supabaseAdmin();
    const { error } = await admin.from("google_usuarios").upsert({
      perfil_id: user.id,
      email: emailDoIdToken(tokens.id_token),
      refresh_token: tokens.refresh_token,
      agenda,
      gmail,
      conectado_em: new Date().toISOString(),
    });
    if (error) return voltar("erro-banco");
    // Gmail recém-ligado: já traz o Recorte dos últimos dias
    if (gmail) await importarRecorteDoGmail(admin, user.id).catch(() => null);
    return voltar("ok");
  } catch {
    return voltar("erro");
  }
}
