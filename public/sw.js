// Recebe as notificações do CRM mesmo com a página fechada e abre a conversa ao tocar.
self.addEventListener("push", (event) => {
  let aviso = { titulo: "Órion", texto: "Mensagem nova no WhatsApp", url: "/atendimento" };
  try {
    aviso = { ...aviso, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.texto,
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: aviso.tag,
      renotify: Boolean(aviso.tag),
      data: { url: aviso.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/atendimento", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin) && "focus" in j) {
          j.navigate(url);
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
