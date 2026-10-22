import { NextResponse } from "next/server";
import { GOOGLE_ESCOPOS, googleConfigurado } from "@/lib/google";
import { quemSou } from "@/lib/permissoes";

// Leva o administrador para a tela de autorização do Google.
export async function GET(request: Request) {
  const origem = new URL(request.url).origin;
  if (!googleConfigurado()) return NextResponse.redirect(`${origem}/integracoes?google=faltam-chaves`);

  const { user, papel } = await quemSou();
  if (!user) return NextResponse.redirect(`${origem}/login`);
  if (papel !== "administrador") return NextResponse.redirect(`${origem}/integracoes?google=so-admin`);

  const estado = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origem}/api/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_ESCOPOS.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", estado);

  const resposta = NextResponse.redirect(url);
  resposta.cookies.set("google_estado", estado, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return resposta;
}
