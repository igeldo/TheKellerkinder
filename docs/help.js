/*
 * Hilfe-Fenster von TheKellerkinder
 * -----------------------------
 * Zeigt ALPHATEX.md (Syntax) und README.md (Anleitung) an. Beide Dateien liegen im Projektordner
 * und werden beim Bauen ins JAR kopiert (static/docs). Die Markdown-Texte wandelt marked in HTML um.
 *
 * Jedes Codebeispiel, das gültiges alphaTex ist, bekommt einen Knopf "Im Editor ausprobieren".
 * Kurze Beispiele ohne eigene Spur werden dafür automatisch in eine Gitarrenspur eingebettet.
 */
'use strict';

(function () {
  const help = document.getElementById('help');
  const body = document.getElementById('help-body');
  const toc = document.getElementById('help-toc');
  const tabs = [...help.querySelectorAll('[role="tab"]')];
  const DOCS = tabs.map((t) => t.dataset.doc);

  const GUITAR_HEADER =
    '\\track "Gitarre"\n  \\staff {score tabs}\n  \\instrument distortionguitar\n  \\tuning (E4 B3 G3 D3 A2 E2)\n';

  let currentDoc = null;
  let lastFocus = null;

  // ------------------------------------------------------------------ öffnen / schließen

  document.getElementById('btn-help').addEventListener('click', () => open('ALPHATEX.md'));
  help.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !help.hidden) close();
  });
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.doc)));

  function open(doc) {
    lastFocus = document.activeElement;
    help.hidden = false;
    show(doc || currentDoc || DOCS[0]);
    help.querySelector('.help-close').focus();
  }

  function close() {
    help.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  // ------------------------------------------------------------------ Dokument anzeigen

  async function show(doc) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.doc === doc)));
    if (doc === currentDoc && body.childElementCount) return;
    currentDoc = doc;
    body.textContent = 'Lade …';
    toc.replaceChildren();
    try {
      const res = await fetch('/static/docs/' + doc);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();
      await loadMarked();
      body.innerHTML = marked.parse(markdown);   // eigene, vertrauenswürdige Datei aus dem Projekt
      enhance();
      body.scrollTop = 0;
    } catch (e) {
      body.textContent = `${doc} konnte nicht geladen werden (${e.message}).`;
    }
  }

  /** Lädt marked erst bei Bedarf, damit beim Start der Seite nur alphaTab geladen wird. */
  let markedLoading = null;
  function loadMarked() {
    if (window.marked) return Promise.resolve();
    if (!markedLoading) {
      markedLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = (window.KK_BASE || '/static/') + 'vendor/marked/marked.umd.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('marked.umd.js nicht gefunden'));
        document.head.append(s);
      });
    }
    return markedLoading;
  }

  function enhance() {
    // Inhaltsverzeichnis aus den Überschriften der 2. Ebene
    body.querySelectorAll('h2').forEach((h, i) => {
      h.id = 'abschnitt-' + (i + 1);
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      toc.append(a);
    });

    // Links: andere Hilfedatei im Fenster öffnen, externe Seiten in neuem Tab
    body.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (DOCS.includes(href)) {
        a.addEventListener('click', (e) => { e.preventDefault(); show(href); });
      } else if (/^https?:/.test(href)) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
    });

    // Codeblöcke: "Im Editor ausprobieren"
    body.querySelectorAll('pre > code').forEach((code) => {
      const source = runnableSource(code.textContent);
      if (!source) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'try';
      btn.textContent = '▶ Im Editor ausprobieren';
      btn.addEventListener('click', () => tryInEditor(source));
      code.parentElement.classList.add('runnable');
      code.parentElement.append(btn);
    });

    // Kurze Beispiele in Tabellen (z. B. Spieltechniken) anklickbar machen
    body.querySelectorAll('td code').forEach((code) => {
      if (!/\d/.test(code.textContent)) return;
      const source = runnableSource(code.textContent);
      if (!source) return;
      code.classList.add('try-inline');
      code.tabIndex = 0;
      code.title = 'Klicken: im Editor ausprobieren';
      code.setAttribute('role', 'button');
      code.addEventListener('click', () => tryInEditor(source));
      code.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tryInEditor(source); }
      });
    });
  }

  /** Liefert vollständigen alphaTex-Text, wenn das Beispiel gültig ist und Noten enthält, sonst null. */
  function runnableSource(snippet) {
    const text = snippet.trim();
    if (!text) return null;
    const hasTrack = /\\track\b/.test(text) || /^\s*\.\s*$/m.test(text);
    const source = hasTrack ? text : GUITAR_HEADER + '  ' + text.replace(/\n/g, '\n  ');
    const oldLevel = alphaTab.Logger.logLevel;
    alphaTab.Logger.logLevel = alphaTab.LogLevel.None;   // Prüfung ohne Meldungen in der Konsole
    try {
      const score = alphaTab.importer.ScoreLoader.loadAlphaTex(source);
      const hasNotes = score.tracks.some((t) => t.staves.some((s) => s.bars.some(
        (b) => b.voices.some((v) => v.beats.some((bt) => bt.notes.length > 0)))));
      return hasNotes ? source + '\n' : null;
    } catch {
      return null;
    } finally {
      alphaTab.Logger.logLevel = oldLevel;
    }
  }

  function tryInEditor(source) {
    close();
    window.bandApp.tryTex(source);
  }

  window.bandHelp = { open };
})();
