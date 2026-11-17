const paths=[];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  paths.push(new URL(event.request.url).pathname);
  if (new URL(event.request.url).pathname === '/sw-resource') event.respondWith(new Response('local-service-worker'));
});
self.addEventListener('message', event => {
  if(event.data==='senda-diagnostic'&&event.ports[0])event.ports[0].postMessage({paths:paths.slice(-12)});
});
