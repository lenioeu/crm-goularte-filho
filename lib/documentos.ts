import type { SupabaseClient } from "@supabase/supabase-js";
import { ADVOGADO_PADRAO, type AdvogadoDoc, type ClienteDoc, ESCRITORIO_PADRAO, type EscritorioDoc } from "@/lib/modelos";

// Busca no banco o que os modelos precisam: cliente, advogados escolhidos e dados do escritório.

export const CAMPOS_QUALIFICACAO = "nome, cpf_cnpj, rg, nacionalidade, estado_civil, profissao, endereco, cep, email, telefone_whatsapp, genero";

export async function dadosDoEscritorio(db: SupabaseClient): Promise<EscritorioDoc> {
  const { data } = await db.from("configuracoes").select("valor").eq("chave", "escritorio_documentos").maybeSingle();
  const salvo = (data?.valor ?? {}) as Partial<EscritorioDoc>;
  return { ...ESCRITORIO_PADRAO, ...Object.fromEntries(Object.entries(salvo).filter(([, x]) => typeof x === "string")) };
}

/** Pessoas da equipe com OAB cadastrada (no Meu perfil), para escolher como outorgados/contratados. */
export async function advogadosDaEquipe(db: SupabaseClient) {
  const { data } = await db.from("perfis").select("id, nome, oab").eq("ativo", true).not("oab", "is", null).order("nome");
  return (data ?? []).filter((p) => p.oab?.trim()) as { id: string; nome: string; oab: string }[];
}

export async function carregarCliente(db: SupabaseClient, id: string): Promise<{ cliente: ClienteDoc | null; erro: string | null }> {
  const { data, error } = await db.from("clientes").select(CAMPOS_QUALIFICACAO + ", pasta_drive_id").eq("id", id).maybeSingle();
  if (error) {
    const semColunas = /column|coluna/i.test(error.message);
    return { cliente: null, erro: semColunas ? "Falta rodar o script supabase/004_modelos.sql no Supabase." : error.message };
  }
  return { cliente: data as unknown as ClienteDoc | null, erro: null };
}

export function escolherAdvogados(equipe: { id: string; nome: string; oab: string }[], ids: string[]): AdvogadoDoc[] {
  const escolhidos = equipe.filter((p) => ids.includes(p.id));
  return escolhidos.length ? escolhidos : equipe.length ? [] : [ADVOGADO_PADRAO];
}
