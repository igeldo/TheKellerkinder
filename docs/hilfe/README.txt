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

**Klänge:** Die App startet mit den kleinen Standardklängen (1,4 MB). Bessere Klänge für E-Gitarren, Akustikgitarren,
Bass und Schlagzeug lädt der Knopf **Band-Klänge laden (6,9 MB)** unten in der Wiedergabeleiste – einmalig, danach
liegen sie auf dem Gerät und funktionieren auch offline. Ein zweiter Klick schaltet zurück und gibt den Speicher
wieder frei. Die Wahl merkt sich die App. Varianten wie Chorus, Funk, Wah oder 12-saitig erklingen **nur** mit
den Band-Klängen – zum Anhören den Song **klang-demo.atex** wählen.

**Kein Ton?** Auf dem iPad den **Stumm-Modus** im Kontrollzentrum ausschalten – er schaltet auch den Ton
von Web-Apps ab. Die Wiedergabe startet immer erst nach einem Tipp auf **Abspielen**.

**Hängt die App nach einem Update?** Die Seite zweimal neu laden. Hilft das nicht, die gespeicherten Daten der
Seite löschen (danach sind auch eigene Songs auf diesem Gerät weg – vorher ggf. über „Meine Songs“ exportieren):
- **Mac, Safari:** *Safari → Einstellungen → Datenschutz → Websitedaten verwalten …* → `igeldo.github.io` → *Entfernen*
- **iPad/iPhone:** *Einstellungen → Apps → Safari → Erweitert → Websitedaten* → `igeldo.github.io` nach links wischen → *Löschen*;
  eine auf dem Home-Bildschirm abgelegte App einmal entfernen und neu hinzufügen
- **Chrome/Edge:** Schloss-Symbol links neben der Adresse → *Website-Einstellungen* → *Daten löschen*

## Bedienung

| Bereich | Funktion |
|---|---|
| Song | Auswahl in zwei Gruppen: **Band-Songs** (von GitHub) und **Auf diesem Gerät** (lokal, bzw. „lokal geändert“) |
| Öffnen … | Datei vom Gerät holen (`.gp`, `.atex`, MusicXML, ZIP) – kommt in den Speicher dieses Browsers |
| Herunterladen ▾ | aktuellen Song als `.gp` oder `.atex` in den **Download-Ordner** des Browsers |
| Meine Songs | lokale Songs öffnen, herunterladen, löschen, **für GitHub exportieren** und **importieren** |
| Spuren | anzeigen/ausblenden, **M** = stumm (zum Mitspielen), **S** = solo, **🔊** = Lautstärke (Knopf antippen, Regler klappt auf; Zahl erscheint, wenn nicht 100 %) |
| Wiedergabe | **Tempo** 25–150 % (Knopf antippen, Regler klappt auf), Metronom, Einzähler, **Schleife** über einen markierten Bereich |
| Bereich markieren | mit der Maus über die Takte ziehen; **iPad/Touch:** erst **Bereich wählen** antippen, dann mit dem Finger über die Takte ziehen – oder ersten und letzten Takt nacheinander antippen. Danach scrollt der Finger wieder normal. |
| Zoom | Knopf **Zoom** unten: Noten **und** Bedienleisten 50–150 % (iPad startet mit 80 %, am Rechner 100 %); die Einstellung bleibt gespeichert. Die Kopfzeile bleibt einzeilig: wird es eng, werden die Knöpfe kürzer („Hilfe“, „Editor“); notfalls lässt sie sich seitlich wischen. |
| Ansicht & Drucken | wie im Song, nur Tabulatur, Noten + Tabulatur, nur Noten; Drucken bzw. „Als PDF sichern“ |
| alphaTex-Editor | Songs als Text schreiben, mit Live-Vorschau und Fehlermeldungen; **In Songliste speichern** legt den Text im Speicher dieses Browsers ab |
| Syntax-Hilfe | Einführung in alphaTex, Beispiele per Klick ausprobieren |

## Wo liegen meine Songs?

- **Band-Songs** kommen aus dem Ordner `docs/songs` auf GitHub und sind für alle gleich.
- **Eigene und importierte Songs** liegen nur im Browser **dieses Geräts**. In der Songauswahl stehen sie
  unter **Auf diesem Gerät** („lokal“; „lokal geändert“, wenn ein Band-Song überschrieben wurde).
  Sie wandern nicht zu anderen Bandmitgliedern und gehen verloren, wenn man die Website-Daten löscht.

## Wohin wird gespeichert?

| Aktion | Ziel |
|---|---|
| **In Songliste speichern** (Editor) | Speicher **dieses Browsers** auf diesem Gerät – zu sehen unter „Meine Songs“ und in der Songauswahl unter „Auf diesem Gerät“ |
| **Herunterladen ▾** `.gp` / `.atex` | **Download-Ordner** des Browsers (iPad: *Dateien → Downloads*, Mac/PC: meist „Downloads“). Die Songliste bleibt unverändert. |
| **Öffnen …** | holt eine Datei vom Gerät und legt sie im Speicher dieses Browsers ab |
| **Löschen** (neben der Songauswahl, oder in „Meine Songs“) | entfernt einen eigenen Song aus dem Speicher dieses Browsers (nicht rückgängig zu machen – vorher ggf. herunterladen). Band-Songs von GitHub lassen sich hier nicht löschen. |
| **Für GitHub exportieren** (Meine Songs) | ZIP-Datei im **Download-Ordner**; ihr Inhalt gehört nach `docs/songs` auf GitHub |

Nach jeder Aktion erscheint unten rechts kurz eine Meldung mit dem tatsächlichen Ort.
Herunterladen und Öffnen sind Hin- und Rückweg: herunterladen, z. B. in Guitar Pro bearbeiten, mit **Öffnen …** zurückholen.

## Meine Songs: importieren, löschen, an die Band weitergeben

Der Knopf **Meine Songs** zeigt alle lokalen Songs. Dort kann man sie öffnen, herunterladen und löschen.

**Einen Song für die ganze Band bereitstellen**

1. In **Meine Songs** die gewünschten Songs anhaken und **Für GitHub exportieren** wählen.
   Es entsteht eine ZIP-Datei mit den Songs **und einer fertigen `songs.json`** (alte Einträge + neue Songs).
2. Die ZIP-Datei entpacken.
3. Auf GitHub den Ordner `docs/songs` öffnen, **Add file → Upload files**, den **Inhalt** der ZIP-Datei
   hineinziehen und **Commit changes** klicken. Die alte `songs.json` wird dabei ersetzt.
4. Nach etwa einer Minute steht der Song bei allen unter **Band-Songs**. Den lokalen Entwurf kann man
   danach in **Meine Songs** löschen.

**Songs auf ein anderes Gerät holen:** Mit **Öffnen …** (oder **Meine Songs → Importieren**) einzelne Dateien (`.gp`, `.atex`,
MusicXML) oder eine ganze ZIP-Datei wählen – zum Beispiel die exportierte ZIP eines Bandmitglieds.

Coversongs gehören nicht in ein öffentliches Repository.

## Laptop-Fassung

Wer lieber am Laptop mit eigenem Songs-Ordner arbeitet, nutzt die Java-Fassung
(`java -jar TheKellerkinder.jar`, siehe README.md im Repository).
