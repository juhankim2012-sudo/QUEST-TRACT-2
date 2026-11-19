// 서비스 워커: 앱 화면(파일)을 폰에 저장해 두어서, 인터넷이 끊겨도 앱이 열리고 까닭을 보여 줄 수 있게 해요.
// 날씨 정보(api.open-meteo.com)는 저장하지 않고 늘 새로 받아 와요.
const CACHE = "weather-v1";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 날씨 정보는 그냥 인터넷으로
  // 먼저 인터넷에서 새 파일을 받고, 안 되면 저장해 둔 파일을 써요.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
