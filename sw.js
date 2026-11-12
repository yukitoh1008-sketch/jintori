// 陣取りバトル のサービスワーカー（tools/build_public.js が作る。手で直さない）
const CACHE = 'jintori-1.40.0';
const BADGE = 'jintori-badge';
const API = "https://script.google.com/macros/s/AKfycbyXvlq40FU3TM_hHAvNxk2a2aXqx5LiyaBcQKug2r60hz0s_4IVLLWUdivBfKrpXAxQ/exec";
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== BADGE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function badgeGet() {
  const r = await (await caches.open(BADGE)).match('n');
  return r ? Number(await r.text()) || 0 : 0;
}
async function badgeSet(n) {
  await (await caches.open(BADGE)).put('n', new Response(String(n)));
  try {
    if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch (err) {}
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let items = [], badge = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: 'pullPush', args: [sub ? sub.endpoint : ''] }) });
      const j = await r.json();
      if (j.ok) { items = j.result.items || []; badge = j.result.badge; }
    } catch (err) {}
    if (!items.length) {
      // 中身はもう前の通知で表示ずみ。何か表示しないといけないので、最後の通知を音なしで出し直す
      const shown = await self.registration.getNotifications();
      const last = shown[shown.length - 1];
      if (last) return self.registration.showNotification(last.title, { body: last.body, tag: last.tag, icon: last.icon, data: last.data, renotify: false, silent: true });
      items = [{ title: '陣取りバトル', body: '新しいお知らせがあります', tag: 'jintori', url: '' }];
    }
    for (const it of items) {
      await self.registration.showNotification(it.title, { body: it.body, tag: it.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' + (it.url || '') } });
    }
    await badgeSet(badge !== null && badge !== undefined ? badge : (await badgeGet()) + items.length);
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = wins.find((w) => w.url === url) || wins[0];
    if (same) return same.focus();
    return self.clients.openWindow(url);
  })());
});

// ページは「まず通信、だめなら保存した版」、アイコンなどは保存した版を使う
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
