// Ícones de traço (estilo Material Symbols / Lucide), no lugar de emojis. Herdam a cor do texto.
const CAMINHOS = {
  usuario: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  pasta: <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />,
  documento: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M14 3.5V8h4M9 12.5h6M9 16h6" /></>,
  assinar: <><path d="M7 3.5h7l4 4V11" /><path d="M14 3.5V8h4M6.5 20.5V4M13 20l7-7 1.5 1.5-7 7H13z" /></>,
  balanca: <><path d="M12 4v16M6 7h12M8.5 20h7" /><path d="M6 7l-3 6.5a3 3 0 0 0 6 0zM18 7l-3 6.5a3 3 0 0 0 6 0z" /></>,
  sino: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  clipe: <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.3-8.3a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />,
  microfone: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>,
  raio: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  baixar: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></>,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  relogio: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  conversa: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-5 4z" />,
  tribunal: <><path d="M3.5 9.5L12 4l8.5 5.5z" /><path d="M5.5 10v7.5M9.5 10v7.5M14.5 10v7.5M18.5 10v7.5M3.5 20h17" /></>,
  seta: <path d="M5 12h14M13 6l6 6-6 6" />,
  mais: <path d="M12 5v14M5 12h14" />,
  busca: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.5-4.5" /></>,
  enviar: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  lua: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  automatico: <><rect x="3.5" y="4.5" width="17" height="12" rx="1.5" /><path d="M8.5 20h7M12 16.5V20" /></>,
  nota: <><path d="M5 4.5h14v11l-4.5 4.5H5z" /><path d="M14.5 20v-4.5H19M8.5 9h7M8.5 12.5h4" /></>,
  etapa: <path d="M4 12h12M12 7l5 5-5 5M20 5v14" />,
  tarefa: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  foto: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5L6 19" /></>,
  video: <><rect x="3.5" y="6" width="12" height="12" rx="2" /><path d="M15.5 10.5l5-3v9l-5-3z" /></>,
  painel: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M15 4.5v15" /></>,
  desfazer: <><path d="M9 14L4.5 9.5 9 5" /><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" /></>,
  sair: <path d="M10 5H5.5v14H10M15 8l4 4-4 4M19 12H9" />,
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 18, className = "icone" }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CAMINHOS[nome]}
    </svg>
  );
}
