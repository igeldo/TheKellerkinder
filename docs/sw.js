/*
 * TheKellerkinder – Service Worker für die Web-Fassung
 * Speichert die App beim ersten Aufruf auf dem Gerät, damit sie danach auch ohne Internet startet
 * (z. B. im Proberaum) – ohne die Band-Klänge: die kommen erst dazu, wenn man sie per Knopf lädt.
 *
 * Strategie (so, dass nie alte und neue Dateien gemischt werden):
 *   - Programmdateien (HTML, JS, CSS, Songs, Hilfe): ZUERST AUS DEM NETZ. Der Gerätespeicher ist nur
 *     der Ersatz, wenn kein Internet da ist (oder das Netz länger als 4 s nicht antwortet).
 *   - Große, unveränderliche Dateien (alphaTab, Notenschrift, Klänge, Symbole): zuerst vom Gerät.
 *   - Kein "ignoreSearch" (in Safari sehr langsam): Schlüssel werden ohne ?v=… gespeichert und gesucht.
 *   - Netzabrufe fragen immer beim Server nach (no-cache/reload), nie veraltete Browser-Kopien.
 *
 * CACHE_VERSION und FILES trägt das Bauskript (build-web.py) ein.
 */
'use strict';

const CACHE_VERSION = 'thekellerkinder-af92df77ec2f';
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
  "klaenge/GeneralUser-GS-LICENSE.txt",
  "klaenge/LIESMICH.txt",
  "manifest.webmanifest",
  "songs/klang-demo.atex",
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
  "web-adapter.js",
  "zip.js"
];
// eigener Speicherbereich für die Band-Klänge: übersteht App-Updates, wird nur beim Abwählen geleert
const KLANG_CACHE = 'thekellerkinder-klaenge';
const NETZ_WARTEZEIT = 4000;

/** Speicherschlüssel: gleiche Adresse ohne ?v=… und ohne #… */
function key(url) {
  const u = new URL(url, self.location.href);
  u.search = '';
  u.hash = '';
  return u.href;
}

self.addEventListener('install', (event) => {
  // cache: 'reload' – am Browser-Zwischenspeicher vorbei, sonst könnten (bei GitHub bis 10 min) alte Dateien hineingeraten
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) =>
    cache.addAll(FILES.map((f) => new Request(key(f), { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== KLANG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

function isLargeAsset(path) {
  return /\/(vendor|icons|klaenge)\//.test(path);
}

async function fromCache(url) {
  return (await caches.match(key(url))) || null;
}

async function networkFirst(request) {
  const k = key(request.url);
  try {
    // cache: 'no-cache' – beim Server nachfragen, ob die Datei aktuell ist (GitHub erlaubt Browsern 10 min
    // Zwischenspeicherung; ohne Nachfrage könnten kurz nach einem Update alte und neue Dateien gemischt werden)
    const res = await Promise.race([
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Netz zu langsam')), NETZ_WARTEZEIT)),
    ]);
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(k, copy));
    }
    return res;
  } catch (e) {
    const hit = (await fromCache(k)) || (request.mode === 'navigate' ? await fromCache(new URL('./', self.location.href).href) : null);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request, path) {
  const hit = await fromCache(request.url);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    // Band-Klänge in den eigenen Bereich, alles andere in den Bereich dieser Version
    caches.open(/\/klaenge\/.+\.sf2$/.test(path) ? KLANG_CACHE : CACHE_VERSION).then((c) => c.put(key(request.url), copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(isLargeAsset(url.pathname) ? cacheFirst(req, url.pathname) : networkFirst(req));
});
