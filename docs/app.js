/*
 * TheKellerkinder – Proben-App der Band
 * --------------------------------
 * Nutzt alphaTab (https://alphatab.net) für Notendarstellung, Tabulatur und Wiedergabe.
 * Die Songs liegen im Ordner songs/ des Projekts und werden vom Java-Server (TheKellerkinderServer) geliefert.
 *
 * Aufbau:
 *   1. alphaTab einrichten
 *   2. Songs laden (Guitar Pro, MusicXML oder alphaTex)
 *   3. Spuren: anzeigen, stummschalten, solo, Lautstärke
 *   4. Wiedergabe: Tempo, Metronom, Einzähler, Schleife
 *   5. alphaTex-Editor: Live-Vorschau, Fehleranzeige, Speichern, Export als .gp
 */
'use strict';

// Basisadresse der App-Dateien: '/static/' beim Java-Server, in der Web-Fassung (GitHub Pages)
// setzt web-adapter.js den Ordner der Seite.
const BASE = window.KK_BASE || '/static/';

const $ = (id) => document.getElementById(id);

const el = {
  songSelect: $('song-select'), songTitle: $('song-title'),
  btnNew: $('btn-new'), btnEditor: $('btn-editor'),
  trackList: $('track-list'), score: $('score'), scoreWrap: $('score-wrap'), loading: $('loading'),
  editor: $('editor'), tex: $('tex'), fileName: $('file-name'), diagnostics: $('diagnostics'),
  btnFromScore: $('btn-from-score'), btnSaveTex: $('btn-save-tex'), btnExportGp: $('btn-export-gp'),
  btnPlay: $('btn-play'), btnStop: $('btn-stop'), time: $('time'),
  speed: $('speed'), speedOut: $('speed-out'),
  chkMetronome: $('chk-metronome'), chkCountIn: $('chk-countin'), chkLoop: $('chk-loop'),
  btnClearRange: $('btn-clear-range'), status: $('status'),
  btnPrint: $('btn-print'), viewMode: $('view-mode'),
};

const NEW_SONG_TEMPLATE = String.raw`\title "Neuer Song"
\tempo 100
.
\track "Gitarre"
  \staff {tabs}
  \instrument distortionguitar
  \tuning (E4 B3 G3 D3 A2 E2)
  (0.6 2.5 2.4).4 (0.6 2.5 2.4).4 (3.6 5.5 5.4).4 (5.6 7.5 7.4).4 |
\track "Bass"
  \staff {tabs}
  \instrument electricbassfinger
  \tuning (G2 D2 A1 E1)
  0.4.4 0.4.4 3.4.4 5.4.4 |
\track "Schlagzeug"
  \instrument percussion
  \clef neutral
  (36 42).8 (42).8 (38 42).8 (42).8 (36 42).8 (36 42).8 (38 42).8 (42).8 |
`;

// ====================================================================== 1. alphaTab einrichten

const api = new alphaTab.AlphaTabApi(el.score, {
  core: {
    fontDirectory: BASE + 'vendor/alphatab/font/',
  },
  display: {
    layoutMode: alphaTab.LayoutMode.Page,
    scale: 0.95,
  },
  player: {
    playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
    soundFont: BASE + 'vendor/alphatab/soundfont/sonivox.sf2',
    scrollElement: el.scoreWrap,
    enableUserInteraction: true,   // Takte mit der Maus markieren, Klick setzt die Position
  },
});

let currentScore = null;       // der gerade angezeigte Song
let currentName = null;        // Dateiname im Ordner songs/
let trackState = [];           // je Spur: { visible, mute, solo, volume }

api.renderStarted.on(() => { el.loading.hidden = false; el.loading.textContent = 'Zeichne Noten …'; });
api.renderFinished.on(() => { el.loading.hidden = true; });
api.soundFontLoad.on((e) => {
  const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
  setStatus(`Lade Instrumentenklänge … ${pct} %`);
});
let playerIsReady = false;
api.playerReady.on(() => {
  playerIsReady = true;
  el.btnPlay.disabled = false;
  el.btnStop.disabled = false;
  setStatus('Bereit – Klänge geladen');
});
api.playerStateChanged.on((e) => {
  const playing = e.state === alphaTab.synth.PlayerState.Playing;
  el.btnPlay.textContent = playing ? '❚❚ Pause' : '▶ Abspielen';
});
api.playerPositionChanged.on((e) => {
  el.time.textContent = `${formatTime(e.currentTime)} / ${formatTime(e.endTime)}`;
});
api.error.on((err) => {
  console.error(err);
  const text = err && err.message ? err.message : String(err);
  // Fehler, bevor der Player bereit ist, betreffen fast immer die Instrumentenklänge (Soundfont)
  setStatus(playerIsReady ? 'Fehler: ' + text : 'Ton nicht verfügbar: ' + text, true);
});

// ====================================================================== 2. Songs laden

async function refreshSongList(selectName) {
  const res = await fetch('/api/songs');
  const songs = await res.json();
  el.songSelect.replaceChildren();
  for (const s of songs) {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = s.name;
    el.songSelect.append(opt);
  }
  if (selectName && songs.some((s) => s.name === selectName)) {
    el.songSelect.value = selectName;
  }
  return songs;
}

async function loadSong(name) {
  setStatus(`Lade ${name} …`);
  const res = await fetch('/api/songs/' + encodeURIComponent(name));
  if (!res.ok) {
    setStatus(`${name} konnte nicht geladen werden (${res.status})`, true);
    return;
  }
  currentName = name;
  if (name.toLowerCase().endsWith('.atex')) {
    const text = await res.text();
    el.tex.value = text;
    el.fileName.value = name;
    renderTex(text);
  } else {
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, api.settings);
      showScore(score);
    } catch (e) {
      setStatus(`${name}: Dateiformat nicht lesbar (${e.message})`, true);
    }
  }
}

/** Zeigt einen Song mit allen Spuren an. Die Wiedergabe enthält immer alle Spuren. */
function showScore(score) {
  currentScore = score;
  rememberSongView(score);
  applyView(score, el.viewMode.value);
  api.renderScore(score, score.tracks.map((t) => t.index));
  el.songTitle.textContent = [score.title, score.artist].filter(Boolean).join(' – ');
  trackState = score.tracks.map(() => ({ visible: true, mute: false, solo: false, volume: 1 }));
  buildTrackList(score);
  el.btnPrint.disabled = false;
  setStatus(`${score.tracks.length} Spuren · ${score.masterBars.length} Takte · ${score.tempo} bpm`);
}

// ====================================================================== 3. Spuren

function buildTrackList(score) {
  el.trackList.replaceChildren();
  score.tracks.forEach((track, i) => {
    const li = document.createElement('li');
    li.className = 'track';

    const show = document.createElement('input');
    show.type = 'checkbox';
    show.checked = true;
    show.title = 'Spur anzeigen';
    show.addEventListener('change', () => {
      trackState[i].visible = show.checked;
      const visible = score.tracks.filter((_, k) => trackState[k].visible);
      if (visible.length === 0) {          // mindestens eine Spur muss sichtbar bleiben
        show.checked = true;
        trackState[i].visible = true;
        return;
      }
      api.renderTracks(visible);
    });

    const name = document.createElement('span');
    name.className = 'track-name';
    name.textContent = track.name || `Spur ${i + 1}`;
    name.title = name.textContent;

    const mute = toggleButton('M', 'mute', 'Stummschalten (zum Mitspielen der eigenen Stimme)', (on) => {
      trackState[i].mute = on;
      api.changeTrackMute([track], on);
    });
    const solo = toggleButton('S', 'solo', 'Nur diese Spur hören', (on) => {
      trackState[i].solo = on;
      api.changeTrackSolo([track], on);
    });

    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0'; vol.max = '1.5'; vol.step = '0.05'; vol.value = '1';
    vol.title = 'Lautstärke';
    vol.setAttribute('aria-label', `Lautstärke ${name.textContent}`);
    vol.addEventListener('input', () => {
      trackState[i].volume = Number(vol.value);
      api.changeTrackVolume([track], Number(vol.value));
    });

    li.append(show, name, mute, solo, vol);
    el.trackList.append(li);
  });
}

function toggleButton(label, cls, title, onChange) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
  return b;
}

// ====================================================================== 4. Wiedergabe

el.btnPlay.addEventListener('click', () => api.playPause());
el.btnStop.addEventListener('click', () => api.stop());

el.speed.addEventListener('input', () => {
  api.playbackSpeed = Number(el.speed.value) / 100;
  el.speedOut.textContent = `${el.speed.value} %`;
});
el.chkMetronome.addEventListener('change', () => { api.metronomeVolume = el.chkMetronome.checked ? 1 : 0; });
el.chkCountIn.addEventListener('change', () => { api.countInVolume = el.chkCountIn.checked ? 1 : 0; });
el.chkLoop.addEventListener('change', () => { api.isLooping = el.chkLoop.checked; });
el.btnClearRange.addEventListener('click', () => {
  api.playbackRange = null;
  api.clearPlaybackRangeHighlight();
});

// Leertaste startet/pausiert, außer beim Tippen im Editor
document.addEventListener('keydown', (e) => {
  const typing = ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName);
  if (e.code === 'Space' && !typing && !el.btnPlay.disabled) {
    e.preventDefault();
    api.playPause();
  }
});

// ====================================================================== 5. alphaTex-Editor

let texTimer = null;
let lastTexScore = null;       // letzter fehlerfreier Stand aus dem Editor

el.btnEditor.addEventListener('click', () => setEditorOpen(el.editor.hidden));

function setEditorOpen(open) {
  el.editor.hidden = !open;
  el.btnEditor.setAttribute('aria-pressed', String(open));
  api.updateSettings();
  api.render();                // Notenbreite an den neuen Platz anpassen
}

el.tex.addEventListener('input', () => {
  clearTimeout(texTimer);
  texTimer = setTimeout(() => renderTex(el.tex.value), 500);
});

// Tab-Taste fügt im Editor zwei Leerzeichen ein, statt den Fokus zu wechseln
el.tex.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const { selectionStart: s, selectionEnd: t, value } = el.tex;
    el.tex.value = value.slice(0, s) + '  ' + value.slice(t);
    el.tex.selectionStart = el.tex.selectionEnd = s + 2;
  }
});

/** Prüft den alphaTex-Text. Bei Fehlern bleibt die letzte gültige Darstellung stehen. */
function renderTex(text) {
  try {
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(text, api.settings);
    lastTexScore = score;
    showDiagnostics([]);
    showScore(score);
  } catch (e) {
    showDiagnostics(collectDiagnostics(e));
  }
}

function collectDiagnostics(e) {
  if (e && typeof e.iterateDiagnostics === 'function') {
    const list = [];
    for (const d of e.iterateDiagnostics()) list.push(d);
    if (list.length) return list;
  }
  return [{ severity: 2, code: '', message: e && e.message ? e.message : String(e) }];
}

function showDiagnostics(list) {
  el.diagnostics.replaceChildren();
  if (list.length === 0) {
    const ok = document.createElement('div');
    ok.className = 'ok';
    ok.textContent = '✓ alphaTex fehlerfrei';
    el.diagnostics.append(ok);
    return;
  }
  for (const d of list) {
    const row = document.createElement('div');
    // Schweregrad laut alphaTab: 0 = Hinweis, 1 = Warnung, 2 = Fehler
    row.className = d.severity >= 2 ? 'err' : 'warn';
    const where = d.start ? `Zeile ${d.start.line}, Spalte ${d.start.col}: ` : '';
    const code = d.code !== '' && d.code !== undefined ? ` [AT${d.code}]` : '';
    row.textContent = `${d.severity >= 2 ? 'Fehler' : 'Warnung'}${code} – ${where}${d.message}`;
    if (d.start) {
      row.style.cursor = 'pointer';
      row.title = 'Zur Stelle springen';
      row.addEventListener('click', () => jumpTo(d.start.offset));
    }
    el.diagnostics.append(row);
  }
}

function jumpTo(offset) {
  el.tex.focus();
  el.tex.setSelectionRange(offset, offset + 1);
}

// Den geladenen Song als alphaTex-Text anzeigen, z. B. eine Guitar-Pro-Datei "lesen lernen"
el.btnFromScore.addEventListener('click', () => {
  if (!currentScore) return;
  const text = new alphaTab.exporter.AlphaTexExporter().exportToString(currentScore, api.settings);
  el.tex.value = text;
  el.fileName.value = baseName(currentName || 'song') + '.atex';
  if (el.editor.hidden) setEditorOpen(true);
  renderTex(text);
});

el.btnSaveTex.addEventListener('click', async () => {
  const name = ensureEnding(el.fileName.value.trim() || 'mein-song', '.atex');
  el.fileName.value = name;
  if (await saveToServer(name, el.tex.value, 'text/plain; charset=utf-8')) {
    currentName = name;
    await refreshSongList(name);
  }
});

el.btnExportGp.addEventListener('click', async () => {
  const score = (!el.editor.hidden && lastTexScore) ? lastTexScore : currentScore;
  if (!score) return;
  const bytes = new alphaTab.exporter.Gp7Exporter().export(score, api.settings);
  const name = baseName(el.editor.hidden ? (currentName || 'song') : el.fileName.value) + '.gp';
  download(bytes, name);
  if (await saveToServer(name, bytes, 'application/octet-stream')) {
    await refreshSongList(el.songSelect.value);
  }
});

el.btnNew.addEventListener('click', () => {
  el.tex.value = NEW_SONG_TEMPLATE;
  el.fileName.value = 'neuer-song.atex';
  currentName = null;
  if (el.editor.hidden) setEditorOpen(true);
  renderTex(NEW_SONG_TEMPLATE);
  el.tex.focus();
});

el.songSelect.addEventListener('change', () => loadSong(el.songSelect.value));

// ====================================================================== 6. Drucken

/*
 * Gedruckt wird, was zu sehen ist: die links angehakten Spuren in der gewählten Ansicht.
 * So druckt jedes Bandmitglied nur seine eigene Stimme.
 *
 * alphaTab öffnet dafür ein eigenes Druckfenster im A4-Format und zeichnet die Noten dort neu
 * (ohne Wiedergabe-Cursor und vollständig statt stückweise).
 *
 * Die Ansicht wird pro Notensystem eingestellt und nicht global, damit das Schlagzeug bei
 * "nur Tabulatur" nicht verschwindet: Es hat keine Tabulatur und bleibt deshalb als Noten stehen.
 */

el.btnPrint.addEventListener('click', printScore);

el.viewMode.addEventListener('change', () => {
  if (!currentScore) return;
  applyView(currentScore, el.viewMode.value);
  api.render();
});

/** Merkt sich, wie der Song selbst jedes Notensystem darstellen möchte. */
function rememberSongView(score) {
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      staff.songView = { tabs: staff.showTablature, notes: staff.showStandardNotation };
    }
  }
}

/** Stellt jedes Notensystem auf die gewählte Ansicht um. */
function applyView(score, mode) {
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      const canTab = !staff.isPercussion && staff.tuning.length > 0;   // Schlagzeug, Gesang: keine Tabs
      let tabs = staff.songView.tabs;
      let notes = staff.songView.notes;
      if (mode === 'tab')      { tabs = canTab; notes = !canTab; }
      if (mode === 'scoreTab') { tabs = canTab; notes = true; }
      if (mode === 'score')    { tabs = false;  notes = true; }
      staff.showTablature = tabs;
      staff.showStandardNotation = notes;
    }
  }
}

function printScore() {
  if (!currentScore) return;
  try {
    api.print();
    setStatus('Druckansicht geöffnet');
  } catch (e) {
    // häufigste Ursache: Der Browser blockiert neue Fenster (Pop-ups)
    setStatus('Druckfenster blockiert – bitte Pop-ups für diese Seite erlauben.', true);
  }
}

// ====================================================================== 7. Beenden

$('btn-quit').addEventListener('click', async () => {
  const ok = window.confirm('TheKellerkinder beenden?\n\nDer Server wird heruntergefahren. '
    + 'Nicht gespeicherte Änderungen im alphaTex-Editor gehen verloren.');
  if (!ok) return;
  try { api.stop(); } catch { /* Wiedergabe lief nicht */ }
  try {
    await fetch('/api/beenden', { method: 'POST' });
  } catch {
    // Der Server kann schon weg sein, bevor die Antwort ankommt – das ist in Ordnung.
  }
  document.body.classList.add('is-ended');
  $('ended').hidden = false;
});

// In der Web-Fassung gibt es keinen Server, der beendet werden könnte
if (window.KK_MODE === 'web') $('btn-quit').hidden = true;

// ====================================================================== Schnittstelle für die Hilfe

window.bandApp = {
  /** Liest die Songliste neu ein und lädt optional einen Song (genutzt vom Import der Web-Fassung). */
  async reloadSongs(selectName) {
    await refreshSongList(selectName);
    if (selectName) {
      el.songSelect.value = selectName;
      await loadSong(selectName);
    }
  },
  setStatus,
  /** Übernimmt ein Beispiel aus der Hilfe in den Editor und zeigt es an. */
  tryTex(source) {
    el.tex.value = source;
    el.fileName.value = 'ausprobieren.atex';
    currentName = null;
    if (el.editor.hidden) setEditorOpen(true);
    renderTex(source);
    el.tex.focus();
  },
};

// ====================================================================== Hilfsfunktionen

async function saveToServer(name, body, type) {
  const res = await fetch('/api/songs/' + encodeURIComponent(name), {
    method: 'PUT', headers: { 'Content-Type': type }, body,
  });
  const msg = await res.text();
  setStatus(msg, !res.ok);
  return res.ok;
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(name) {
  return String(name).replace(/\.[^.]+$/, '') || 'song';
}

function ensureEnding(name, ending) {
  return name.toLowerCase().endsWith(ending) ? name : baseName(name) + ending;
}

function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function setStatus(text, isError = false) {
  el.status.textContent = text;
  el.status.style.color = isError ? 'var(--error)' : '';
}

// ====================================================================== Start

(async function start() {
  const songs = await refreshSongList();
  const first = songs.find((s) => s.name === 'probe-riff.gp') || songs[0];
  if (first) {
    el.songSelect.value = first.name;
    await loadSong(first.name);
  } else {
    el.btnNew.click();
  }
})();
