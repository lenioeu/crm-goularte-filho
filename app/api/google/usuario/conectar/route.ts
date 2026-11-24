import { NextResponse } from "next/server";
import { googleConfigurado } from "@/lib/google";
import { conexaoDoUsuario, ESCOPOS, type Recurso } from "@/lib/googleUsuario";
import { quemSou } from "@/lib/permissoes";

// "Conectar minha Agenda" / "Conectar meu Gmail" (Meu perfil): leva a pessoa para a autorização do Google.
// Pede também o que ela já tinha ligado, para a autorização nova continuar valendo para tudo.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origem = url.origin;
  const recurso = url.searchParams.get("recurso") as Recurso | null;
  if (!googleConfigurado()) return NextResponse.redirect(`${origem}/perfil?google=faltam-chaves`);
  if (recurso !== "agenda" && recurso !== "gmail") return NextResponse.redirect(`${origem}/perfil`);
  const { user, papel } = await quemSou();
  if (!user) return NextResponse.redirect(`${origem}/login`);
  if (!papel) return NextResponse.redirect(`${origem}/perfil?google=erro`);

  const atual = await conexaoDoUsuario(user.id);
  const escopos = new Set(["openid", "email", ESCOPOS[recurso]]);
  if (atual?.agenda) escopos.add(ESCOPOS.agenda);
  if (atual?.gmail) escopos.add(ESCOPOS.gmail);

  const estado = crypto.randomUUID();
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", `${origem}/api/google/usuario/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", [...escopos].join(" "));
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", estado);
  if (user.email) auth.searchParams.set("login_hint", user.email);

  const resposta = NextResponse.redirect(auth);
  resposta.cookies.set("google_usuario_estado", estado, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return resposta;
}
