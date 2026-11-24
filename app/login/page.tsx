"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NOME_ESCRITORIO } from "@/lib/config";
import { supabaseBrowser } from "@/lib/supabase/client";

function traduzir(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme o seu e-mail pelo link que enviamos antes de entrar.";
  if (/rate limit/i.test(msg)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/provider is not enabled|unsupported provider/i.test(msg)) return "O login com Google ainda não foi ligado no Supabase. Use e-mail e senha por enquanto.";
  return msg;
}

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// Entrada pela conta Google da pessoa. E-mail e senha ficam como reserva (ex.: Google fora do ar).
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState<"google" | "senha" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("erro") === "google") {
      setErro("Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.");
    }
  }, []);

  async function entrarGoogle() {
    setErro(null);
    setEnviando("google");
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setErro(traduzir(error.message));
      setEnviando(null);
    }
  }

  async function entrarSenha(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando("senha");
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch (err) {
      setErro(traduzir(err instanceof Error ? err.message : String(err)));
      setEnviando(null);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login card">
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-orion.svg" alt="Órion · CRM jurídico" width={180} height={209} />
          <small>{NOME_ESCRITORIO.toUpperCase()}</small>
        </div>
        <h1 style={{ fontSize: 20, textAlign: "center" }}>Entrar</h1>
        {erro && <div className="aviso erro">{erro}</div>}
        <button type="button" className="btn btn-google" onClick={entrarGoogle} disabled={enviando !== null}>
          <LogoGoogle /> {enviando === "google" ? "Abrindo o Google…" : "Entrar com o Google"}
        </button>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)", textAlign: "center" }}>
          Use a sua conta Google. Na primeira vez, o administrador do escritório libera o seu acesso em Equipe e cargos.
        </p>
        <details className="login-senha">
          <summary>Entrar com e-mail e senha</summary>
          <form onSubmit={entrarSenha} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="senha">Senha</label>
              <input id="senha" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
            </div>
            <button className="btn primary" type="submit" disabled={enviando !== null}>{enviando === "senha" ? "Aguarde…" : "Entrar"}</button>
          </form>
        </details>
      </div>
    </main>
  );
}
