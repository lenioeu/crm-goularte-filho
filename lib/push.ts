import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Notificações no celular/computador mesmo com o CRM fechado (Web Push).
// As chaves são criadas na primeira vez e ficam na tabela chaves_push (só o servidor lê).

export async function chavesPush(admin: SupabaseClient): Promise<{ publica: string; privada: string } | null> {
  const { data, error } = await admin.from("chaves_push").select("publica, privada").eq("id", 1).maybeSingle();
  if (error) return null; // script 008 ainda não rodou
  if (data) return data;
  const novas = webpush.generateVAPIDKeys();
  const { error: e2 } = await admin.from("chaves_push").insert({ id: 1, publica: novas.publicKey, privada: novas.privateKey });
  if (e2) {
    const { data: outra } = await admin.from("chaves_push").select("publica, privada").eq("id", 1).maybeSingle();
    return outra ?? null;
  }
  return { publica: novas.publicKey, privada: novas.privateKey };
}

export type Aviso = { titulo: string; texto: string; url: string; tag?: string };

/** Manda para as pessoas indicadas (ou para toda a equipe ativa) e limpa inscrições que expiraram. */
export async function enviarPush(admin: SupabaseClient, para: string[] | "equipe", aviso: Aviso) {
  const chaves = await chavesPush(admin);
  if (!chaves) return;
  let q = admin.from("push_inscricoes").select("id, endpoint, p256dh, auth, perfis!inner(ativo)").eq("perfis.ativo", true);
  if (para !== "equipe") {
    if (!para.length) return;
    q = q.in("perfil_id", para);
  }
  const { data } = await q;
  if (!data?.length) return;
  webpush.setVapidDetails("mailto:contato@goulartefilho.app", chaves.publica, chaves.privada);
  const corpo = JSON.stringify(aviso);
  await Promise.all(
    data.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, corpo, { TTL: 3600, urgency: "high" });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_inscricoes").delete().eq("id", s.id);
      }
    }),
  );
}
