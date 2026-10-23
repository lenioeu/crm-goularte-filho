import { AtivarNotificacoes } from "@/components/AtivarNotificacoes";
import { EscolherTema } from "@/components/EscolherTema";
import { FormAcao } from "@/components/FormAcao";
import { supabaseServer } from "@/lib/supabase/server";
import { salvarPerfil, trocarSenha } from "../actions";

export default async function Perfil() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
