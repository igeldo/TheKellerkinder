/*
 * TheKellerkinder – Web-Fassung (z. B. GitHub Pages)
 * ---------------------------------------------------
 * Auf GitHub Pages läuft kein Java-Server. Dieses Skript übernimmt seine Aufgaben im Browser,
 * damit app.js und help.js unverändert bleiben können:
 *
 *   GET  /api/songs        → Band-Songs aus songs/songs.json + eigene Songs auf diesem Gerät
 *   GET  /api/songs/NAME   → Song vom Gerät oder aus dem Ordner songs/
 *   PUT  /api/songs/NAME   → Song auf diesem Gerät speichern (Browser-Speicher)
 *   GET  /static/docs/X.md → Hilfetexte aus dem Ordner hilfe/
 *
 * Dazu der Dialog "Meine Songs": lokale Songs herunterladen und löschen und als ZIP für GitHub
 * exportieren (mit fertiger songs.json). Importieren nutzt "Öffnen …" aus app.js, ZIP kommt aus zip.js.
 * Außerdem Offline-Fähigkeit (Service Worker). Muss vor app.js geladen werden.
 */
'use strict';

(function () {
  window.KK_MODE = 'web';
  window.KK_BASE = new URL('./', location.href).href;
  const BASE = window.KK_BASE;
  const PREFIX = 'kk-song:';
  const realFetch = window.fetch.bind(window);

  // ================================================================== Speicher auf dem Gerät

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
        list.push({ name: key.slice(PREFIX.length), size: entry.size, modified: entry.modified });
      } catch { /* defekter Eintrag – überspringen */ }
    }
    return list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
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

  /** Inhalt eines lokalen Songs als Bytes. */
  function localBytes(name) {
    const e = getLocal(name);
    if (!e) return null;
    return e.type === 'text' ? new TextEncoder().encode(e.data) : fromBase64(e.data);
  }

  async function putLocal(name, body) {
    const ls = storage();
    if (!ls) throw new Error('Der Browser erlaubt kein Speichern (privater Modus?).');
    let entry;
    if (typeof body === 'string') {
      entry = { type: 'text', data: body, size: new TextEncoder().encode(body).length };
    } else {
      const bytes = body instanceof Uint8Array ? body
        : body instanceof ArrayBuffer ? new Uint8Array(body)
        : new Uint8Array(await new Response(body).arrayBuffer());
      entry = isTextSong(name)
        ? { type: 'text', data: new TextDecoder().decode(bytes), size: bytes.length }
        : { type: 'base64', data: toBase64(bytes), size: bytes.length };
    }
    entry.modified = Date.now();
    try {
      ls.setItem(PREFIX + name, JSON.stringify(entry));
    } catch (e) {
      throw new Error('Speicher des Browsers ist voll – bitte nicht mehr benötigte Songs löschen.');
    }
  }

  function deleteLocal(name) {
    const ls = storage();
    if (ls) ls.removeItem(PREFIX + name);
  }

  function isTextSong(name) {
    return /\.(atex|xml|musicxml)$/i.test(name);
  }

  function safeName(name) {
    return String(name).split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[._ -]+/, '') || 'song';
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

  // ================================================================== Ersatz für den Server

  function reply(body, status = 200, type = 'text/plain; charset=utf-8') {
    return new Response(body, { status, headers: { 'Content-Type': type } });
  }

  async function bandSongs() {
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
      for (const name of await bandSongs()) byName.set(name, { name, bundled: true });
      for (const s of listLocal()) {
        byName.set(s.name, { ...s, local: true, bundled: byName.has(s.name) });   // eigene Fassung hat Vorrang
      }
      const list = [...byName.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      return reply(JSON.stringify(list), 200, 'application/json');
    }

    if (url.startsWith('/api/songs/')) {
      const name = decodeURIComponent(url.slice('/api/songs/'.length));
      if (method === 'PUT') {
        try {
          await putLocal(name, init.body);
          refreshDialog();
          return reply('Auf diesem Gerät gespeichert: ' + name);
        } catch (e) {
          return reply('Speichern nicht möglich: ' + e.message, 507);
        }
      }
      if (method === 'DELETE') {
        // nur Songs auf diesem Gerät lassen sich löschen; Band-Songs liegen auf GitHub
        if (!getLocal(name)) {
          return reply('Band-Songs liegen auf GitHub und lassen sich hier nicht löschen.', 403);
        }
        deleteLocal(name);
        refreshDialog();
        return reply('von diesem Gerät entfernt (Browser-Speicher)');
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

  // ================================================================== Dialog "Meine Songs"

  let dialog = null;

  function buildUi() {
    const help = document.getElementById('btn-help');
    if (!help) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-my-songs';
    btn.textContent = 'Meine Songs';
    btn.title = 'Songs auf diesem Gerät: importieren, herunterladen, löschen, für GitHub exportieren';
    btn.addEventListener('click', openDialog);
    help.before(btn);

    dialog = document.createElement('div');
    dialog.className = 'songs-dialog';
    dialog.hidden = true;
    dialog.innerHTML = `
      <div class="songs-backdrop" data-close></div>
      <section class="songs-panel" role="dialog" aria-modal="true" aria-labelledby="songs-heading">
        <div class="songs-head">
          <h2 id="songs-heading">Meine Songs <span class="songs-sub">auf diesem Gerät</span></h2>
          <button type="button" class="songs-close" data-close aria-label="Schließen">✕</button>
        </div>
        <div class="songs-body">
          <p class="songs-intro"><b>Wo liegen diese Songs?</b> Im Speicher dieses Browsers – nur auf diesem Gerät,
            nicht auf GitHub und nicht im Download-Ordner. Einzelne Songs als Datei sichern: <b>Herunterladen</b>
            (landet im Download-Ordner des Browsers), zurückholen mit <b>Importieren …</b>.<br>Damit die ganze Band sie bekommt:
            auswählen, <b>Für GitHub exportieren</b>, die ZIP-Datei entpacken und ihren Inhalt auf GitHub
            in den Ordner <code>docs/songs</code> hochladen. Die enthaltene <code>songs.json</code> ersetzt die alte –
            Einträge von Hand sind nicht mehr nötig.</p>
          <table class="songs-table">
            <thead><tr>
              <th><input type="checkbox" id="songs-all" aria-label="Alle auswählen"></th>
              <th>Song</th><th>Größe</th><th>Geändert</th><th></th>
            </tr></thead>
            <tbody id="songs-rows"></tbody>
          </table>
          <p id="songs-empty" class="songs-empty" hidden>Noch keine eigenen Songs auf diesem Gerät.
            Im alphaTex-Editor auf <b>Speichern (.atex)</b> klicken oder Songs importieren.</p>
        </div>
        <div class="songs-actions">
          <button type="button" id="songs-import">Importieren …</button>
          <span class="spacer"></span>
          <button type="button" id="songs-delete" disabled>Ausgewählte löschen</button>
          <button type="button" id="songs-export" class="primary" disabled>Für GitHub exportieren (.zip)</button>
        </div>
      </section>`;
    document.body.append(dialog);

    dialog.querySelectorAll('[data-close]').forEach((e) => e.addEventListener('click', closeDialog));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dialog.hidden) closeDialog(); });
    dialog.querySelector('#songs-import').addEventListener('click', () => window.bandApp.openFiles());
    dialog.querySelector('#songs-all').addEventListener('change', (e) => {
      dialog.querySelectorAll('.song-pick').forEach((c) => { c.checked = e.target.checked; });
      updateActions();
    });
    dialog.querySelector('#songs-delete').addEventListener('click', () => removeSongs(selectedNames()));
    dialog.querySelector('#songs-export').addEventListener('click', () => exportForGitHub(selectedNames()));
  }

  function openDialog() {
    refreshDialog();
    dialog.hidden = false;
    dialog.querySelector('.songs-close').focus();
  }

  function closeDialog() {
    dialog.hidden = true;
    const b = document.getElementById('btn-my-songs');
    if (b) b.focus();
  }

  function refreshDialog() {
    if (!dialog) return;
    const rows = dialog.querySelector('#songs-rows');
    rows.replaceChildren();
    const songs = listLocal();
    dialog.querySelector('#songs-empty').hidden = songs.length > 0;
    dialog.querySelector('.songs-table').hidden = songs.length === 0;
    dialog.querySelector('#songs-all').checked = false;
    for (const s of songs) {
      const tr = document.createElement('tr');
      const pick = document.createElement('input');
      pick.type = 'checkbox';
      pick.className = 'song-pick';
      pick.value = s.name;
      pick.setAttribute('aria-label', `${s.name} auswählen`);
      pick.addEventListener('change', updateActions);

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'link';
      open.textContent = s.name;
      open.title = 'Öffnen';
      open.addEventListener('click', async () => { closeDialog(); await window.bandApp.reloadSongs(s.name); });

      const dl = document.createElement('button');
      dl.type = 'button';
      dl.textContent = 'Herunterladen';
      dl.addEventListener('click', () => {
        window.bandApp.download(localBytes(s.name), s.name,
          isTextSong(s.name) ? 'text/plain;charset=utf-8' : 'application/octet-stream');
        window.bandApp.setStatus(`Heruntergeladen: ${s.name} → Download-Ordner des Browsers (meist „Downloads“; iPad: Dateien → Downloads)`);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger';
      del.textContent = 'Löschen';
      del.addEventListener('click', () => removeSongs([s.name]));

      const cells = [pick, open, formatSize(s.size), formatDate(s.modified)];
      for (const c of cells) {
        const td = document.createElement('td');
        if (typeof c === 'string') td.textContent = c; else td.append(c);
        tr.append(td);
      }
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
      tdActions.append(dl, del);
      tr.append(tdActions);
      rows.append(tr);
    }
    updateActions();
  }

  function selectedNames() {
    return [...dialog.querySelectorAll('.song-pick:checked')].map((c) => c.value);
  }

  function updateActions() {
    const n = selectedNames().length;
    dialog.querySelector('#songs-delete').disabled = n === 0;
    const exp = dialog.querySelector('#songs-export');
    exp.disabled = n === 0;
    exp.textContent = n ? `Für GitHub exportieren (${n}) .zip` : 'Für GitHub exportieren (.zip)';
  }

  async function removeSongs(names) {
    if (!names.length) return;
    const list = names.length === 1 ? `„${names[0]}“` : `${names.length} Songs`;
    if (!window.confirm(`${list} von diesem Gerät löschen?\n\nDer Song wird aus dem Speicher dieses Browsers entfernt `
      + `(nicht rückgängig zu machen – vorher ggf. „Herunterladen“). Band-Songs auf GitHub sind davon nicht betroffen.`)) return;
    const current = window.bandApp.currentName();
    names.forEach(deleteLocal);
    refreshDialog();
    const songs = await (await window.fetch('/api/songs')).json();
    const stillThere = songs.some((s) => s.name === current);
    await window.bandApp.reloadSongs(stillThere ? current : (songs[0] && songs[0].name));
    window.bandApp.setStatus(`Gelöscht: ${names.join(', ')} → von diesem Gerät entfernt (Browser-Speicher)`);
  }

  async function exportForGitHub(names) {
    if (!names.length) return;
    const band = await bandSongs();
    const json = [...band];
    for (const n of names) if (!json.includes(n)) json.push(n);
    const files = names.map((n) => ({ name: n, bytes: localBytes(n) }));
    files.push({ name: 'songs.json', bytes: new TextEncoder().encode(JSON.stringify(json, null, 2) + '\n') });
    const stamp = new Date().toISOString().slice(0, 10);
    window.bandApp.download(window.KKZip.makeZip(files), `thekellerkinder-songs-${stamp}.zip`, 'application/zip');
    window.bandApp.setStatus(`ZIP heruntergeladen → Download-Ordner des Browsers: ${names.length} Song(s) + songs.json – entpacken und den Inhalt nach docs/songs auf GitHub hochladen.`);
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  }

  function formatDate(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  buildUi();

  // ================================================================== offline nutzbar machen

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    // Wurde die Seite schon von einer älteren Fassung gesteuert, nach dem Wechsel auf die neue einmal neu laden –
    // so laufen nie alte und neue Programmdateien gemischt (z. B. nach einem Update auf GitHub).
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) {
        reloaded = true;
        location.reload();
      }
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update())
        .catch((e) => console.warn('Offline-Modus nicht verfügbar:', e));
    });
  }
  const build = document.querySelector('meta[name="kk-build"]');
  if (build) console.info('TheKellerkinder Web-Fassung, Stand', build.content);
})();
