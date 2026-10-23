// Avatar com iniciais e cor estável por nome (como no Google Contatos e no WhatsApp Web).

export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter((x) => !/^(DA|DE|DO|DAS|DOS|E)$/i.test(x));
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

const CORES = ["#1967d2", "#188038", "#c5221f", "#e37400", "#8430ce", "#00796b", "#c2185b", "#3949ab", "#5f6368", "#0b8043"];

export function corDoNome(nome: string) {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
