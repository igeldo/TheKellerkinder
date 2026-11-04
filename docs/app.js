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
  btnFromScore: $('btn-from-score'), btnSaveTex: $('btn-save-tex'),
  btnPlay: $('btn-play'), btnStop: $('btn-stop'), time: $('time'),
  speed: $('speed'), speedOut: $('speed-out'),
  chkMetronome: $('chk-metronome'), chkCountIn: $('chk-countin'), chkLoop: $('chk-loop'),
  btnClearRange: $('btn-clear-range'), status: $('status'),
  btnPrint: $('btn-print'), viewMode: $('view-mode'),
  zoom: $('zoom'), zoomOut: $('zoom-out'),
};

// iPad/iPhone erkennen (iPadOS meldet sich als Mac, hat aber einen Touchbildschirm)
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// Zoom für Noten und Bedienleisten: am Rechner 100 %, auf dem iPad 80 %; die eigene Wahl merkt sich die App
const ZOOM_PREF = 'kk-zoom';
const NOTEN_SKALA = 0.95;      // Grundgröße der Noten bei 100 %
function readZoom() {
  try {
    const v = Number(window.localStorage.getItem(ZOOM_PREF));
    if (v >= 50 && v <= 150) return v;
  } catch { /* privates Fenster o. ä. */ }
  return IS_IOS ? 80 : 100;
}
let zoomPct = readZoom();
document.documentElement.style.setProperty('--ui-zoom', String(zoomPct / 100));

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

// ====================================================================== 0. Aufklapp-Regler
/*
 * Statt breiter Schieberegler: ein kleiner Knopf zeigt den Wert (z. B. "Tempo 100 %"), ein Klick klappt
 * den Regler auf. Das Feld wird an <body> gehängt und fest positioniert – so schneiden es weder die
 * Seitenleiste noch der Zoom der Leisten ab. Klick daneben oder Esc schließt es.
 */
let openPop = null;   // { btn, panel }

function closePop() {
  if (!openPop) return;
  openPop.panel.hidden = true;
  openPop.btn.setAttribute('aria-expanded', 'false');
  openPop = null;
}

function placePanel(btn, panel) {
  const r = btn.getBoundingClientRect();
  const w = panel.offsetWidth, h = panel.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  let top = r.top - h - 8;                                   // bevorzugt über dem Knopf
  if (top < 8) top = r.bottom + 8;                          // sonst darunter
  if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function setupPop(pop) {
  const btn = pop.querySelector('.pop-btn');
  const panel = pop.querySelector('.pop-panel');
  const range = panel.querySelector('input[type="range"]');
  document.body.append(panel);
  btn.addEventListener('click', () => {
    const wasOpen = openPop && openPop.panel === panel;
    closePop();
    if (wasOpen) return;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    openPop = { btn, panel };
    placePanel(btn, panel);
    if (!IS_IOS) range.focus();       // iPad: kein Fokus, sonst springt die Seite
  });
  const nudge = (v) => {
    range.value = String(v);
    range.dispatchEvent(new Event('input', { bubbles: true }));
  };
  panel.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => nudge(Number(range.value) + Number(b.dataset.step))));
  panel.querySelectorAll('[data-reset]').forEach((b) =>
    b.addEventListener('click', () => nudge(Number(b.dataset.reset))));
  return { btn, panel, range };
}

/** Baut einen Aufklapp-Regler per Skript (für die Lautstärke je Spur). */
function makePop({ label, title, heading, min, max, step, value, stepBtn, reset, onInput, format = (v) => `${v} %` }) {
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.innerHTML = `<button type="button" class="pop-btn small" aria-expanded="false"></button>
    <div class="pop-panel" hidden role="dialog">
      <div class="pop-title"></div>
      <input type="range">
      <div class="pop-row"><button type="button" data-step="-${stepBtn}" aria-label="leiser">−</button><button type="button" data-reset="${reset}">${reset} %</button><button type="button" data-step="${stepBtn}" aria-label="lauter">+</button></div>
    </div>`;
  const btn = pop.querySelector('.pop-btn');
  const out = document.createElement('output');
  btn.title = title;
  btn.append(`${label} `, out);
  const panel = pop.querySelector('.pop-panel');
  panel.setAttribute('aria-label', heading);
  panel.querySelector('.pop-title').textContent = heading;
  const range = panel.querySelector('input');
  Object.assign(range, { min: String(min), max: String(max), step: String(step), value: String(value) });
  range.setAttribute('aria-label', title);
  const show = () => { out.textContent = format(Number(range.value)); };
  show();
  range.addEventListener('input', () => { show(); onInput(Number(range.value)); });
  const parts = setupPop(pop);
  return { pop, ...parts };
}

document.querySelectorAll('.pop').forEach(setupPop);
document.addEventListener('pointerdown', (e) => {
  if (openPop && !openPop.panel.contains(e.target) && !openPop.btn.contains(e.target)) closePop();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
window.addEventListener('resize', () => { if (openPop) placePanel(openPop.btn, openPop.panel); });
document.addEventListener('scroll', (e) => {
  if (openPop && !(e.target instanceof Element && e.target.closest('.score-wrap'))) placePanel(openPop.btn, openPop.panel);
}, true);

// ---------------------------------------------------------------- Kopfzeile immer einzeilig
const topbar = document.querySelector('.topbar');
let fitQueued = false;
function fitTopbar() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    topbar.classList.remove('fit-1', 'fit-2', 'fit-3');
    for (let stufe = 1; stufe <= 3 && topbar.scrollWidth > topbar.clientWidth; stufe++) {
      topbar.classList.add(`fit-${stufe}`);
    }
  });
}
new ResizeObserver(fitTopbar).observe(topbar);
new MutationObserver(fitTopbar).observe(topbar, { childList: true, subtree: true, characterData: true });   // neue Knöpfe, Songliste
window.addEventListener('load', fitTopbar);

// Versionsanzeige unten rechts; in der Web-Fassung zeigt der Tooltip zusätzlich die Baunummer
{
  const build = document.querySelector('meta[name="kk-build"]')?.content;
  $('app-version').title = build ? `TheKellerkinder v1.2 · Build ${build}` : 'TheKellerkinder v1.2';
}

// ====================================================================== 1. alphaTab einrichten

const api = new alphaTab.AlphaTabApi(el.score, {
  core: {
    fontDirectory: BASE + 'vendor/alphatab/font/',
  },
  display: {
    layoutMode: alphaTab.LayoutMode.Page,
    scale: NOTEN_SKALA * zoomPct / 100,
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
// ---------------------------------------------------------------- Klänge: Standard + Band-Klänge
/*
 * Standardklänge (Sonivox, 1,4 MB) sind immer da. Die Band-Klänge (E-Gitarren, Akustikgitarren,
 * Bass, Schlagzeug aus GeneralUser GS, 6,9 MB) lassen sich per Knopf dazuladen und wieder abwählen.
 *
 *   Dazuladen: loadSoundFont(band, true)      – zusätzlich; bei gleichen Instrumenten gilt die zuletzt geladene
 *   Abwählen:  loadSoundFont(standard, false) – ersetzt alles wieder durch die Standardklänge
 *
 * Vorgabe: Web-Fassung aus (spart den Download), Java-Fassung an (liegt ohnehin im Programm).
 * Die Wahl wird auf dem Gerät gemerkt.
 */
const STANDARD_SOUNDFONT = BASE + 'vendor/alphatab/soundfont/sonivox.sf2';
const BAND_SOUNDFONT = BASE + 'klaenge/band-klaenge.sf2';
const BAND_GROESSE = '6,9 MB';
const BAND_PREF = 'kk-band-klaenge';
let bandState = 'aus';           // aus | laedt | an
const pendingFonts = ['standard'];   // erwartete "soundFontLoaded"-Meldungen in Ladereihenfolge
let wantBand = readBandPref();
let loadPct = 0;

function readBandPref() {
  try {
    const v = window.localStorage.getItem(BAND_PREF);
    if (v === 'an' || v === 'aus') return v === 'an';
  } catch { /* Speicher nicht verfügbar */ }
  return window.KK_MODE !== 'web';
}

function writeBandPref(on) {
  try { window.localStorage.setItem(BAND_PREF, on ? 'an' : 'aus'); } catch { /* egal */ }
}

function loadBandFont() {
  bandState = 'laedt';
  loadPct = 0;
  pendingFonts.push('band');
  updateBandButton();
  api.loadSoundFont(BAND_SOUNDFONT, true);
}

function unloadBandFont() {
  bandState = 'laedt';
  pendingFonts.push('nur-standard');
  updateBandButton();
  api.loadSoundFont(STANDARD_SOUNDFONT, false);
}

if (api.player) {
  api.player.soundFontLoaded.on(() => {
    const what = pendingFonts.shift();
    if (what === 'standard') {
      if (wantBand) loadBandFont();
    } else if (what === 'band') {
      bandState = 'an';
      setStatus(`Bereit – Band-Klänge geladen (E-Gitarren, Akustik, Bass, Schlagzeug)`);
    } else if (what === 'nur-standard') {
      bandState = 'aus';
      freeBandCache().then((freed) => setStatus('Bereit – Standardklänge aktiv'
        + (freed ? ` · Band-Klänge von diesem Gerät entfernt (${BAND_GROESSE} frei)` : '')));
    }
    updateBandButton();
    if (currentScore) showVariantHint(currentScore);
  });
}

api.soundFontLoad.on((e) => {
  const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
  const band = pendingFonts[0] === 'band';
  if (band) { loadPct = pct; updateBandButton(); }
  setStatus(`${band ? 'Lade Band-Klänge' : 'Lade Instrumentenklänge'} … ${pct} %`);
});

/** Web-Fassung: zwischengespeicherte Band-Klänge wieder löschen (gibt Speicher auf dem Gerät frei). */
async function freeBandCache() {
  if (window.KK_MODE !== 'web' || !('caches' in window)) return false;
  let freed = false;
  try {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      if (await cache.delete(BAND_SOUNDFONT)) freed = true;
    }
  } catch { /* Cache nicht verfügbar */ }
  return freed;
}

const btnBand = $('btn-band');
function updateBandButton() {
  const web = window.KK_MODE === 'web';
  btnBand.setAttribute('aria-pressed', String(bandState === 'an'));
  btnBand.disabled = bandState === 'laedt' || !playerIsReady && bandState === 'aus' && pendingFonts.length > 0;
  if (bandState === 'laedt') {
    btnBand.textContent = pendingFonts.includes('band') ? `Lade Band-Klänge … ${loadPct} %` : 'Wechsle zu Standardklängen …';
  } else if (bandState === 'an') {
    btnBand.textContent = 'Band-Klänge: an ✓';
    btnBand.title = 'Klicken, um zu den Standardklängen zurückzukehren'
      + (web ? ` – gibt ${BAND_GROESSE} auf diesem Gerät frei.` : '.');
  } else {
    btnBand.textContent = web ? `Band-Klänge laden (${BAND_GROESSE})` : 'Band-Klänge: aus';
    btnBand.title = 'Bessere Klänge für E-Gitarren (inkl. Chorus, Funk, Wah, Feedback), Akustikgitarren, '
      + 'Bass und Schlagzeug. '
      + (web ? `Einmaliger Download von ${BAND_GROESSE}, danach auf diesem Gerät gespeichert (auch offline).`
             : 'Liegen im Programm, kein Download.');
  }
}

btnBand.addEventListener('click', () => {
  if (bandState === 'laedt') return;
  wantBand = bandState !== 'an';
  writeBandPref(wantBand);
  if (wantBand) loadBandFont(); else unloadBandFont();
});

/** Hinweis, wenn ein Song Klang-Varianten nutzt, die es nur mit den Band-Klängen gibt (sonst stumm). */
function showVariantHint(score) {
  if (bandState === 'an') return;
  const variants = score.tracks.filter((t) => t.playbackInfo.bank > 0 && !t.staves[0].isPercussion);
  if (variants.length) {
    setStatus(`Hinweis: ${variants.map((t) => t.name).join(', ')} ${variants.length > 1 ? 'nutzen' : 'nutzt'} Klang-Varianten, die nur mit den `
      + 'Band-Klängen erklingen – Knopf „Band-Klänge laden“ unten.', true);
  }
}

let playerIsReady = false;
api.playerReady.on(() => {
  el.btnPlay.disabled = false;
  el.btnStop.disabled = false;
  // nur beim ersten Mal melden – sonst würde jede Statusmeldung beim Songwechsel überschrieben
  if (!playerIsReady && bandState !== 'laedt') setStatus('Bereit – Standardklänge geladen');
  playerIsReady = true;
  updateBandButton();
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
  if (pendingFonts[0] === 'band') {
    // nur die Zusatzklänge fehlen – die Standardklänge funktionieren weiter
    pendingFonts.shift();
    bandState = 'aus';
    updateBandButton();
    setStatus(window.KK_MODE === 'web' && !navigator.onLine
      ? 'Band-Klänge können ohne Internet nicht geladen werden – es werden die Standardklänge verwendet.'
      : 'Band-Klänge nicht gefunden – es werden die Standardklänge verwendet.', true);
    return;
  }
  // Fehler, bevor der Player bereit ist, betreffen fast immer die Instrumentenklänge (Soundfont)
  setStatus(playerIsReady ? 'Fehler: ' + text : 'Ton nicht verfügbar: ' + text, true);
});

// ====================================================================== 2. Songs laden

async function refreshSongList(selectName) {
  const res = await fetch('/api/songs');
  const songs = await res.json();
  el.songSelect.replaceChildren();

  const option = (s, label) => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = label || s.name;
    return opt;
  };

  // Web-Fassung: Songs auf diesem Gerät getrennt von den Band-Songs (GitHub) anzeigen.
  // Die Java-Fassung liefert keine solchen Angaben – dann bleibt es eine einfache Liste.
  if (songs.some((s) => s.local)) {
    const band = document.createElement('optgroup');
    band.label = 'Band-Songs';
    const mine = document.createElement('optgroup');
    mine.label = 'Auf diesem Gerät';
    for (const s of songs) {
      if (!s.local) band.append(option(s));
      else mine.append(option(s, s.bundled ? `${s.name} (lokal geändert)` : `${s.name} (lokal)`));
    }
    if (band.childElementCount) el.songSelect.append(band);
    el.songSelect.append(mine);
  } else {
    for (const s of songs) el.songSelect.append(option(s));
  }

  if (selectName && songs.some((s) => s.name === selectName)) {
    el.songSelect.value = selectName;
  }
  songInfo = new Map(songs.map((s) => [s.name, s]));
  updateDeleteButton();
  return songs;
}

async function loadSong(name) {
  setStatus(`Lade ${name} …`);
  if (el.songSelect.value !== name) el.songSelect.value = name;
  updateDeleteButton();
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
      // Der Editor zeigt noch den vorherigen Text – deutlich machen, damit nichts versehentlich überschrieben wird
      el.fileName.value = baseName(name) + '.atex';
      lastTexScore = null;
      el.diagnostics.textContent = `Geladen: ${name}. Der Editor zeigt noch den vorherigen Text – „Song → Text“ übernimmt diesen Song.`;
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
  showVariantHint(score);
}

// ====================================================================== 3. Spuren

function buildTrackList(score) {
  el.trackList.replaceChildren();
  closePop();
  document.querySelectorAll('.pop-panel[data-track-pop]').forEach((p) => p.remove());   // Regler des alten Songs
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

    const vol = makePop({
      label: '🔊', title: `Lautstärke ${name.textContent}`, heading: `Lautstärke: ${name.textContent}`,
      min: 0, max: 150, step: 5, value: Math.round((trackState[i].volume ?? 1) * 100), stepBtn: 10, reset: 100,
      format: (v) => (v === 100 ? '' : String(v)),   // bei 100 % nur das Symbol, sonst die Zahl
      onInput: (v) => {
        trackState[i].volume = v / 100;
        api.changeTrackVolume([track], v / 100);
      },
    });
    vol.panel.dataset.trackPop = '';
    li.append(show, name, mute, solo, vol.pop);
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

el.zoom.value = String(zoomPct);
el.zoomOut.textContent = `${zoomPct} %`;
let zoomTimer = null;
el.zoom.addEventListener('input', () => {
  zoomPct = Number(el.zoom.value);
  el.zoomOut.textContent = `${zoomPct} %`;
  document.documentElement.style.setProperty('--ui-zoom', String(zoomPct / 100));
  fitTopbar();
  try { window.localStorage.setItem(ZOOM_PREF, String(zoomPct)); } catch { /* egal */ }
  if (openPop) placePanel(openPop.btn, openPop.panel);
  // Noten erst neu zeichnen, wenn der Regler kurz ruht (Neuzeichnen dauert bei langen Songs)
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    api.settings.display.scale = NOTEN_SKALA * zoomPct / 100;
    api.updateSettings();
    if (currentScore) api.render();
  }, 250);
});
el.chkMetronome.addEventListener('change', () => { api.metronomeVolume = el.chkMetronome.checked ? 1 : 0; });
el.chkCountIn.addEventListener('change', () => { api.countInVolume = el.chkCountIn.checked ? 1 : 0; });
el.chkLoop.addEventListener('change', () => { api.isLooping = el.chkLoop.checked; });
el.btnClearRange.addEventListener('click', () => {
  api.playbackRange = null;
  api.clearPlaybackRangeHighlight();
});

// ---------------------------------------------------------------- Bereich wählen auf dem Touchbildschirm
/*
 * alphaTab markiert Bereiche nur mit der Maus. Auf dem iPad wird ein Wischen zum Scrollen und ein Tipp
 * setzt nur den Startstrich. Deshalb gibt es den Knopf "Bereich wählen": solange er an ist, scrollt der
 * Finger nicht, sondern markiert ganze Takte – ziehen, oder ersten und letzten Takt nacheinander antippen.
 * Danach schaltet sich der Knopf von selbst aus (dann lässt sich wieder scrollen).
 */
const btnRange = $('btn-range');
let rangeMode = false;
let rangeFirst = null;      // erster Takt (Schlag), solange der zweite noch fehlt
let rangeDrag = null;       // { start, moved, x, y, last }
let lastTouchAt = 0;        // Zeitpunkt der letzten Fingerberührung

function setRangeMode(on) {
  rangeMode = on;
  rangeFirst = null;
  rangeDrag = null;
  btnRange.setAttribute('aria-pressed', String(on));
  el.scoreWrap.classList.toggle('range-mode', on);
  if (on) setStatus('Bereich wählen: mit dem Finger über die Takte ziehen – oder ersten und letzten Takt antippen.');
}
btnRange.addEventListener('click', () => setRangeMode(!rangeMode));

function beatAt(e) {
  const surface = el.score.querySelector('.at-surface');
  if (!surface || !api.boundsLookup) return null;
  const r = surface.getBoundingClientRect();
  return api.boundsLookup.getBeatAtPos(e.clientX - r.left, e.clientY - r.top);
}

/** markiert ganze Takte von Schlag a bis Schlag b (Reihenfolge egal) */
function markBars(a, b, apply) {
  const ia = a.voice.bar.masterBar.index, ib = b.voice.bar.masterBar.index;
  const [lo, hi] = ia <= ib ? [a, b] : [b, a];
  const first = lo.voice.beats[0];
  const last = hi.voice.beats[hi.voice.beats.length - 1];
  api.highlightPlaybackRange(first, last);
  if (apply) api.applyPlaybackRangeFromHighlight();
  return [Math.min(ia, ib) + 1, Math.max(ia, ib) + 1];
}

function finishRange(a, b) {
  const [von, bis] = markBars(a, b, true);
  setRangeMode(false);
  setStatus(von === bis ? `Bereich: Takt ${von}. Schleife einschalten zum Wiederholen.`
                        : `Bereich: Takt ${von}–${bis}. Schleife einschalten zum Wiederholen.`);
}

/*
 * Fingerbewegung über Touch-Ereignisse (nicht Pointer-Ereignisse): Safari auf dem iPad bricht Pointer-
 * Ereignisse ab (pointercancel), sobald es ein Wischen als Scrollen deutet. Ein touchmove mit
 * preventDefault() (passive: false) verhindert das Scrollen zuverlässig.
 */
function touchPoint(e) { return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null; }

el.scoreWrap.addEventListener('touchstart', (e) => {
  if (!rangeMode || e.touches.length !== 1) return;
  e.preventDefault(); e.stopPropagation();   // kein Scrollen, kein Startstrich-Sprung durch alphaTab
  lastTouchAt = Date.now();
  const t = touchPoint(e);
  const beat = beatAt(t);                    // kann null sein (zwischen den Zeilen) – dann zählt der erste Takt beim Ziehen
  rangeDrag = { start: beat, moved: false, x: t.clientX, y: t.clientY, last: beat };
  if (beat) markBars(rangeFirst || beat, beat, false);
}, { capture: true, passive: false });

el.scoreWrap.addEventListener('touchmove', (e) => {
  if (!rangeMode) return;
  e.preventDefault(); e.stopPropagation();
  if (!rangeDrag) return;
  const t = touchPoint(e);
  if (Math.hypot(t.clientX - rangeDrag.x, t.clientY - rangeDrag.y) > 12) rangeDrag.moved = true;
  const beat = beatAt(t);
  if (beat) {
    if (!rangeDrag.start) rangeDrag.start = beat;
    rangeDrag.last = beat;
    markBars(rangeFirst && !rangeDrag.moved ? rangeFirst : rangeDrag.start, beat, false);
  }
}, { capture: true, passive: false });

el.scoreWrap.addEventListener('touchend', (e) => {
  if (!rangeMode) return;
  e.preventDefault(); e.stopPropagation();
  lastTouchAt = Date.now();
  if (!rangeDrag) return;
  const t = touchPoint(e);
  const end = (t && beatAt(t)) || rangeDrag.last || rangeDrag.start;
  const { start, moved } = rangeDrag;
  rangeDrag = null;
  if (!start || !end) return;                // nur zwischen den Zeilen getippt
  if (moved) { finishRange(start, end); return; }
  if (!rangeFirst) {                         // erster Tipp: Anfang merken
    rangeFirst = start;
    markBars(start, start, false);
    setStatus(`Anfang: Takt ${start.voice.bar.masterBar.index + 1} – jetzt den letzten Takt antippen (oder ziehen).`);
  } else {
    finishRange(rangeFirst, start);          // zweiter Tipp: fertig
  }
}, { capture: true, passive: false });

el.scoreWrap.addEventListener('touchcancel', () => {
  if (!rangeMode || !rangeDrag) return;
  const { start, last, moved } = rangeDrag;  // abgebrochen: das bis dahin Gezogene übernehmen
  rangeDrag = null;
  if (moved && start && last) finishRange(start, last);
}, true);
// alphaTab hört auf Mausereignisse – die beim Tippen zusätzlich erzeugten im Bereichsmodus abfangen
['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'click'].forEach((t) => el.scoreWrap.addEventListener(t, (e) => {
  if (!rangeMode) return;
  const vomFinger = e.pointerType ? e.pointerType !== 'mouse' : Date.now() - lastTouchAt < 1000;
  if (vomFinger) { e.stopPropagation(); e.preventDefault(); }
}, true));

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

// ====================================================================== 5b. Speichern, Herunterladen, Öffnen
/*
 * Drei klar getrennte Aktionen – in der Java- und in der Web-Fassung gleich:
 *
 *   In Songliste speichern  Editor-Text in die Songliste der App
 *                           Java: Ordner songs/ (Pfad zeigt die App an) · Web: Browser-Speicher dieses Geräts
 *   Herunterladen ▾         aktuellen Song als .gp oder .atex in den Download-Ordner des Browsers
 *                           (sonst passiert nichts – die Songliste bleibt unverändert)
 *   Öffnen …                Datei(en) vom Rechner holen (.gp, .atex, MusicXML, ZIP), in die Songliste
 *                           übernehmen und öffnen – der Rückweg zum Herunterladen
 */

const SONG_FILE = /\.(atex|gp|gpx|gp3|gp4|gp5|xml|musicxml|cap)$/i;
const DOWNLOAD_ORT = 'Download-Ordner des Browsers (meist „Downloads“; iPad: Dateien → Downloads)';
const ORT = {
  lang: 'den Ordner songs/',      // für Hinweise: "Speichert in …"
  kurz: 'Ordner songs/',          // für Statusmeldungen: "… → Ort"
  papierkorb: 'Ordner songs/papierkorb/',   // Java: dorthin verschiebt "Löschen"
};

/** Ermittelt, wohin "Speichern" und "Öffnen" schreiben, und beschriftet Hinweise und Tooltips. */
async function showSaveLocation() {
  if (window.KK_MODE === 'web') {
    ORT.lang = 'den Speicher dieses Browsers – nur auf diesem Gerät, zu sehen unter „Meine Songs“';
    ORT.kurz = 'auf diesem Gerät (Browser-Speicher, „Meine Songs“)';
  } else {
    try {
      const info = await (await fetch('/api/info')).json();
      ORT.lang = `den Ordner ${info.songDir}`;
      ORT.kurz = info.songDir;
      ORT.papierkorb = info.trashDir || ORT.papierkorb;
    } catch { /* ältere Server ohne /api/info: allgemeine Angabe behalten */ }
  }
  const hint = $('save-hint');
  hint.replaceChildren(
    'Speichert in ', Object.assign(document.createElement('b'), { textContent: ORT.lang }), '. ',
    'Als Datei auf den Rechner: oben ', Object.assign(document.createElement('b'), { textContent: 'Herunterladen' }), '.');
  el.btnSaveTex.title = `Speichert den Text unter dem Dateinamen oben in ${ORT.lang}.`;
  $('btn-open').title = `Datei vom Rechner öffnen (.gp, .atex, MusicXML oder ZIP). Sie wird in ${ORT.lang} übernommen.`;
}

/** Schreibt einen Song in die Songliste (Java: Ordner songs/, Web: Browser-Speicher). */
async function putSong(name, body, type) {
  const res = await fetch('/api/songs/' + encodeURIComponent(name), {
    method: 'PUT', headers: { 'Content-Type': type }, body,
  });
  const text = await res.text();
  // Java-Fassung antwortet mit dem vollständigen Pfad, die Web-Fassung mit einem Satz
  const where = window.KK_MODE === 'web' ? ORT.kurz : text;
  return { ok: res.ok, where, text };
}

// ---------------------------------------------------------------- In Songliste speichern
el.btnSaveTex.addEventListener('click', async () => {
  const name = ensureEnding(el.fileName.value.trim() || 'mein-song', '.atex');
  el.fileName.value = name;
  const r = await putSong(name, el.tex.value, 'text/plain; charset=utf-8');
  if (r.ok) {
    currentName = name;
    await refreshSongList(name);
    setStatus(`Gespeichert: ${name} → ${r.where}`);
  } else {
    setStatus(`Nicht gespeichert: ${r.text}`, true);
  }
});

// ---------------------------------------------------------------- Herunterladen ▾
const downloadMenu = $('download-menu');
// Die Auswahl hängt an <body> (die Kopfzeile darf seitlich scrollen und würde sie sonst abschneiden)
const downloadItems = downloadMenu.querySelector('.menu-items');
document.body.append(downloadItems);
downloadItems.hidden = true;
downloadMenu.addEventListener('toggle', () => {
  downloadItems.hidden = !downloadMenu.open;
  if (!downloadMenu.open) return;
  const r = downloadMenu.querySelector('summary').getBoundingClientRect();
  downloadItems.style.top = `${Math.round(r.bottom + 6)}px`;
  downloadItems.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - downloadItems.offsetWidth - 8)))}px`;
});
downloadItems.querySelectorAll('[data-format]').forEach((b) => b.addEventListener('click', async () => {
  downloadMenu.open = false;
  await downloadCurrent(b.dataset.format);
}));
document.addEventListener('click', (e) => {
  if (downloadMenu.open && !downloadMenu.contains(e.target) && !downloadItems.contains(e.target)) downloadMenu.open = false;
});

/** Lädt den aktuellen Song herunter: bei offenem Editor dessen Stand, sonst den gewählten Song. */
async function downloadCurrent(format) {
  const fromEditor = !el.editor.hidden && lastTexScore;
  const score = fromEditor ? lastTexScore : currentScore;
  if (!score) {
    setStatus('Kein Song geladen – nichts herunterzuladen.', true);
    return;
  }
  const base = baseName(fromEditor ? el.fileName.value : (currentName || 'song'));
  let name;
  if (format === 'gp') {
    name = base + '.gp';
    const bytes = withSongView(score, () => new alphaTab.exporter.Gp7Exporter().export(score, api.settings));
    download(bytes, name);
  } else {
    name = base + '.atex';
    let text;
    if (fromEditor) {
      text = el.tex.value;                                    // genau der Text im Editor
    } else if (currentName && /\.atex$/i.test(currentName)) {
      text = await (await fetch('/api/songs/' + encodeURIComponent(currentName))).text();
    } else {
      text = withSongView(score, () => new alphaTab.exporter.AlphaTexExporter().exportToString(score, api.settings));
    }
    download(new TextEncoder().encode(text), name, 'text/plain;charset=utf-8');
  }
  setStatus(`Heruntergeladen: ${name} → ${DOWNLOAD_ORT}. Weiterarbeiten: „Öffnen …“`);
}

/** Exportiert immer mit der Darstellung aus dem Song, nicht mit der gewählten Bildschirm-Ansicht. */
function withSongView(score, fn) {
  const mode = el.viewMode.value;
  const remembered = score.tracks.length && score.tracks[0].staves[0].songView;
  if (mode === 'song' || !remembered) return fn();
  applyView(score, 'song');
  try { return fn(); } finally { applyView(score, mode); }
}

// ---------------------------------------------------------------- Löschen
/*
 * Java-Fassung: verschiebt den Song in den Unterordner songs/papierkorb/ – dort kann man ihn
 * zurückholen (einfach wieder nach songs/ verschieben) oder endgültig löschen.
 * Web-Fassung: entfernt einen Song aus dem Speicher dieses Browsers. Band-Songs von GitHub
 * lassen sich hier nicht löschen (der Knopf ist dann gesperrt).
 */
let songInfo = new Map();          // Name → Eintrag aus der Songliste (Web: mit local/bundled)
const btnDelete = $('btn-delete');

function canDelete(name) {
  if (!name) return false;
  if (window.KK_MODE === 'web') return !!(songInfo.get(name) || {}).local;
  return true;
}

function updateDeleteButton() {
  const name = el.songSelect.value;
  btnDelete.disabled = !canDelete(name);
  if (!name) {
    btnDelete.title = 'Kein Song ausgewählt';
  } else if (window.KK_MODE === 'web') {
    btnDelete.title = btnDelete.disabled
      ? `„${name}“ ist ein Band-Song von GitHub und lässt sich hier nicht löschen.`
      : `„${name}“ von diesem Gerät entfernen (Browser-Speicher).`;
  } else {
    btnDelete.title = `„${name}“ in den Papierkorb verschieben: ${ORT.papierkorb}`;
  }
}

el.songSelect.addEventListener('change', updateDeleteButton);

btnDelete.addEventListener('click', async () => {
  const name = el.songSelect.value;
  if (!canDelete(name)) return;
  const info = songInfo.get(name) || {};
  const frage = window.KK_MODE === 'web'
    ? `„${name}“ von diesem Gerät löschen?\n\nDer Song wird aus dem Speicher dieses Browsers entfernt – `
      + 'das lässt sich nicht rückgängig machen (vorher ggf. „Herunterladen“).'
      + (info.bundled ? '\nDanach gilt wieder die Band-Fassung von GitHub.' : '')
    : `„${name}“ löschen?\n\nDie Datei wird in den Papierkorb verschoben:\n${ORT.papierkorb}\n\n`
      + 'Dort kann man sie zurückholen oder endgültig löschen.';
  if (!window.confirm(frage)) return;
  const res = await fetch('/api/songs/' + encodeURIComponent(name), { method: 'DELETE' });
  const text = await res.text();
  if (!res.ok) {
    setStatus(`Nicht gelöscht: ${text}`, true);
    return;
  }
  const songs = await refreshSongList();
  const next = songs.some((s) => s.name === name) ? name : (songs[0] && songs[0].name);
  if (next) {
    el.songSelect.value = next;
    await loadSong(next);
  }
  updateDeleteButton();
  setStatus(window.KK_MODE === 'web'
    ? `Gelöscht: ${name} → von diesem Gerät entfernt (Browser-Speicher)` + (info.bundled ? ' · Band-Fassung wieder aktiv' : '')
    : `Gelöscht: ${name} → in den Papierkorb verschoben: ${text}`);
});

// ---------------------------------------------------------------- Öffnen …
const openInput = $('open-input');
// iPad/iPhone: iOS übersetzt die erlaubten Endungen in Apple-Dateitypen. Für .gp, .gp3, .atex … gibt es
// keine, deshalb wären alle Songdateien ausgegraut. Dort also keine Liste vorgeben – importSongFiles()
// prüft die gewählten Dateien ohnehin selbst und überspringt alles, was kein Song ist.
if (IS_IOS) openInput.removeAttribute('accept');
$('btn-open').addEventListener('click', () => openInput.click());
openInput.addEventListener('change', async () => {
  const files = [...openInput.files];
  openInput.value = '';
  if (files.length) await importSongFiles(files);
});

function safeName(name) {
  return String(name).split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[._ -]+/, '') || 'song';
}

/** Übernimmt Songdateien (einzeln oder als ZIP) in die Songliste und öffnet die letzte. */
async function importSongFiles(files) {
  try {
    const entries = [];
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.zip$/i.test(f.name)) entries.push(...await window.KKZip.readZip(bytes));
      else entries.push({ name: f.name, bytes });
    }
    let songs = [];
    const skipped = [];
    for (const e of entries) {
      const name = safeName(e.name);
      if (e.name.includes('__MACOSX/') || name.startsWith('.')) continue;
      if (SONG_FILE.test(name)) songs.push({ name, bytes: e.bytes });
      else if (!/songs\.json$/i.test(name)) skipped.push(name);
    }
    if (!songs.length) {
      setStatus('Keine Songdatei gefunden (.gp, .atex, MusicXML …).', true);
      return;
    }
    // vorhandene Songs nur nach Rückfrage überschreiben
    const existing = new Set((await (await fetch('/api/songs')).json()).map((s) => s.name));
    const clash = songs.filter((s) => existing.has(s.name)).map((s) => s.name);
    if (clash.length && !window.confirm(
      `Schon in der Songliste: ${clash.join(', ')}\n\nOK = überschreiben\nAbbrechen = vorhandene behalten, nur neue übernehmen`)) {
      songs = songs.filter((s) => !clash.includes(s.name));
    }
    const saved = [];
    let where = ORT.kurz;
    for (const s of songs) {
      const isText = /\.(atex|xml|musicxml)$/i.test(s.name);
      const r = await putSong(s.name, isText ? new TextDecoder().decode(s.bytes) : s.bytes,
        isText ? 'text/plain; charset=utf-8' : 'application/octet-stream');
      if (r.ok) { saved.push(s.name); where = window.KK_MODE === 'web' ? r.where : ORT.kurz; }
      else setStatus(`${s.name}: ${r.text}`, true);
    }
    if (!saved.length) return;
    const last = saved[saved.length - 1];
    await refreshSongList(last);
    el.songSelect.value = last;
    await loadSong(last);
    let msg = `Geöffnet und in die Songliste übernommen: ${saved.join(', ')} → ${where}`;
    if (skipped.length) msg += ` · übersprungen (kein Song): ${skipped.join(', ')}`;
    setStatus(msg);
  } catch (e) {
    setStatus('Öffnen fehlgeschlagen: ' + e.message, true);
  }
}

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
  download,
  /** Öffnet den Dateiauswahl-Dialog von „Öffnen …“ (genutzt von „Meine Songs“ in der Web-Fassung). */
  openFiles: () => openInput.click(),
  /** Name des gerade geladenen Songs (oder null). */
  currentName: () => currentName,
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

function download(bytes, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
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
  el.status.title = text;            // voller Text auch als Tooltip
  el.status.style.color = isError ? 'var(--error)' : '';
}

// ====================================================================== Start

(async function start() {
  updateBandButton();
  await showSaveLocation();
  const songs = await refreshSongList();
  const first = songs.find((s) => s.name === 'probe-riff.gp') || songs[0];
  if (first) {
    el.songSelect.value = first.name;
    await loadSong(first.name);
  } else {
    el.btnNew.click();
  }
})();
