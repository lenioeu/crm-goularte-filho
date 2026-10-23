import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeloEditor } from "@/components/ModeloEditor";
import { dadosDoEscritorio } from "@/lib/documentos";
import { quemSou } from "@/lib/permissoes";
import { salvarModelo } from "../actions";

const ESQUELETO = `# TÍTULO DO DOCUMENTO
{{QUALIFICACAO}}, declara que…
{{CIDADE}}, {{DATA_EXTENSO}}.
{{ASSINATURA_CLIENTE:Declarante}}`;

export default async function EditarModelo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, papel } = await quemSou();
  const podeEditar = papel === "administrador" || papel === "advogado";
  const escritorio = await dadosDoEscritorio(supabase);

  let inicial = { id: "", nome: "", arquivo: "", descricao: "", conteudo: ESQUELETO, ordem: 100, rodape: true };
  if (id !== "novo") {
    const campos = "id, nome, arquivo, descricao, conteudo, ordem";
    let { data, error } = await supabase.from("modelos").select(`${campos}, rodape`).eq("id", id).maybeSingle();
    // Sem o script 011 ainda não existe a coluna "rodape"
    if (error && /rodape/.test(error.message)) ({ data } = await supabase.from("modelos").select(campos).eq("id", id).maybeSingle());
    if (!data) notFound();
    inicial = { ...data, descricao: data.descricao ?? "", rodape: (data as { rodape?: boolean }).rodape !== false };
  }

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <Link href="/modelos" style={{ color: "var(--accent)", fontSize: 13 }}>‹ Modelos</Link>
          <h1 style={{ marginTop: 4 }}>{id === "novo" ? "Novo modelo" : inicial.nome}</h1>
          <p>{podeEditar ? "A prévia ao lado muda enquanto você digita." : "Só administradores e advogados editam modelos."}</p>
        </div>
      </div>
      <ModeloEditor action={salvarModelo} inicial={inicial} escritorio={escritorio} podeEditar={podeEditar} />
    </div>
  );
}
