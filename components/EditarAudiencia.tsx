"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { editarAudiencia } from "@/app/(app)/actions";
import { useAviso } from "@/components/Avisos";
import { Icone } from "@/components/Icone";
import { TIPOS_AUDIENCIA } from "@/lib/rotulos";

export type AudienciaEditavel = {
  id: string;
  tipo: string;
  data: string; // AAAA-MM-DD, horário de Brasília
  hora: string; // HH:MM
  modalidade: "presencial" | "video";
  local: string | null;
  observacoes: string | null;
  responsavel_id: string | null;
  descricao: string; // "Conciliação · NOME", para o título da janela
};
export type ModeloDaAudiencia = { id: string; nome: string; quando: string; marcado: boolean };

// "Editar" de uma audiência: abre a janela com os dados atuais; ao salvar, a Google Agenda e as
// mensagens ao cliente são refeitas com o que mudou.
export function EditarAudiencia({ aud, pessoas, modelos }: { aud: AudienciaEditavel; pessoas: { id: string; nome: string }[]; modelos: ModeloDaAudiencia[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, pendente] = useActionState(editarAudiencia, { erro: null, ok: null });
  const naLista = TIPOS_AUDIENCIA.includes(aud.tipo);

  useEffect(() => {
    if (!estado.ok) return;
    setAberto(false);
    if (aviso) aviso(estado.ok);
    router.refresh();
  }, [estado, aviso, router]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  return (
    <>
      <button type="button" className="linkbtn editar" onClick={() => setAberto(true)}>Editar</button>
      {aberto && (
        <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && !pendente && setAberto(false)}>
          <div className="card modal" role="dialog" aria-modal="true" aria-label="Editar audiência">
            <div className="ctitle">
              <h3>Editar audiência</h3>
              <button type="button" className="hbtn-claro" onClick={() => setAberto(false)} aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13.5 }}>{aud.descricao}</p>
            <form action={enviar} className="form">
              <input type="hidden" name="id" value={aud.id} />
              <div className="field">
                <label htmlFor="ea_tipo">Tipo</label>
                <select id="ea_tipo" name="tipo" defaultValue={naLista ? aud.tipo : TIPOS_AUDIENCIA[0]}>
                  {TIPOS_AUDIENCIA.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="ea_tipo_outro">Outro tipo (opcional)</label><input id="ea_tipo_outro" name="tipo_outro" defaultValue={naLista ? "" : aud.tipo} placeholder="se não estiver na lista" /></div>
              <div className="field"><label htmlFor="ea_data">Dia</label><input id="ea_data" name="data" type="date" required defaultValue={aud.data} /></div>
              <div className="field"><label htmlFor="ea_hora">Hora</label><input id="ea_hora" name="hora" type="time" required defaultValue={aud.hora} /></div>
              <div className="field">
                <label htmlFor="ea_modalidade">Modalidade</label>
                <select id="ea_modalidade" name="modalidade" defaultValue={aud.modalidade}>
                  <option value="presencial">Presencial</option>
                  <option value="video">Por vídeo</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="ea_responsavel">Quem vai</label>
                <select id="ea_responsavel" name="responsavel_id" defaultValue={aud.responsavel_id ?? ""}>
                  <option value="">A definir</option>
                  {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="field full"><label htmlFor="ea_local">Local</label><input id="ea_local" name="local" defaultValue={aud.local ?? ""} placeholder="ex.: 2ª Vara do Trabalho de Vitória · sala 3" /></div>
              <div className="field full"><label htmlFor="ea_obs">Observações</label><textarea id="ea_obs" name="observacoes" rows={2} defaultValue={aud.observacoes ?? ""} /></div>
              {modelos.length > 0 && (
                <fieldset className="full modelos-aud">
                  <legend>Mensagens ao cliente pelo WhatsApp</legend>
                  {modelos.map((m) => (
                    <label key={m.id}>
                      <input type="checkbox" name={`modelo_${m.id}`} defaultChecked={m.marcado} style={{ width: 18, height: 18 }} />
                      <span>{m.nome} <small>· {m.quando}</small></span>
                    </label>
                  ))}
                  <small>Já vêm marcadas as que estão programadas hoje. Ao salvar, as que ainda não saíram são refeitas com a data e o local novos; as já enviadas não mudam.</small>
                </fieldset>
              )}
              <div className="full" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="submit" className="btn primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar alterações"}</button>
                <button type="button" className="btn" onClick={() => setAberto(false)} disabled={pendente}>Cancelar</button>
                {estado.erro && <span className="aviso erro">{estado.erro}</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
