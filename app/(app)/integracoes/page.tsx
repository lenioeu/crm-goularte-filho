import { BotaoAcao } from "@/components/BotaoAcao";
import { FormAcao } from "@/components/FormAcao";
import { googleConfigurado } from "@/lib/google";
import { quemSou } from "@/lib/permissoes";
import { desconectarGoogle, importarClientesDoDrive, procurarPastaDeNovo } from "./actions";

const AVISOS: Record<string, { tipo: "ok" | "erro" | "info"; texto: string }> = {
  ok: { tipo: "ok", texto: "Conta Google conectada." },
  cancelado: { tipo: "info", texto: "A autorização foi cancelada no Google. Nada foi alterado." },
  erro: { tipo: "erro", texto: "Não foi possível concluir a autorização. Tente de novo." },
  "erro-banco": { tipo: "erro", texto: "A autorização funcionou, mas não consegui guardá-la. Confira se o script 002_google.sql foi rodado no Supabase." },
  "sem-permanente": { tipo: "erro", texto: "O Google não enviou a autorização permanente. Remova o acesso do Órion CRM em myaccount.google.com/permissions e conecte de novo." },
  "so-admin": { tipo: "erro", texto: "Só o administrador pode conectar a conta Google." },
  "faltam-chaves": { tipo: "erro", texto: "Faltam as chaves do Google ou do Supabase na Vercel (passo 4.4)." },
};

type PastaConfig = { id: string; url: string | null; caminho: string };

export default async function Integracoes({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const { supabase, papel } = await quemSou();
  const admin = papel === "administrador";
  const configurado = googleConfigurado();

  const { data: cfg } = await supabase.from("configuracoes").select("chave, valor").in("chave", ["google_email", "pasta_clientes"]);
  const email = cfg?.find((c) => c.chave === "google_email")?.valor as string | undefined;
  const pasta = cfg?.find((c) => c.chave === "pasta_clientes")?.valor as PastaConfig | undefined;
  const aviso = google ? AVISOS[google] : undefined;

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Integrações</h1>
          <p>Ligações do sistema com o Google Drive, o Google Agenda e, na próxima etapa, o WhatsApp.</p>
        </div>
      </div>

      {aviso && <div className={`aviso ${aviso.tipo}`} style={{ marginBottom: 16 }}>{aviso.texto}</div>}

      <div className="card" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="ctitle" style={{ marginBottom: 0 }}>
          <h3>Google Drive e Google Agenda</h3>
          {email ? <span className="chip good">Conectado</span> : <span className="chip">Não conectado</span>}
        </div>

        {!configurado && (
          <div className="aviso info">
            Faltam as chaves na Vercel: <b>GOOGLE_CLIENT_ID</b>, <b>GOOGLE_CLIENT_SECRET</b> e <b>SUPABASE_SECRET_KEY</b>. Depois de
            colocar, faça um novo deploy.
          </div>
        )}

        {email ? (
          <>
            <div>Conta do escritório: <b>{email}</b></div>
            <div>
              Pasta de clientes:{" "}
              {pasta ? (
                <>
                  <b>{pasta.caminho}</b> {pasta.url && <a href={pasta.url} target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>abrir</a>}
                </>
              ) : (
                <span style={{ color: "var(--warn)" }}>não encontrada</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Audiências novas entram no Google Agenda desta conta. Em Clientes, quem ainda não tem pasta ganha o botão “Criar pasta”,
              que cria Clientes › ÁREA › NOME DO CLIENTE.
            </div>
            {admin && (
              <>
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                  <b style={{ fontWeight: 500 }}>Trazer os clientes que já estão no Drive</b>
                  <p style={{ margin: "4px 0 10px", fontSize: 13, color: "var(--muted)" }}>
                    Lê cada pasta de área (TRABALHISTA, CÍVEL…) dentro de Clientes. Quem já tem cadastro é ligado à pasta; quem não tem
                    é cadastrado com o nome da pasta. Nada é apagado ou movido no Drive. Pode rodar de novo quando quiser.
                  </p>
                  <FormAcao action={importarClientesDoDrive} botao="Importar clientes do Drive" limparAoSalvar={false}>
                    <span />
                  </FormAcao>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                  <BotaoAcao acao={procurarPastaDeNovo} rotulo="Procurar a pasta de novo" />
                  <a className="btn sm" href="/api/google/conectar">Reconectar</a>
                  <BotaoAcao
                    acao={desconectarGoogle}
                    rotulo="Desconectar"
                    confirmar="Desconectar a conta Google? O sistema para de criar pastas e eventos até conectar de novo."
                  />
                </div>
              </>
            )}
          </>
        ) : admin ? (
          configurado && (
            <div>
              <p style={{ margin: "0 0 12px", color: "var(--muted)" }}>
                Entre com a conta Google dona da pasta “Goularte Filho”. O Google vai avisar que o app não foi verificado: clique em
                <b> Avançado › Acessar Órion CRM</b> e autorize.
              </p>
              <a className="btn primary" href="/api/google/conectar">Conectar conta Google</a>
            </div>
          )
        ) : (
          <div style={{ color: "var(--muted)" }}>Peça ao administrador para conectar a conta Google do escritório.</div>
        )}
      </div>

      <div className="card">
        <div className="ctitle" style={{ marginBottom: 6 }}><h3>WhatsApp</h3><span className="chip">próxima etapa</span></div>
        <div style={{ color: "var(--muted)" }}>Conexão pelo Evolution API, no servidor do escritório.</div>
      </div>
    </div>
  );
}
