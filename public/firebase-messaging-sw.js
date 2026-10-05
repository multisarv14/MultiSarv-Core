/* Multisarv admin — web push (FCM): project alerts ("/" scope) ani core Internal Chat ("/core-push/" scope).
 * Firebase SDK shivay: FCM payload `{ notification, data }` thet vachto.
 * Pratyek push la notification NEHMI dakhavla jato (background / foreground donhi).
 * iOS (Safari / PWA) ani Chrome "silent" push (notification na dakhavta) la shiksha
 * detat — iOS subscription radd karto (token mrut hoto). Mhanun kontahi apvad nahi. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { notification: { title: "Multisarv", body: event.data ? event.data.text() : "" } };
  }
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || data.title || "Multisarv";
  const link = (payload.fcmOptions && payload.fcmOptions.link) || data.link || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body || data.body || "",
      icon: n.icon || "/icon-192.png",
      badge: "/favicon-32.png",
      // Chat: ekach chat che notifications ek; navin aala ki parat vajto.
      tag: data.tag || data.taskId || data.kind || undefined,
      renotify: !!data.tag,
      silent: false,
      vibrate: [120, 60, 120],
      data: { link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => "focus" in c);
      if (open) {
        open.navigate(link).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(link);
    }),
  );
});
