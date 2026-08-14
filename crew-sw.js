const CACHE='tale-of-two-crew-v20-round2';
const SHELL=['./crew.html','./crew-manifest.webmanifest','./totw-logo-black.png','./totw-logo-white.png','./totw-logo-square.jpg','./crew-icon-180.png','./crew-icon-512.png'];
const CREW_FILES=new Set(SHELL.map(path=>new URL(path,self.location.href).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(SHELL.map(url=>fetch(url,{cache:'reload'}).then(r=>r&&r.ok?cache.put(url,r):null).catch(()=>null)))).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!CREW_FILES.has(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request)));
});
