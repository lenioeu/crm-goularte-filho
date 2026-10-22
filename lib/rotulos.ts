export const ETAPA: Record<string, string> = {
  primeiro_contato: "Primeiro contato",
  triagem: "Triagem",
  consulta_agendada: "Consulta agendada",
  proposta: "Proposta de honorários",
  contrato_assinado: "Contrato assinado",
  nao_viavel: "Não viável",
};

export const COLUNA_TAREFA: Record<string, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  revisao: "Revisão",
  concluida: "Concluída",
};

export const TIPO_AGENDAMENTO: Record<string, string> = {
  lembrete_audiencia: "Lembrete de audiência",
  follow_up: "Follow-up",
  livre: "Mensagem",
};

export const TZ = "America/Sao_Paulo";

export function telefoneBR(t: string | null | undefined) {
  if (!t) return "—";
  const d = t.replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** "MARIA DA SILVA" → "Maria" */
export const primeiroNome = (nome: string) =>
  nome.trim().toLowerCase().split(/\s+/)[0]?.replace(/^./, (c) => c.toUpperCase()) ?? "";
