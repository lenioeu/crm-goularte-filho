// Calendário: tipos de evento, cores e o formato comum que a tela usa para audiências, compromissos,
// prazos e tarefas. Este arquivo também roda no navegador: nada de servidor aqui.

export type TipoEvento = "audiencia" | "reuniao" | "atendimento" | "diligencia" | "compromisso" | "outro" | "prazo" | "tarefa" | "google";
export type TipoCompromisso = Extract<TipoEvento, "reuniao" | "atendimento" | "diligencia" | "compromisso" | "outro">;

export const TIPOS_EVENTO: { id: TipoEvento; rotulo: string; cor: string }[] = [
  { id: "audiencia", rotulo: "Audiência", cor: "#7c3aed" },
  { id: "reuniao", rotulo: "Reunião", cor: "#2563eb" },
  { id: "atendimento", rotulo: "Atendimento", cor: "#16a34a" },
  { id: "diligencia", rotulo: "Diligência", cor: "#ea580c" },
  { id: "compromisso", rotulo: "Compromisso", cor: "#0891b2" },
  { id: "outro", rotulo: "Outro", cor: "#64748b" },
  { id: "prazo", rotulo: "Prazo", cor: "#dc2626" },
  { id: "tarefa", rotulo: "Tarefa", cor: "#db2777" },
  { id: "google", rotulo: "Minha agenda Google", cor: "#78716c" },
];

export const TIPOS_COMPROMISSO = TIPOS_EVENTO.filter((t) => ["reuniao", "atendimento", "diligencia", "compromisso", "outro"].includes(t.id)) as {
  id: TipoCompromisso;
  rotulo: string;
  cor: string;
}[];

export const corDoTipo = (t: TipoEvento) => TIPOS_EVENTO.find((x) => x.id === t)?.cor ?? "#64748b";
export const rotuloDoTipo = (t: TipoEvento) => TIPOS_EVENTO.find((x) => x.id === t)?.rotulo ?? "Evento";

/** Evento já pronto para a tela (as datas em horário de Brasília). */
export type EventoCal = {
  chave: string; // tipo + id
  id: string;
  tipo: TipoEvento;
  dia: string; // AAAA-MM-DD
  hora: string | null; // HH:MM; null = dia inteiro (prazos e tarefas)
  titulo: string;
  detalhe: string | null;
  cliente: { id: string; nome: string } | null;
  href: string | null;
  urgente?: boolean; // prazo vencido ou de hoje, tarefa atrasada
};
