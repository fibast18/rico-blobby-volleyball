const PREFIX='rico-blobby-volleyball-';const CACHE=PREFIX+'v2.7.1';const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/version.json'))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{})}
  return response
 }).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(request)||await cache.match('./index.html')||Response.error()}))
});