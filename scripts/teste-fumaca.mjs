// Teste de fumaça: liga o CRM já compilado (next start) contra um Supabase falso,
// abre todas as páginas logado como admin e falha se alguma der erro no servidor.
// Roda depois do `next build`, na Vercel e no computador: npm run teste
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import http from "node:http";
import { join, relative, sep } from "node:path";

const PORTA_BANCO = 54329;
const PORTA_APP = 3999;
const ID = "00000000-0000-4000-8000-000000000001";
const agora = new Date().toISOString();
const hoje = agora.slice(0, 10);

// ---------- Supabase falso ----------
// Cada consulta recebe uma linha de exemplo montada a partir do próprio "select",
// para as páginas renderizarem com dados (e não só com listas vazias).
const VALORES = {
  etapa: "triagem", coluna: "a_fazer", status: "programada", papel: "administrador", tipo: "follow_up", direcao: "entrada",
  modalidade: "presencial", cor: "#1a73e8", numero_cnj: "0000001-23.2026.5.04.0001", tribunal: "TRT4",
  telefone_whatsapp: "5551999999999", cpf_cnpj: "00000000000", email: "teste@exemplo.com",
  pasta_drive_url: "https://drive.google.com/drive/folders/x", chave: "pasta_clientes", valor: "x",
  movimentos: [{ data: hoje, nome: "Juntada de petição" }], ordem_bot: 1, oab: "RS 000000",
};
function valor(campo) {
  if (campo in VALORES) return VALORES[campo];
  if (campo === "id" || campo.endsWith("_id")) return ID;
  if (["vence_em", "ultima_movimentacao_em", "data"].includes(campo)) return hoje;
  if (campo.endsWith("_em") || campo === "inicio" || campo === "fim") return agora;
  if (/^(ativo|ativa|sigiloso|automatico|cancelar_se_responder|arquivado)$/.test(campo)) return campo !== "arquivado";
  if (["erro", "motivo_nao_viavel", "midia_url", "atendente_id", "pasta_drive_id"].includes(campo)) return null;
  return "Teste " + campo;
}
function separar(lista) {
  const partes = [];
  let nivel = 0, atual = "";
  for (const ch of lista) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { partes.push(atual); atual = ""; } else atual += ch;
  }
  if (atual) partes.push(atual);
  return partes.map((p) => p.trim()).filter(Boolean);
}
function linha(select) {
  const obj = {};
  for (const parte of separar(select)) {
    const m = parte.match(/^(?:(\w+):)?([\w]+)(?:!\w+)?\((.*)\)$/s);
    if (m) obj[m[1] ?? m[2]] = linha(m[3]);
    else if (parte !== "*") {
      const [alias, nome] = parte.includes(":") ? parte.split(":") : [parte, parte];
      obj[alias] = valor(nome);
    }
  }
  return obj;
}
const usuario = { id: ID, aud: "authenticated", role: "authenticated", email: "teste@exemplo.com", app_metadata: {}, user_metadata: {}, created_at: agora };
const chamadas = [];
const banco = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  chamadas.push(`${req.method} ${url.pathname}`);
  res.setHeader("content-type", "application/json");
  // Evolution API falso (WhatsApp)
  if (url.pathname.startsWith("/instance/connectionState/")) return res.end(JSON.stringify({ instance: { state: "open" } }));
  if (url.pathname.startsWith("/message/sendText/")) return res.end(JSON.stringify({ key: { id: "WA" + Date.now() } }));
  // Mensagem nova do WhatsApp ainda não registrada
  if (url.searchParams.has("whatsapp_id")) return res.end((req.headers.accept ?? "").includes("vnd.pgrst.object") ? "null" : "[]");
  if (url.pathname === "/auth/v1/user") return res.end(JSON.stringify(usuario));
  if (url.pathname.startsWith("/rest/v1/rpc/")) return res.end("null");
  if (url.pathname.startsWith("/rest/v1/")) {
    res.setHeader("content-range", "0-0/1");
    if (req.method === "HEAD") return res.end();
    const l = linha(url.searchParams.get("select") ?? "id");
    const objeto = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    return res.end(JSON.stringify(objeto ? l : [l]));
  }
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((ok) => banco.listen(PORTA_BANCO, "127.0.0.1", ok));

// ---------- Páginas ----------
function paginas(dir) {
  const achadas = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achadas.push(...paginas(caminho));
    else if (nome === "page.tsx") achadas.push(caminho);
  }
  return achadas;
}
const EXEMPLO = { "[id]": ID, "[secao]": "atendimento" };
const rotas = paginas("app")
  .map((p) => "/" + relative("app", p).split(sep).slice(0, -1).filter((s) => !s.startsWith("(")).map((s) => EXEMPLO[s] ?? s).join("/"))
  .sort();
rotas.push(
  "/busca?q=teste", "/indicadores?mes=2026-01", "/funil?area=" + ID, "/processos?filtro=parados", "/processos?cliente=" + ID, "/modelos/novo",
  "/atendimento?c=" + ID, "/atendimento?f=encerradas", "/atendimento?cliente=" + ID,
  ...["procuracao", "hipossuficiencia", "contrato", "renuncia"].map((m) => `/clientes/${ID}/documentos?modelo=${m}`),
);

// ---------- CRM ----------
const erros = [];
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORTA_APP)], {
  detached: true,
  // Tudo aponta para o banco falso; nada sai para serviços de verdade durante o teste
  env: {
    ...process.env,
    NODE_ENV: "production",
    SUPABASE_URL_TESTE: `http://127.0.0.1:${PORTA_BANCO}`,
    SUPABASE_SECRET_KEY: "teste",
    EVOLUTION_URL: `http://127.0.0.1:${PORTA_BANCO}`,
    EVOLUTION_API_KEY: "teste",
    CRON_SECRET: "teste",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const registrar = (b) => {
  const t = b.toString();
  if (/⨯|Error:|TypeError|ReferenceError/.test(t)) erros.push(t.trim());
};
app.stdout.on("data", registrar);
app.stderr.on("data", registrar);

const base = `http://127.0.0.1:${PORTA_APP}`;
for (let i = 0; ; i++) {
  try { await fetch(base + "/sobre"); break; } catch {
    if (i > 60) {
      // Problema do ambiente, não de uma página: avisa sem travar a publicação.
      console.warn("AVISO: o CRM não ligou para o teste de fumaça; publicação segue sem o teste.");
      try { process.kill(-app.pid, "SIGKILL"); } catch {}
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const sessao = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: usuario };
const cookie = "sb-127-auth-token=base64-" + Buffer.from(JSON.stringify(sessao)).toString("base64url");

let falhas = 0;
for (const rota of rotas) {
  const antes = erros.length;
  const r = await fetch(base + rota, { headers: { cookie }, redirect: "manual" });
  const html = r.status < 300 ? await r.text() : "";
  await new Promise((ok) => setTimeout(ok, 150)); // dá tempo de o erro aparecer no registro
  const destino = r.headers.get("location") ?? "";
  let problema = null;
  if (r.status >= 500) problema = `status ${r.status}`;
  else if (destino.includes("/login") && rota !== "/login") problema = "mandou para o login (sessão de teste não aceita)";
  else if (erros.length > antes) problema = erros.slice(antes).join("\n").split("\n").slice(0, 3).join(" | ");
  // Com a tela de "Carregando…", um redirect chega dentro da página (NEXT_REDIRECT), e não como 307
  else if (r.status === 200 && rota !== "/login" && !html.includes("<h1") && !html.includes("NEXT_REDIRECT")) problema = "página sem título";
  console.log(`${problema ? "FALHOU" : "ok    "} ${rota}${problema ? "  →  " + problema : ""}`);
  if (problema) falhas++;
}

// ---------- WhatsApp: aviso de mensagem recebida e envio dos agendamentos ----------
const { createHash } = await import("node:crypto");
const token = createHash("sha256").update("webhook:teste").digest("hex");
const aviso = {
  event: "messages.upsert",
  data: { key: { id: "TESTE1", remoteJid: "5551999999999@s.whatsapp.net", fromMe: false }, pushName: "Fulano", messageType: "conversation", message: { conversation: "1" }, messageTimestamp: Math.floor(Date.now() / 1000) },
};
const api = [
  ["manifest do app (sem login)", base + "/manifest.webmanifest", {}, 200],
  ["ícone do app (sem login)", base + "/icone-192.png", {}, 200],
  ["webhook sem senha", base + "/api/whatsapp/webhook", { method: "POST", body: "{}" }, 401],
  ["arquivo de mensagem sem login", base + "/api/whatsapp/midia/" + ID, {}, 401],
  ["webhook com mensagem", base + "/api/whatsapp/webhook", { method: "POST", headers: { "x-crm-token": token, "content-type": "application/json" }, body: JSON.stringify(aviso) }, 200],
  ["envio dos agendamentos", base + "/api/whatsapp/agendadas", { method: "POST", headers: { authorization: "Bearer teste" } }, 200],
];
for (const [nome, url, init, esperado] of api) {
  const antes = erros.length;
  const r = await fetch(url, { redirect: "manual", ...init });
  const corpo = await r.text();
  await new Promise((ok) => setTimeout(ok, 150));
  const problema = r.status !== esperado ? `status ${r.status} (esperado ${esperado}) ${corpo.slice(0, 120)}` : erros.length > antes ? erros.slice(antes).join(" | ").slice(0, 300) : null;
  console.log(`${problema ? "FALHOU" : "ok    "} ${nome}${problema ? "  →  " + problema : ""}`);
  if (problema) falhas++;
}
if (process.env.TESTE_DETALHES) console.log(chamadas.filter((c) => !c.startsWith("GET /auth")).slice(-40).join("\n"));
if (!chamadas.some((c) => c.startsWith("POST /message/sendText/"))) {
  console.log("FALHOU envio pelo WhatsApp  →  nenhuma mensagem chegou ao Evolution falso");
  falhas++;
}

const encerrar = () => { try { process.kill(-app.pid, "SIGKILL"); } catch {} };
encerrar();
banco.close();
if (falhas) {
  console.error(`\n${falhas} página(s) com erro. A publicação foi bloqueada.`);
  process.exit(1);
}
console.log(`\nTodas as ${rotas.length} páginas abriram sem erro.`);
process.exit(0);
