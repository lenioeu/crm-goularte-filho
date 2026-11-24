import { redirect } from "next/navigation";

// A aba Audiências virou o Calendário: links antigos (e o atalho do app instalado) continuam funcionando.
export default async function Audiencias({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const { nova } = await searchParams;
  redirect(nova ? "/calendario?nova=audiencia" : "/calendario");
}
