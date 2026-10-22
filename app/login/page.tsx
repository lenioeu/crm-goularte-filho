"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Marca } from "@/components/Marca";
import { supabaseBrowser } from "@/lib/supabase/client";

function traduzir(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme o seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered/i.test(msg)) return "Este e-mail já tem cadastro. Use “Entrar”.";
  if (/password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/rate limit/i.test(msg)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  return msg;
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    const supabase = supabaseBrowser();
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome }, emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setAviso("Cadastro feito. Abra o link de confirmação que enviamos para o seu e-mail.");
          setModo("entrar");
        }
      }
    } catch (err) {
      setErro(traduzir(err instanceof Error ? err.message : String(err)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login card" onSubmit={enviar}>
        <Marca />
        <h1 style={{ fontSize: 20, textAlign: "center" }}>{modo === "entrar" ? "Entrar" : "Criar acesso"}</h1>
        {erro && <div className="aviso erro">{erro}</div>}
        {aviso && <div className="aviso ok">{aviso}</div>}
        {modo === "cadastrar" && (
          <div className="field">
            <label htmlFor="nome">Seu nome</label>
            <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            required
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          />
        </div>
        <button className="btn primary" type="submit" disabled={enviando}>
          {enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar acesso"}
        </button>
        <div className="troca">
          {modo === "entrar" ? (
            <>
              Primeira vez aqui?{" "}
              <button type="button" onClick={() => setModo("cadastrar")}>
                Criar acesso
              </button>
            </>
          ) : (
            <>
              Já tem acesso?{" "}
              <button type="button" onClick={() => setModo("entrar")}>
                Entrar
              </button>
            </>
          )}
        </div>
        {modo === "cadastrar" && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)", textAlign: "center" }}>
            Depois do cadastro, o administrador do escritório libera o seu acesso.
          </p>
        )}
      </form>
    </main>
  );
}
