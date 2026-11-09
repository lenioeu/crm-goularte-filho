import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Memória curta do navegador: voltar a uma página vista há pouco (ou pré-carregada ao passar o mouse
    // no menu) é instantâneo. Depois disso, ou quando algo é salvo, a página vem do servidor de novo.
    staleTimes: { dynamic: 30, static: 30 },
  },
};

export default nextConfig;
