import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/Marca";

export const metadata: Metadata = { title: "Órion CRM · Goularte Filho Advocacia" };

// Página pública do aplicativo (exigida pelo Google para a tela de autorização).
export default function Sobre() {
  return (
    <main className="doc">
      <div className="doc-topo"><Marca /></div>
      <article className="card">
        <h1>Órion CRM</h1>
        <p>
          O Órion CRM é o sistema interno de atendimento e gestão de casos do escritório <b>Goularte Filho Advocacia</b>.
          É usado somente pela equipe do escritório para organizar clientes, casos, tarefas e audiências.
        </p>
        <h2>Uso das contas Google</h2>
        <p>
          Com a autorização do titular da conta Google do escritório, o sistema acessa o <b>Google Drive</b> para criar e
          localizar as pastas dos clientes e salvar nelas os documentos enviados pelos próprios clientes, e o{" "}
          <b>Google Agenda</b> para registrar as audiências do escritório. Nenhum dado obtido do Google é vendido, usado
          para publicidade ou compartilhado com terceiros.
        </p>
        <p>
          Detalhes sobre dados pessoais estão na <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
        <p style={{ marginTop: 24 }}>
          <Link className="btn primary" href="/login">Entrar no sistema</Link>
        </p>
      </article>
    </main>
  );
}
