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

// Listas em ordem, usadas tanto no servidor quanto nos cartões (não podem ficar em arquivo "use client").
export const ETAPAS_FUNIL = [
  { id: "primeiro_contato", rotulo: "Primeiro contato" },
  { id: "triagem", rotulo: "Triagem" },
  { id: "consulta_agendada", rotulo: "Consulta agendada" },
  { id: "proposta", rotulo: "Proposta de honorários" },
  { id: "contrato_assinado", rotulo: "Contrato assinado" },
] as const;

export const COLUNAS_TAREFA = [
  { id: "a_fazer", rotulo: "A fazer" },
  { id: "em_andamento", rotulo: "Em andamento" },
  { id: "revisao", rotulo: "Revisão" },
  { id: "concluida", rotulo: "Concluída" },
] as const;

/** Sugestões de "que documento é?" ao salvar arquivos do WhatsApp no Drive. */
/** Opção da lista que deixa a pessoa escrever o nome inteiro do arquivo. */
export const TIPO_OUTRO = "OUTRO";

export const TIPOS_DOCUMENTO = ["RG", "CPF", "CNH", "COMPROVANTE DE RESIDÊNCIA", "CTPS", "HOLERITE", "TRCT", "EXTRATO FGTS", "CNIS", "LAUDO MÉDICO", "CONTRATO", "PROCURAÇÃO", "CERTIDÃO", "BOLETIM DE OCORRÊNCIA", "FOTO", "ÁUDIO", "DOCUMENTO"];
