import type { MetadataRoute } from "next";

// Permite "instalar" o CRM no celular e no computador (ícone na tela inicial, abre em tela cheia).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Órion · Goularte Filho Advocacia",
    short_name: "Órion",
    description: "CRM do escritório Goularte Filho Advocacia",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8fc",
    theme_color: "#0f3460",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Atendimento", url: "/atendimento" },
      { name: "Audiências", url: "/audiencias" },
      { name: "Tarefas", url: "/tarefas" },
    ],
  };
}
