const CACHE='leeds-desk-v26';
const CORE=['/content-desk','/content-desk.css?v=26.0.0','/content-desk.js?v=26.0.0','/styles.css','/content-desk-icon-192.png','/content-desk-icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE).catch(()=>{})));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/content-desk'))));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||'/content-desk';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const open=list.find(client=>'focus' in client);if(open){open.navigate(url);return open.focus();}return clients.openWindow(url);}));});
