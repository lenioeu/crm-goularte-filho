import Link from "next/link";
import { CampoCpf } from "@/components/CampoCpf";
import { FormAcao } from "@/components/FormAcao";
import { type LinhaCliente, TabelaClientes } from "@/components/TabelaClientes";
import { quemSou } from "@/lib/permissoes";
import { criarCliente } from "../actions";
import { lerTiposContato } from "@/lib/contatos";
import { BotaoAcao } from "@/components/BotaoAcao";
import { criarTipoContato, removerTipoContato } from "./actions";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);
type Busca = { ver?: string; tipo?: string; q?: string; area?: string; resp?: string; origem?: string; whatsapp?: string; pasta?: string; processo?: string };

export default async function Clientes({ searchParams }: { searchParams: Promise<Busca> }) {
  const f = await searchParams;
  const { supabase, papel } = await quemSou();
  const verContatos = f.ver === "contatos";
  const campos = "id, nome, telefone_whatsapp, cpf_cnpj, email, origem, area_id, responsavel_id, pasta_drive_url, criado_em, areas(nome, cor), perfis(nome)";
  const buscar = (cols: string) => supabase.from("clientes").select(cols).order("nome").limit(5000);
  // Sem o script 012 não há "situacao": todo mundo conta como cliente
  const consulta = buscar(campos + ", situacao, contato_tipo").then(async (r) => (r.error ? buscar(campos) : r));
  const [{ data: cadastros, error }, { data: areas }, { data: google }, { data: pessoas }, { data: procs }, tiposContato] = await Promise.all([
    consulta,
    supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
    supabase.from("configuracoes").select("chave").in("chave", ["google_email", "pasta_clientes"]),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("processos").select("casos(cliente_id)").limit(20000),
    lerTiposContato(supabase),
  ]);
  type Cadastro = { id: string; nome: string; telefone_whatsapp: string | null; cpf_cnpj: string | null; email: string | null; origem: string | null; area_id: string | null; responsavel_id: string | null; pasta_drive_url: string | null; criado_em: string; areas: unknown; perfis: unknown; situacao?: string; contato_tipo?: string | null };
  const todosCadastros = (cadastros ?? []) as unknown as Cadastro[];
  const ehContato = (c: Cadastro) => c.situacao === "contato";
  const nContatos = todosCadastros.filter(ehContato).length;
  const nClientes = todosCadastros.length - nContatos;
  const clientes = todosCadastros.filter((c) => ehContato(c) === verContatos);
  const driveLigado = (google ?? []).length === 2;

  const porCliente = new Map<string, number>();
  for (const p of procs ?? []) {
    const id = um(p.casos as Rel<{ cliente_id: string }>)?.cliente_id;
    if (id) porCliente.set(id, (porCliente.get(id) ?? 0) + 1);
  }
  const origens = [...new Set((clientes ?? []).map((c) => c.origem).filter(Boolean))].sort() as string[];
  const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = sem((f.q ?? "").trim());
  const qd = (f.q ?? "").replace(/\D/g, "");

  const todas: LinhaCliente[] = (clientes ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    cpf_cnpj: c.cpf_cnpj,
    telefone_whatsapp: c.telefone_whatsapp,
    email: c.email,
    origem: c.origem,
    area: um(c.areas as Rel<{ nome: string; cor: string }>),
    responsavel: um(c.perfis as Rel<{ nome: string }>)?.nome ?? null,
    processos: porCliente.get(c.id) ?? 0,
    pasta_drive_url: c.pasta_drive_url,
    criado_em: c.criado_em,
    tipo: verContatos ? c.contato_tipo ?? "Sem tipo" : null,
  }));
  const extra = new Map((clientes ?? []).map((c) => [c.id, c]));
  const lista = todas.filter((c) => {
    const x = extra.get(c.id)!;
    if (q && !sem(c.nome).includes(q) && !(qd.length >= 3 && ((c.cpf_cnpj ?? "").replace(/\D/g, "").includes(qd) || (c.telefone_whatsapp ?? "").includes(qd)))) return false;
    if (f.area === "sem" ? x.area_id : f.area && x.area_id !== f.area) return false;
    if (f.resp === "sem" ? x.responsavel_id : f.resp && x.responsavel_id !== f.resp) return false;
    if (f.origem && c.origem !== f.origem) return false;
    if (verContatos && f.tipo && (x.contato_tipo ?? "") !== (f.tipo === "sem" ? "" : f.tipo)) return false;
    if (f.whatsapp === "sem" && c.telefone_whatsapp) return false;
    if (f.whatsapp === "com" && !c.telefone_whatsapp) return false;
    if (f.pasta === "sem" && c.pasta_drive_url) return false;
    if (f.pasta === "com" && !c.pasta_drive_url) return false;
    if (f.processo === "sem" && c.processos) return false;
    if (f.processo === "com" && !c.processos) return false;
    return true;
  });
  const filtrando = Object.entries(f).some(([k, v]) => k !== "ver" && Boolean(v));
  const base = verContatos ? "/clientes?ver=contatos" : "/clientes";

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>{verContatos ? "Contatos" : "Clientes"}</h1>
          <p>
            {verContatos
              ? `${todas.length} ${todas.length === 1 ? "contato" : "contatos"} que ainda não ${todas.length === 1 ? "é cliente" : "são clientes"}`
              : `${todas.length} ${todas.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}`}
            {filtrando ? ` · ${lista.length} com esses filtros` : ""}.{" "}
            {verContatos
              ? "Quem escreve pela primeira vez no WhatsApp entra aqui. Quando fechar com o escritório, use “Tornar cliente” na conversa ou na ficha."
              : "Contatos do WhatsApp entram em Contatos e passam para cá com “Tornar cliente”."}
          </p>
        </div>
      </div>

      <nav className="abas-clientes" aria-label="Clientes ou contatos">
        <Link className={"btn" + (verContatos ? "" : " on")} href="/clientes">Clientes · {nClientes}</Link>
        <Link className={"btn" + (verContatos ? " on" : "")} href="/clientes?ver=contatos">Contatos · {nContatos}</Link>
      </nav>

      {verContatos && (
        <div className="card" style={{ marginBottom: 16 }} id="tipos">
          <div className="ctitle"><h3>Tipos de contato</h3><span className="tag">adicione ou remova quando quiser</span></div>
          <div className="tipos-lista">
            {tiposContato.map((t) => (
              <span key={t} className="chip">
                <Link href={`/clientes?ver=contatos&tipo=${encodeURIComponent(t)}`}>{t}</Link>
                <BotaoAcao acao={removerTipoContato.bind(null, t)} rotulo="×" className="tipo-remover" confirmar={`Remover o tipo “${t}”?`} />
              </span>
            ))}
          </div>
          <FormAcao action={criarTipoContato} botao="+ Adicionar tipo" className="chat-mini" limparAoSalvar>
            <input name="tipo" required placeholder="ex.: Perito, Imprensa, Correspondente" aria-label="Novo tipo de contato" />
          </FormAcao>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, display: verContatos ? "none" : undefined }} id="novo">
        <div className="ctitle"><h3>Novo cliente</h3></div>
        <FormAcao action={criarCliente} botao="Cadastrar cliente" className="form maiusculas">
          <div className="field full"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" required placeholder="ex.: MARIA DA SILVA SANTOS" /></div>
          <div className="field"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" inputMode="tel" placeholder="(27) 99999-9999" /></div>
          <div className="field"><label htmlFor="cpf">CPF ou CNPJ</label><CampoCpf /></div>
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" /></div>
          <div className="field">
            <label htmlFor="area_id">Área</label>
            <select id="area_id" name="area_id" defaultValue="">
              <option value="">A definir</option>
              {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
        </FormAcao>
      </div>

      <form method="get" className="card filtros-clientes" style={{ marginBottom: 16 }}>
        {verContatos && <input type="hidden" name="ver" value="contatos" />}
        {verContatos && (
          <select name="tipo" defaultValue={f.tipo ?? ""} aria-label="Tipo de contato">
            <option value="">Todos os tipos</option>
            {tiposContato.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="sem">Sem tipo</option>
          </select>
        )}
        <input name="q" defaultValue={f.q ?? ""} placeholder="Nome, CPF ou telefone" aria-label="Procurar" />
        <select name="area" defaultValue={f.area ?? ""} aria-label="Área">
          <option value="">Todas as áreas</option>
          {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          <option value="sem">Área a definir</option>
        </select>
        <select name="resp" defaultValue={f.resp ?? ""} aria-label="Responsável">
          <option value="">Qualquer responsável</option>
          {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          <option value="sem">Sem responsável</option>
        </select>
        <select name="processo" defaultValue={f.processo ?? ""} aria-label="Processos">
          <option value="">Com ou sem processo</option>
          <option value="com">Com processo</option>
          <option value="sem">Sem processo</option>
        </select>
        <select name="whatsapp" defaultValue={f.whatsapp ?? ""} aria-label="WhatsApp">
          <option value="">Com ou sem WhatsApp</option>
          <option value="com">Com WhatsApp</option>
          <option value="sem">Sem WhatsApp</option>
        </select>
        <select name="pasta" defaultValue={f.pasta ?? ""} aria-label="Pasta no Drive">
          <option value="">Com ou sem pasta</option>
          <option value="com">Com pasta no Drive</option>
          <option value="sem">Sem pasta no Drive</option>
        </select>
        {origens.length > 0 && (
          <select name="origem" defaultValue={f.origem ?? ""} aria-label="Origem">
            <option value="">Qualquer origem</option>
            {origens.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <button className="btn primary" type="submit">Filtrar</button>
        {filtrando && <Link className="btn" href={base}>Limpar</Link>}
      </form>

      <div className="card" style={{ padding: "6px 6px 2px" }}>
        {error && <div className="aviso erro" style={{ margin: 12 }}>Não foi possível carregar os clientes: {error.message}</div>}
        {todas.length === 0 ? (
          verContatos ? (
            <div className="vazio"><b>Nenhum contato</b>Quem escrever pela primeira vez no WhatsApp aparece aqui.</div>
          ) : (
            <div className="vazio"><b>Nenhum cliente ainda</b>Cadastre o primeiro no formulário acima.</div>
          )
        ) : lista.length === 0 ? (
          <div className="vazio"><b>Nada com esses filtros</b><Link href={base} style={{ color: "var(--accent)" }}>Limpar filtros</Link></div>
        ) : (
          <TabelaClientes linhas={lista} admin={papel === "administrador"} driveLigado={driveLigado} />
        )}
      </div>
    </div>
  );
}
