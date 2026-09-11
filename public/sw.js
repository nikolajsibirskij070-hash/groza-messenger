// v8 compatibility worker: clear old GROZA caches and immediately get out of the way.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith("groza-")).map(k => caches.delete(k)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
