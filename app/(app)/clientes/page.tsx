import Link from "next/link";
import { FormAcao } from "@/components/FormAcao";
import { type LinhaCliente, TabelaClientes } from "@/components/TabelaClientes";
import { quemSou } from "@/lib/permissoes";
import { criarCliente } from "../actions";

type Rel<T> = T | T[] | null;
const um = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);
type Busca = { q?: string; area?: string; resp?: string; origem?: string; whatsapp?: string; pasta?: string; processo?: string };

export default async function Clientes({ searchParams }: { searchParams: Promise<Busca> }) {
  const f = await searchParams;
  const { supabase, papel } = await quemSou();
  const [{ data: clientes, error }, { data: areas }, { data: google }, { data: pessoas }, { data: procs }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome, telefone_whatsapp, cpf_cnpj, email, origem, area_id, responsavel_id, pasta_drive_url, criado_em, areas(nome, cor), perfis(nome)")
      .order("nome")
      .limit(5000),
    supabase.from("areas").select("id, nome").eq("ativa", true).order("ordem_bot"),
    supabase.from("configuracoes").select("chave").in("chave", ["google_email", "pasta_clientes"]),
    supabase.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("processos").select("casos(cliente_id)").limit(20000),
  ]);
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
  }));
  const extra = new Map((clientes ?? []).map((c) => [c.id, c]));
  const lista = todas.filter((c) => {
    const x = extra.get(c.id)!;
    if (q && !sem(c.nome).includes(q) && !(qd.length >= 3 && ((c.cpf_cnpj ?? "").replace(/\D/g, "").includes(qd) || (c.telefone_whatsapp ?? "").includes(qd)))) return false;
    if (f.area === "sem" ? x.area_id : f.area && x.area_id !== f.area) return false;
    if (f.resp === "sem" ? x.responsavel_id : f.resp && x.responsavel_id !== f.resp) return false;
    if (f.origem && c.origem !== f.origem) return false;
    if (f.whatsapp === "sem" && c.telefone_whatsapp) return false;
    if (f.whatsapp === "com" && !c.telefone_whatsapp) return false;
    if (f.pasta === "sem" && c.pasta_drive_url) return false;
    if (f.pasta === "com" && !c.pasta_drive_url) return false;
    if (f.processo === "sem" && c.processos) return false;
    if (f.processo === "com" && !c.processos) return false;
    return true;
  });
  const filtrando = Object.values(f).some(Boolean);

  return (
    <div className="view">
      <div className="vhead">
        <div>
          <h1>Clientes</h1>
          <p>{todas.length} {todas.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}{filtrando ? ` · ${lista.length} com esses filtros` : ""}. Quem escreve pela primeira vez no WhatsApp do escritório é cadastrado sozinho.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ctitle"><h3>Novo cliente</h3></div>
        <FormAcao action={criarCliente} botao="Cadastrar cliente" className="form">
          <div className="field full"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" required placeholder="ex.: MARIA DA SILVA SANTOS" /></div>
          <div className="field"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" inputMode="tel" placeholder="(27) 99999-9999" /></div>
          <div className="field"><label htmlFor="cpf">CPF ou CNPJ</label><input id="cpf" name="cpf" /></div>
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
        {filtrando && <Link className="btn" href="/clientes">Limpar</Link>}
      </form>

      <div className="card" style={{ padding: "6px 6px 2px" }}>
        {error && <div className="aviso erro" style={{ margin: 12 }}>Não foi possível carregar os clientes: {error.message}</div>}
        {todas.length === 0 ? (
          <div className="vazio"><b>Nenhum cliente ainda</b>Cadastre o primeiro no formulário acima.</div>
        ) : lista.length === 0 ? (
          <div className="vazio"><b>Nenhum cliente com esses filtros</b><Link href="/clientes" style={{ color: "var(--accent)" }}>Limpar filtros</Link></div>
        ) : (
          <TabelaClientes linhas={lista} admin={papel === "administrador"} driveLigado={driveLigado} />
        )}
      </div>
    </div>
  );
}
