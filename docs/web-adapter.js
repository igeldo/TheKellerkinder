/*
 * TheKellerkinder – Web-Fassung (z. B. GitHub Pages)
 * ---------------------------------------------------
 * Auf GitHub Pages läuft kein Java-Server. Dieses Skript übernimmt seine Aufgaben im Browser,
 * damit app.js und help.js unverändert bleiben können:
 *
 *   GET  /api/songs        → Beispielsongs aus songs/songs.json + eigene Songs auf diesem Gerät
 *   GET  /api/songs/NAME   → Song vom Gerät oder aus dem Ordner songs/
 *   PUT  /api/songs/NAME   → Song auf diesem Gerät speichern (Browser-Speicher)
 *   GET  /static/docs/X.md → Hilfetexte aus dem Ordner hilfe/
 *
 * Außerdem: Knopf "Importieren" (Dateien-App, Downloads …) und Offline-Fähigkeit (Service Worker).
 * Muss vor app.js geladen werden.
 */
'use strict';

(function () {
  window.KK_MODE = 'web';
  window.KK_BASE = new URL('./', location.href).href;
  const BASE = window.KK_BASE;
  const PREFIX = 'kk-song:';
  const realFetch = window.fetch.bind(window);

  // ------------------------------------------------------------------ Speicher auf dem Gerät

  function storage() {
    try { return window.localStorage; } catch { return null; }
  }

  function listLocal() {
    const ls = storage();
    if (!ls) return [];
    const list = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      try {
        const entry = JSON.parse(ls.getItem(key));
        list.push({ name: key.slice(PREFIX.length), size: entry.size, modified: entry.modified, local: true });
      } catch { /* defekter Eintrag – überspringen */ }
    }
    return list;
  }

  function getLocal(name) {
    const ls = storage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(PREFIX + name);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function putLocal(name, body) {
    const ls = storage();
    if (!ls) throw new Error('Der Browser erlaubt kein Speichern (privater Modus?).');
    let entry;
    if (typeof body === 'string') {
      entry = { type: 'text', data: body, size: body.length };
    } else {
      const bytes = body instanceof Uint8Array ? body
        : body instanceof ArrayBuffer ? new Uint8Array(body)
        : new Uint8Array(await new Response(body).arrayBuffer());
      entry = { type: 'base64', data: toBase64(bytes), size: bytes.length };
    }
    entry.modified = Date.now();
    ls.setItem(PREFIX + name, JSON.stringify(entry));
  }

  function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function fromBase64(text) {
    const s = atob(text);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  // ------------------------------------------------------------------ Ersatz für den Server

  function reply(body, status = 200, type = 'text/plain; charset=utf-8') {
    return new Response(body, { status, headers: { 'Content-Type': type } });
  }

  async function bundledSongs() {
    try {
      const res = await realFetch(BASE + 'songs/songs.json', { cache: 'no-cache' });
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = ((init && init.method) || 'GET').toUpperCase();

    if (url === '/api/songs' && method === 'GET') {
      const byName = new Map();
      for (const name of await bundledSongs()) byName.set(name, { name, size: 0, modified: 0 });
      for (const s of listLocal()) byName.set(s.name, s);           // eigene Fassung hat Vorrang
      const list = [...byName.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      return reply(JSON.stringify(list), 200, 'application/json');
    }

    if (url.startsWith('/api/songs/')) {
      const name = decodeURIComponent(url.slice('/api/songs/'.length));
      if (method === 'PUT') {
        try {
          await putLocal(name, init.body);
          return reply('Auf diesem Gerät gespeichert: ' + name);
        } catch (e) {
          return reply('Speichern nicht möglich: ' + e.message, 507);
        }
      }
      const local = getLocal(name);
      if (local) {
        return local.type === 'text' ? reply(local.data) : reply(fromBase64(local.data), 200, 'application/octet-stream');
      }
      return realFetch(BASE + 'songs/' + encodeURIComponent(name));
    }

    if (url.startsWith('/static/docs/')) {
      // GitHub Pages wandelt .md-Dateien um; die Hilfe liegt deshalb als .txt im Ordner hilfe/
      const doc = url.slice('/static/docs/'.length).replace(/\.md$/, '.txt');
      return realFetch(BASE + 'hilfe/' + doc);
    }

    if (url === '/api/beenden') return reply('');

    return realFetch(input, init);
  };

  // ------------------------------------------------------------------ Knopf "Importieren"

  function addImportButton() {
    const help = document.getElementById('btn-help');
    if (!help) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.gp,.gpx,.gp3,.gp4,.gp5,.atex,.xml,.musicxml,.cap';
    input.hidden = true;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-import';
    btn.textContent = 'Importieren';
    btn.title = 'Songs (Guitar Pro, alphaTex, MusicXML) auf dieses Gerät holen';
    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      let last = null;
      for (const file of input.files) {
        const name = file.name.replace(/[^A-Za-z0-9._ -]/g, '_');
        try {
          const body = /\.atex$/i.test(name) ? await file.text() : new Uint8Array(await file.arrayBuffer());
          await putLocal(name, body);
          last = name;
        } catch (e) {
          window.bandApp.setStatus(`${file.name}: ${e.message}`, true);
        }
      }
      input.value = '';
      if (last) {
        await window.bandApp.reloadSongs(last);
        window.bandApp.setStatus(`Importiert und auf diesem Gerät gespeichert: ${last}`);
      }
    });

    help.before(btn, input);
  }

  addImportButton();

  // ------------------------------------------------------------------ offline nutzbar machen

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Offline-Modus nicht verfügbar:', e));
    });
  }
})();
