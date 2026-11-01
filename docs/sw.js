/*
 * TheKellerkinder – Service Worker für die Web-Fassung
 * Speichert die App beim ersten Aufruf auf dem Gerät, damit sie danach auch ohne Internet startet
 * (z. B. im Proberaum). Songs und Startseite werden bevorzugt frisch geladen, wenn Internet da ist.
 *
 * CACHE_VERSION und FILES trägt das Bauskript (build-web.py) ein.
 */
'use strict';

const CACHE_VERSION = 'thekellerkinder-f1858ec8b86e';
const FILES = [
  "./",
  "app.js",
  "help.js",
  "hilfe/ALPHATEX.txt",
  "hilfe/README.txt",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "manifest.webmanifest",
  "songs/probe-riff.atex",
  "songs/probe-riff.gp",
  "songs/songs.json",
  "songs/syntax-beispiele.atex",
  "styles.css",
  "vendor/alphatab/LICENSE",
  "vendor/alphatab/alphaTab.min.js",
  "vendor/alphatab/font/Bravura-OFL.txt",
  "vendor/alphatab/font/Bravura.otf",
  "vendor/alphatab/font/Bravura.woff",
  "vendor/alphatab/font/Bravura.woff2",
  "vendor/alphatab/soundfont/LICENSE",
  "vendor/alphatab/soundfont/sonivox.sf2",
  "vendor/marked/LICENSE",
  "vendor/marked/marked.umd.js",
  "web-adapter.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const path = new URL(req.url).pathname;
  const preferNetwork = req.mode === 'navigate' || /\/songs\/|\/hilfe\//.test(path);

  if (preferNetwork) {
    // erst Internet (aktuelle Songs), sonst gespeicherte Fassung
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })));
  } else {
    // App-Dateien: zuerst die gespeicherte Fassung
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  }
});
