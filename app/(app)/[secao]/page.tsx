import Link from "next/link";
import { notFound } from "next/navigation";

// Telas que ainda vão ser construídas, na ordem das etapas do projeto.
const SECOES: Record<string, { titulo: string; etapa: string; texto: string }> = {
  atendimento: { titulo: "Atendimento", etapa: "Etapa 5 · WhatsApp", texto: "Caixa de entrada compartilhada, bot de triagem por área e envio de documentos para a pasta do cliente." },
  indicadores: { titulo: "Indicadores", etapa: "Etapa 6", texto: "Números do mês por pessoa e do escritório, para consulta, sem ranking." },
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
