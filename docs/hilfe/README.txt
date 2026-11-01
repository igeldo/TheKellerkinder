# TheKellerkinder – Anleitung für die Web-Fassung

Diese Fassung läuft im Browser, ohne Java und ohne Installation – auf dem iPad, auf Android-Tablets
und am Laptop. Sie liegt auf GitHub Pages; die Adresse hat die Form
`https://<benutzername>.github.io/<repository>/`.

## Auf dem iPad als App ablegen

1. Die Adresse in **Safari** öffnen.
2. Auf **Teilen** (Quadrat mit Pfeil) tippen und **Zum Home-Bildschirm** wählen.
3. TheKellerkinder erscheint mit eigenem Symbol und startet im Vollbild.

Nach dem ersten Öffnen funktioniert die App **auch ohne Internet**, z. B. im Proberaum.
Voraussetzung: iPadOS 13.4 oder neuer (ältere iPads können die Noten nur als PDF anzeigen).

**Kein Ton?** Auf dem iPad den **Stumm-Modus** im Kontrollzentrum ausschalten – er schaltet auch den Ton
von Web-Apps ab. Die Wiedergabe startet immer erst nach einem Tipp auf **Abspielen**.

## Bedienung

| Bereich | Funktion |
|---|---|
| Song | Beispielsongs und eigene Songs auswählen |
| Importieren | Guitar-Pro-, alphaTex- oder MusicXML-Dateien aus der Dateien-App, AirDrop oder Downloads holen |
| Spuren | anzeigen/ausblenden, **M** = stumm (zum Mitspielen), **S** = solo, Lautstärke |
| Wiedergabe | Tempo 25–150 %, Metronom, Einzähler, Schleife über einen markierten Bereich |
| Ansicht & Drucken | wie im Song, nur Tabulatur, Noten + Tabulatur, nur Noten; Drucken bzw. „Als PDF sichern“ |
| alphaTex-Editor | Songs als Text schreiben, mit Live-Vorschau und Fehlermeldungen |
| Speichern (.atex) | speichert den Text **auf diesem Gerät** |
| Export (.gp) | lädt eine Guitar-Pro-Datei herunter, z. B. zum Weitergeben an die Band |
| Syntax-Hilfe | Einführung in alphaTex, Beispiele per Klick ausprobieren |

## Wo liegen meine Songs?

- **Beispielsongs** kommen aus dem Ordner `songs/` auf GitHub und sind für alle gleich.
- **Eigene und importierte Songs** liegen nur im Browser **dieses Geräts**. Sie wandern nicht zu
  anderen Bandmitgliedern und gehen verloren, wenn man die Website-Daten im Browser löscht.

**Einen Song für die ganze Band bereitstellen:** Im Editor **Export (.gp)** wählen, die Datei auf GitHub
in den Ordner `docs/songs` hochladen und ihren Namen in `docs/songs/songs.json` eintragen.
Coversongs gehören nicht in ein öffentliches Repository.

## Laptop-Fassung

Wer lieber am Laptop mit eigenem Songs-Ordner arbeitet, nutzt die Java-Fassung
(`java -jar TheKellerkinder.jar`, siehe README.md im Repository).
