import Link from "next/link";
import { notFound } from "next/navigation";

// Telas que ainda vão ser construídas, na ordem das etapas do projeto.
const SECOES: Record<string, { titulo: string; etapa: string; texto: string }> = {
  atendimento: { titulo: "Atendimento", etapa: "Etapa 5 · WhatsApp", texto: "Caixa de entrada compartilhada, bot de triagem por área e envio de documentos para a pasta do cliente." },
  funil: { titulo: "Funil de casos", etapa: "Próxima entrega", texto: "Do primeiro contato ao contrato assinado, com motivo registrado para casos sem viabilidade." },
  processos: { titulo: "Processos", etapa: "Etapa 6", texto: "Número CNJ, vara, fase e última movimentação pela API pública do CNJ (DataJud)." },
  audiencias: { titulo: "Audiências", etapa: "Etapa 4 · Google Agenda", texto: "Audiências no Google Agenda de quem vai e lembrete ao cliente na véspera." },
  agendamentos: { titulo: "Mensagens agendadas", etapa: "Etapa 5 · WhatsApp", texto: "Lembretes de audiência, follow-ups e mensagens livres em dia e hora certos." },
  tarefas: { titulo: "Tarefas", etapa: "Próxima entrega", texto: "Tarefas ligadas a clientes e casos, com revisão das peças feitas por estagiários." },
  indicadores: { titulo: "Indicadores", etapa: "Etapa 6", texto: "Números do mês por pessoa e do escritório, para consulta, sem ranking." },
  integracoes: { titulo: "Integrações", etapa: "Etapas 4 e 5", texto: "Conexão com o WhatsApp, o Google Drive e o Google Agenda." },
};

export default async function EmBreve({ params }: { params: Promise<{ secao: string }> }) {
  const { secao } = await params;
  const s = SECOES[secao];
  if (!s) notFound();
  return (
    <div className="view">
      <div className="vhead"><div><h1>{s.titulo}</h1><p>{s.texto}</p></div></div>
      <div className="card vazio">
        <b>Em construção · {s.etapa}</b>
        Enquanto isso, veja como esta tela vai ficar no protótipo (arquivo docs/prototipo.html do repositório) ou volte ao <Link href="/" style={{ color: "var(--accent)" }}>Início</Link>.
      </div>
    </div>
  );
}
