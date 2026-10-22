import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { procurarPastaClientes, trocarCodigo } from "@/lib/google";
import { quemSou } from "@/lib/permissoes";
import { supabaseAdmin } from "@/lib/supabase/admin";

function emailDoIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const corpo = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof corpo.email === "string" ? corpo.email : null;
  } catch {
    return null;
  }
}

// O Google devolve o administrador para cá depois da autorização.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origem = url.origin;
  const voltar = (status: string) => NextResponse.redirect(`${origem}/integracoes?google=${status}`);

  const code = url.searchParams.get("code");
  const estado = url.searchParams.get("state");
  const guardado = (await cookies()).get("google_estado")?.value;
  if (url.searchParams.get("error")) return voltar("cancelado");
  if (!code || !estado || estado !== guardado) return voltar("erro");

  const { user, papel } = await quemSou();
  if (!user || papel !== "administrador") return voltar("so-admin");

  try {
    const tokens = await trocarCodigo(code, `${origem}/api/google/callback`);
    if (!tokens.refresh_token) return voltar("sem-permanente");
    const email = emailDoIdToken(tokens.id_token);
    const admin = supabaseAdmin();
    const agora = new Date().toISOString();

    const { error } = await admin
      .from("google_conexao")
      .upsert({ id: 1, refresh_token: tokens.refresh_token, email, conectado_por: user.id, conectado_em: agora });
    if (error) return voltar("erro-banco");

    const linhas: { chave: string; valor: unknown; atualizado_em: string }[] = [
      { chave: "google_email", valor: email ?? "conta Google", atualizado_em: agora },
    ];
    const pasta = await procurarPastaClientes(tokens.access_token).catch(() => null);
    if (pasta) linhas.push({ chave: "pasta_clientes", valor: { id: pasta.id, url: pasta.webViewLink ?? null, caminho: pasta.caminho }, atualizado_em: agora });
    await admin.from("configuracoes").upsert(linhas);
  } catch {
    return voltar("erro");
  }

  const resposta = voltar("ok");
  resposta.cookies.delete("google_estado");
  return resposta;
}
