"use server";

import { revalidatePath } from "next/cache";
import type { Resultado } from "@/app/(app)/actions";
import { quemSou } from "@/lib/permissoes";
import { importarRecorteDoGmail } from "@/lib/recorteImportar";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Desliga a conta Google da pessoa (Agenda e Gmail) e cancela a autorização no Google. */
export async function desconectarMeuGoogle(): Promise<Resultado> {
  const { user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const admin = supabaseAdmin();
  const { data } = await admin.from("google_usuarios").select("refresh_token").eq("perfil_id", user.id).maybeSingle();
  if (data?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: "POST" }).catch(() => null);
  }
  const { error } = await admin.from("google_usuarios").delete().eq("perfil_id", user.id);
  if (error) return { erro: error.message, ok: null };
  revalidatePath("/perfil");
  revalidatePath("/calendario");
  return { erro: null, ok: "Conta Google desconectada. A Agenda e o Gmail deixaram de ser usados pelo Órion." };
}

/** "Buscar agora": lê o Recorte no Gmail da pessoa na hora, sem esperar a rotina automática. */
export async function buscarRecorteAgora(): Promise<Resultado> {
  const { user, papel } = await quemSou();
  if (!user || !papel) return { erro: "Sem permissão.", ok: null };
  const r = await importarRecorteDoGmail(supabaseAdmin(), user.id);
  if (r.erros.length) return { erro: `O Gmail não respondeu: ${r.erros[0].slice(0, 160)}`, ok: null };
  if (!r.contas) return { erro: "Conecte o Gmail primeiro (Meu perfil › Conta Google).", ok: null };
  revalidatePath("/publicacoes");
  revalidatePath("/perfil");
  return { erro: null, ok: r.emails ? `${r.emails} ${r.emails === 1 ? "e-mail lido" : "e-mails lidos"} do Recorte, ${r.novas} ${r.novas === 1 ? "publicação nova" : "publicações novas"}.` : "Nenhum e-mail novo do Recorte no seu Gmail." };
}
