import { AtivarNotificacoes } from "@/components/AtivarNotificacoes";
import { EscolherTema } from "@/components/EscolherTema";
import { usuarioAtual } from "@/lib/sessao";
import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { salvarPerfil, trocarSenha } from "../actions";
import { BotaoAcao } from "@/components/BotaoAcao";
import { googleConfigurado } from "@/lib/google";
import { conexaoDoUsuario } from "@/lib/googleUsuario";
import { buscarRecorteAgora, desconectarMeuGoogle } from "./actions";

const AVISOS_GOOGLE: Record<string, { texto: string; erro?: boolean }> = {
  ok: { texto: "Pronto: conta Google conectada." },
  cancelado: { texto: "Você cancelou a autorização no Google. Nada mudou.", erro: true },
  "sem-permissao": { texto: "O Google não liberou a Agenda nem o Gmail. Marque as caixas de permissão na tela do Google e tente de novo.", erro: true },
  "sem-permanente": { texto: "O Google não mandou a autorização permanente. Tente de novo.", erro: true },
  "faltam-chaves": { texto: "A integração com o Google ainda não foi configurada no servidor.", erro: true },
  "erro-banco": { texto: "Falta rodar o script supabase/020_google_por_usuario.sql no Supabase.", erro: true },
  erro: { texto: "Não foi possível conectar agora. Tente de novo.", erro: true },
};

export default async function Perfil({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const supabase = await supabaseServer();
  const user = await usuarioAtual();
  const conexao = user ? await conexaoDoUsuario(user.id).catch(() => null) : null;
  const aviso = google ? AVISOS_GOOGLE[google] ?? AVISOS_GOOGLE.erro : null;
  const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ainda não");
  const { data: p } = await supabase.from("perfis").select("nome, oab, telefone, assinatura").eq("id", user!.id).maybeSingle();

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Meu perfil</h1>
          <p>Seus dados aparecem nas mensagens enviadas aos clientes e nos documentos gerados pelo sistema (a OAB entra na procuração e no contrato).</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        <FormAcao action={salvarPerfil} botao="Salvar" className="form" limparAoSalvar={false}>
          <div className="field"><label htmlFor="nome">Nome</label><input id="nome" name="nome" required defaultValue={p?.nome ?? ""} /></div>
          <div className="field"><label htmlFor="oab">Inscrição na OAB</label><input id="oab" name="oab" defaultValue={p?.oab ?? ""} placeholder="ex.: OAB/ES 12.345" /></div>
          <div className="field"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" defaultValue={p?.telefone ?? ""} /></div>
          <div className="field"><label>E-mail de acesso</label><input value={user?.email ?? ""} disabled /></div>
          <div className="field full"><label htmlFor="assinatura">Assinatura nas mensagens</label><input id="assinatura" name="assinatura" defaultValue={p?.assinatura ?? ""} placeholder="ex.: Dr. Fulano · Goularte Filho Advocacia" /></div>
        </FormAcao>
      </div>
      <div className="card" style={{ maxWidth: 720, marginTop: 16 }} id="google">
        <div className="ctitle"><h3>Sua conta Google</h3>{conexao?.email && <span className="tag">{conexao.email}</span>}</div>
        {aviso && <div className={"aviso " + (aviso.erro ? "erro" : "ok")} style={{ marginBottom: 12 }}>{aviso.texto}</div>}
        {!googleConfigurado() ? (
          <p className="dica">A integração com o Google ainda não foi configurada no servidor.</p>
        ) : (
          <div className="google-pessoal">
            <div className="google-item">
              <div>
                <b>Agenda {conexao?.agenda ? <span className="chip good">conectada</span> : null}</b>
                <small>As audiências e os compromissos em que você for “quem vai” entram na sua agenda do Google, e o Calendário do Órion mostra os seus eventos pessoais.</small>
              </div>
              {!conexao?.agenda && <a className="btn sm primary" href="/api/google/usuario/conectar?recurso=agenda">Conectar minha Agenda</a>}
            </div>
            <div className="google-item">
              <div>
                <b>Gmail {conexao?.gmail ? <span className="chip good">conectado</span> : null}</b>
                <small>
                  O Órion lê no seu Gmail só os e-mails do Recorte Digital da OAB/ES e leva as publicações para Publicações, sozinho, às 7h e às 10h
                  (e quando alguém abre Publicações). Não lê nem guarda os outros e-mails.
                  {conexao?.gmail && <> Última leitura: {quando(conexao.gmail_lido_em)}.</>}
                </small>
              </div>
              {conexao?.gmail ? (
                <BotaoAcao acao={buscarRecorteAgora} rotulo="Buscar agora" />
              ) : (
                <a className="btn sm primary" href="/api/google/usuario/conectar?recurso=gmail">Conectar meu Gmail</a>
              )}
            </div>
            <p className="dica" style={{ margin: 0 }}>
              Na tela do Google pode aparecer “O Google não verificou este app”: clique em <b>Avançado › Acessar</b> (é o próprio Órion do escritório) e marque as caixas de permissão.
            </p>
            {conexao && (
              <BotaoAcao acao={desconectarMeuGoogle} rotulo="Desconectar minha conta Google" className="linkbtn" confirmar="Desconectar a sua conta Google? A Agenda e o Gmail deixam de ser usados pelo Órion." />
            )}
          </div>
        )}
      </div>
      <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
        <div className="ctitle"><h3>Aparência</h3></div>
        <EscolherTema />
      </div>
      <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
        <div className="ctitle"><h3>Notificações de mensagem nova</h3></div>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--muted)" }}>
          Aviso no celular ou no computador quando um cliente escreve, mesmo com o CRM fechado. Ligue em cada aparelho que você usa.
        </p>
        <AtivarNotificacoes />
      </div>
      <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
        <div className="ctitle"><h3>Trocar senha</h3></div>
        <FormAcao action={trocarSenha} botao="Trocar senha" className="form">
          <div className="field"><label htmlFor="senha">Senha nova</label><input id="senha" name="senha" type="password" required minLength={8} autoComplete="new-password" /></div>
          <div className="field"><label htmlFor="repetir">Repita a senha nova</label><input id="repetir" name="repetir" type="password" required minLength={8} autoComplete="new-password" /></div>
        </FormAcao>
      </div>
    </div>
  );
}
