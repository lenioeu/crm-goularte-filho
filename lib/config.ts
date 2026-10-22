// Endereço e chave pública do projeto Supabase do escritório.
// A chave "publishable" foi feita para ficar no navegador: quem protege os
// dados são as permissões (Row Level Security) definidas em supabase/schema.sql.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lszpuypfrprorlctctdq.supabase.co";

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_wriBDuyStBIq78keGu7q3A_R7BjVePO";

export const NOME_ESCRITORIO = "Goularte Filho Advocacia";
