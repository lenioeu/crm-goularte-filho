import Link from "next/link";
import { FormAcao } from "@/components/FormAcao";
import { RespostasEditor } from "@/components/RespostasEditor";
import { DIAS, dentroDoExpediente, lerConfigBot, montarTexto, RESPOSTAS_PADRAO } from "@/lib/bot";
import { quemSou } from "@/lib/permissoes";
import type { RespostaRapida } from "./actions";
import { salvarConfigBot, salvarRespostaAuto } from "./actions";

export default async function AtendimentoAutomatico() {
  const { supabase, papel } = await quemSou();
  const admin = papel === "administrador";
  const [cfg, { data: areas }, { data: resp }] = await Promise.all([
    lerConfigBot(supabase),
    supabase.from("areas").select("id, nome, documentos_pedidos").eq("ativa", true).order("ordem_bot"),
    supabase.from("configuracoes").select("valor").eq("chave", "respostas_rapidas").maybeSingle(),
  ]);
  // Nunca salvas: começa pelas de fábrica, para editar
  const respostas = (Array.isArray(resp?.valor) ? resp.valor : resp ? [] : RESPOSTAS_PADRAO) as RespostaRapida[];
  const noMenu = (areas ?? []).filter((a) => !cfg.areasMenu || cfg.areasMenu.includes(a.id));
  const menu = [...noMenu.map((a, i) => `${i + 1} - ${a.nome}`), "0 - Outro assunto"].join("\n");
  const exemplo = noMenu[0];
  const agoraDentro = dentroDoExpediente(cfg);

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Atendimento automático</h1>
          <p>
            O que o WhatsApp responde sozinho para quem escreve pela primeira vez, e as respostas rápidas da equipe. Agora estamos{" "}
            <b>{agoraDentro ? "dentro" : "fora"} do expediente</b>.
          </p>
        </div>
      </div>
      {!admin && <div className="aviso info" style={{ marginBottom: 16 }}>Só o administrador altera a triagem. Respostas rápidas: administradores e advogados.</div>}

      <div className="grid cols-2e" style={{ alignItems: "start" }}>
        <FormAcao action={salvarConfigBot} botao="Salvar atendimento automático" className="card form" limparAoSalvar={false}>
          <div className="field full">
            <label>Quando responder</label>
            <div className="opcoes">
              {[
                ["sempre", "Sempre", "a triagem responde a qualquer hora"],
                ["fora", "Só fora do expediente", "no horário, a conversa vai direto para a fila"],
                ["desligado", "Desligado", "ninguém recebe resposta automática"],
              ].map(([v, r, d]) => (
                <label key={v} className="opcao">
                  <input type="radio" name="modo" value={v} defaultChecked={cfg.modo === v} disabled={!admin} />
                  <span><b>{r}</b><small>{d}</small></span>
                </label>
              ))}
            </div>
          </div>

          <div className="field full">
            <label>Expediente</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {DIAS.map((d, i) => (
                <label key={d} className="dia">
                  <input type="checkbox" name="dias" value={i} defaultChecked={cfg.dias.includes(i)} disabled={!admin} /> {d}
                </label>
              ))}
              <span style={{ fontSize: 13.5 }}>das</span>
              <input type="time" name="inicio" defaultValue={cfg.inicio} disabled={!admin} aria-label="Início do expediente" style={{ width: 120 }} />
              <span style={{ fontSize: 13.5 }}>às</span>
              <input type="time" name="fim" defaultValue={cfg.fim} disabled={!admin} aria-label="Fim do expediente" style={{ width: 120 }} />
            </div>
          </div>

          <div className="field full">
            <label htmlFor="saudacao">Primeira mensagem (com o menu)</label>
            <textarea id="saudacao" name="saudacao" rows={5} defaultValue={cfg.saudacao} disabled={!admin} />
            <small className="dica">{"{nome}"} vira o primeiro nome · {"{menu}"} vira a lista de áreas abaixo (se não usar, ela vai no fim).</small>
          </div>
          <div className="field full">
            <label htmlFor="encaminhado">Depois que a pessoa escolhe a área</label>
            <textarea id="encaminhado" name="encaminhado" rows={4} defaultValue={cfg.encaminhado} disabled={!admin} />
            <small className="dica">{"{area}"} e {"{documentos}"} (a lista de documentos da área; a linha some se a área não tiver lista).</small>
          </div>
          <div className="field full">
            <label htmlFor="outro">Quando a pessoa responde 0 (outro assunto)</label>
            <textarea id="outro" name="outro" rows={2} defaultValue={cfg.outro} disabled={!admin} />
          </div>
          <div className="field full">
            <label htmlFor="foraExpediente">Aviso fora do expediente (opcional)</label>
            <textarea id="foraExpediente" name="foraExpediente" rows={3} defaultValue={cfg.foraExpediente} disabled={!admin} />
            <small className="dica">Vai antes do menu quando a mensagem chega fora do horário. Em branco, não avisa.</small>
            <label className="nota-check" style={{ marginTop: 6 }}>
              <input type="checkbox" name="avisarForaSempre" defaultChecked={cfg.avisarForaSempre} disabled={!admin} /> Avisar também quem já é cliente (no máximo uma vez a cada 12 horas)
            </label>
          </div>

          <div className="field full">
            <label>Áreas no menu</label>
            <label className="nota-check"><input type="checkbox" name="todas_areas" defaultChecked={!cfg.areasMenu} disabled={!admin} /> Todas as áreas ativas (inclusive as que forem criadas depois)</label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
              {(areas ?? []).map((a) => (
                <label key={a.id} className="dia">
                  <input type="checkbox" name="areas" value={a.id} defaultChecked={!cfg.areasMenu || cfg.areasMenu.includes(a.id)} disabled={!admin} /> {a.nome}
                </label>
              ))}
            </div>
            <small className="dica">Para escolher só algumas, desmarque “Todas”. A ordem, o nome e a lista de documentos se mudam em <Link href="/areas" style={{ color: "var(--accent)" }}>Áreas de atuação</Link>.</small>
          </div>
          <div className="field">
            <label htmlFor="tentativas">Tentativas antes de passar para a equipe</label>
            <input id="tentativas" name="tentativas" type="number" min={1} max={5} defaultValue={cfg.tentativas} disabled={!admin} />
          </div>
        </FormAcao>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" id="mensagem-automatica">
            <div className="ctitle"><h3>Mensagem automática</h3><span className={"chip " + (cfg.respostaAuto.ativa ? "good" : "")}>{cfg.respostaAuto.ativa ? "ligada" : "desligada"}</span></div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
              Uma resposta só, sem o menu de áreas, para quem escrever. Funciona mesmo com a triagem desligada. Não interrompe conversa em
              andamento: se alguém da equipe respondeu nas últimas 2 horas, ela não sai.
            </p>
            <FormAcao action={salvarRespostaAuto} botao="Salvar mensagem automática" className="form" limparAoSalvar={false}>
              <label className="nota-check full">
                <input type="checkbox" name="ativa" defaultChecked={cfg.respostaAuto.ativa} disabled={!admin} /> Ligar a mensagem automática
              </label>
              <div className="field full">
                <label>Quando</label>
                <div className="opcoes">
                  {[
                    ["fora", "Só fora do expediente", `fora de ${cfg.inicio} às ${cfg.fim} nos dias marcados ao lado`],
                    ["sempre", "Sempre", "a qualquer hora"],
                  ].map(([v, r, d]) => (
                    <label key={v} className="opcao">
                      <input type="radio" name="quando" value={v} defaultChecked={cfg.respostaAuto.quando === v} disabled={!admin} />
                      <span><b>{r}</b><small>{d}</small></span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field full">
                <label htmlFor="ra_texto">Mensagem</label>
                <textarea id="ra_texto" name="texto" rows={4} defaultValue={cfg.respostaAuto.texto} disabled={!admin} />
                <small className="dica">{"{nome}"} vira o primeiro nome da pessoa.</small>
              </div>
              <div className="field">
                <label htmlFor="ra_intervalo">Mandar de novo para a mesma pessoa só depois de</label>
                <select id="ra_intervalo" name="intervalo" defaultValue={String(cfg.respostaAuto.intervaloHoras)} disabled={!admin}>
                  {[1, 4, 12, 24, 48].map((h) => <option key={h} value={h}>{h} {h === 1 ? "hora" : "horas"}</option>)}
                </select>
              </div>
            </FormAcao>
          </div>

          <div className="card">
            <div className="ctitle"><h3>Como chega no celular</h3><span className="tag">com o que está salvo</span></div>
            <div className="previa-wa">
              <div className="balao-cliente">Oi, boa tarde</div>
              <div className="balao-escritorio">
                {!agoraDentro && cfg.foraExpediente.trim() ? `${montarTexto(cfg.foraExpediente, { nome: "Maria" })}\n\n` : ""}
                {montarTexto(cfg.saudacao.includes("{menu}") ? cfg.saudacao : `${cfg.saudacao}\n\n{menu}`, { nome: "Maria", menu })}
              </div>
              <div className="balao-cliente">1</div>
              <div className="balao-escritorio">{montarTexto(cfg.encaminhado, { nome: "Maria", area: exemplo?.nome ?? "Trabalhista", documentos: exemplo?.documentos_pedidos })}</div>
            </div>
          </div>

          <div className="card">
            <div className="ctitle"><h3>Respostas rápidas</h3></div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
              Na conversa, digite <b>/</b> e o atalho (ex.: <b>/docs</b>) para colar o texto pronto. {"{nome}"} vira o primeiro nome do cliente.
            </p>
            <RespostasEditor inicial={respostas} podeEditar={papel === "administrador" || papel === "advogado"} />
          </div>
        </div>
      </div>
    </div>
  );
}
