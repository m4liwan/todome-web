# ToDoMe

Aktiver Arbeitstag-Coach für Selbstständige, als Desktop-App für Windows. Sessions mit Start-Intention und Timebox, adaptives Nachhaken nach Aufgabentyp, Pause und Unterbrechung mit Kontext-Snapshot und Wiedereinstiegs-Briefing, Pausen-Coaching, Tagesabschluss mit Lücken-Assistent sowie Zeitbericht und CSV-Export.

## Installieren (Windows)

`ToDoMe-Setup-1.10.0.exe` doppelklicken (installiert sich als Update über eine ältere Version, Daten bleiben erhalten). Weil die Datei nicht signiert ist, warnt Windows beim ersten Start („Der Computer wurde durch Windows geschützt“): **Weitere Informationen → Trotzdem ausführen**. Danach liegt ToDoMe im Startmenü und auf dem Desktop.

- **Minimieren** schickt ToDoMe in den Infobereich neben der Uhr; Session, Nachfragen und Begleiter laufen weiter. Ein Klick auf das Symbol holt das Fenster zurück.
- **X** beendet ToDoMe (offene Daten werden vorher gespeichert).
- **Mit Windows starten:** in den Einstellungen unter „Desktop“ oder im Menü des Tray-Symbols.
- **Daten** liegen lokal unter `%APPDATA%\ToDoMe`. Sie bleiben bei Updates und bei einer Deinstallation erhalten. Backup und Wiederherstellung findest du in den Einstellungen unter „Daten“.
- **Update:** neue `ToDoMe-Setup-x.y.z.exe` einfach drüberinstallieren.

## Neu in 1.10 (finale MVP-Fixes)

- **Erster Start ohne Aufblitzen:** Bis das Kennenlernen abgeschlossen ist, bleibt der Startbildschirm vollständig verborgen, auch beim Übergang von „Lass uns ankommen“ ins Setup.
- **Arbeitszeit im Setup:** eigener Schritt (Arbeitsbeginn, Feierabend, Mittag) mit Vorschau des Tages; daran richtet sich die Zeitlinie aus.
- **Rundgang:** Begleiter gestochen scharf, das Licht liegt exakt auf dem jeweiligen Element (gleiche Kanten und Rundungen, keine Lücken).
- **Atemübung vor dem Start:** Häkchen „Atemübung vor dem Start durchführen“ (standardmäßig aus, wird gemerkt). Die Atemkarte hat „Überspringen“ und wieder ihr ruhiges Aussehen.
- **Fokuskarte:** saubere Ecken in allen Fokus-Stilen, alle Knöpfe gleich hoch, Stil-Menü schwebt über der Karte, Tunnel-Rahmen konzentrisch.
- **Sanfte Welle:** läuft an beiden Enden weich aus.
- **Kleinigkeiten:** „Durchatmen“-Punkt statisch wie die anderen, Schließen-X per Flexbox zentriert.
- **Aufgaben:** „Art der Arbeit“ mit „Sonstiges…“ und eigenem Namen; „Abrechenbar pro Aufgabe“ ist Pro (Free folgt der Kunden-Voreinstellung).
- **Atmosphären sichtbar:** Die Seitenfarbe liegt nur noch auf `<html>`, Licht, Raster und Wetter-Atmosphären sind wieder zu sehen. Bei „Animationen reduzieren“ laufen sie langsamer statt still.
- **Audio:** Start-Ton kürzer (rund 3 s) mit weichem Ausklang; Atmosphären-Lautstärke logarithmisch (0–100 %, 5 % ist kaum hörbar).
- **Overlay-Musik:** kein Flackern mehr (unveränderte Antworten lösen nichts aus, Play/Pause bleibt stabil, feste Breite).

## Neu in 1.9

- **Warme Ankunft:** Jeder Start, auch der allererste, beginnt mit „Bereit für einen ruhigen Tag?“ und dem Knopf „Lass uns ankommen“. Beim ersten Mal folgt danach das Kennenlernen, dann der Rundgang mit dem Begleiter.
- **Wie tickt dein Kopf am liebsten?** Neuer Schritt im Kennenlernen (und unter Einstellungen → Allgemein):
  - *Overload:* nur ein Schritt sichtbar („Danach“ eingeklappt), stumme Benachrichtigungen, höchstens eine Nachfrage pro Stunde, Kokon-Fokus.
  - *ADHS / sprunghafte Energie:* 15-Minuten-Blöcke, Bewegungspausen nach 30 Minuten, Mikro-Schritt-Modus.
  - *Aufschieben:* Sanft-Modus dauerhaft an, „80 % reichen“ am nächsten Schritt.
  - *Kreatives Chaos:* ruhiger Raum ohne Besuche während eines Blocks, Atmender Fokus.
- **Vier Fokus-Stile** (Einstellungen → Design, oder direkt in der laufenden Fokuskarte): Atmender Fokus, Schwebender Tunnel, Deep-Work-Kokon, Mikro-Schritt-Modus (Aufgabe automatisch in drei Häppchen, immer nur eins sichtbar). Ersetzt „Stiller Fokus“ (wird zum Schwebenden Tunnel übernommen).
- **Durchatmen:** Chip unter der Begrüßung und Knopf in der Fokuskarte. Alles verschwindet, nur der Begleiter atmet (4 s ein, 6 s aus), dazu ein leiser 432-Hz-Binauralton. Nach 60 Sekunden: „Geht es wieder?“.
- **Sanfte Interaktions-Klänge** (Einstellungen → Audio, ehemals „Medien“): warmes 432-Hz-Aufblühen bei „Lass uns ankommen“, „Feierabend“ und „Fokus wieder aufnehmen“, tiefer binauraler Ton (216/226 Hz) beim Start eines Blocks. Alles live per Web Audio erzeugt.
- **Wie hat sich das angefühlt?** Nach einem Block fragt der Begleiter: Flüssig, Zäh oder Egal, und antwortet warm.
- **Pro:** Anti-Hustle-Statistiken im Rückblick (geschützte Fokuszeit, längster ruhiger Block, geparkte Gedanken, Atempausen) und Workspace-Editor („Bearbeiten“ unten rechts: Karten greifen und verschieben, Größe S/M/L/XL, Zurücksetzen). Beides mit Schloss und im Vergleich „Was bringt Pro?“.

## Neu in 1.8

- **Rundgang mit deinem Begleiter:** Nach dem ersten Start (und einmal nach diesem Update) wandert dein Begleiter durch die App: Fokus-Karte, Energie-Check, Gedanken-Parkplatz, Feierabend. Danach öffnet er die Einstellungen, setzt sich auf die Reiter „Daten“ (Kunden anlegen), „Design“ und „Overlay“ und erklärt alles in einer Glas-Sprechblase. „Weiter“ (oder Pfeil rechts) führt zur nächsten Station, Esc oder „Überspringen“ beendet ihn. Erneut starten: Einstellungen → Allgemein → Hilfe & Feedback.
- **Stil der Zeitlinie** (Einstellungen → Design): „Sanfte Welle“ (Standard, fließt und atmet ruhig, transparente Füllung), „Minimaler Balken“ (statischer Glasbalken) oder „Perlenkette“ (die klassischen Punkte).

## Neu in 1.7 (finales MVP)

- **Ein Button-Look:** „Feierabend“ und „Fokus wieder aufnehmen“ sind exakt der Glas-Button „Ich bin angekommen“ (gleicher Verlauf, Rand-Glow, Blur, Hover).
- **Musiksteuerung:** auf dem Homescreen standardmäßig aus (Einstellungen → Medien), im Mini-Overlay an. Wird beim Update einmal so gesetzt, spätere eigene Wahl bleibt.
- **Atmosphären-Klang (neu):** leiser Regen, Wind unter Wolken, Schneestille und raschelndes Laub, live erzeugt (Web Audio, keine Dateien). Einstellungen → Design → „Klang der Atmosphäre“ mit Lautstärke. Startet sofort mit sanftem Einblenden, Wechsel blenden über.
- **Feinschliff:** Feedback-Sprechblase als Glas-Kugel 16 px in der Ecke der Begleiter-Karte, Schließen-Kreuz exakt auf der Achse der Überschrift (ohne Fokus-Ring beim Öffnen), „Standard“-Badge sauber in der Kartenecke.
- **Aufgeräumt:** Demo-Modus aus den Einstellungen entfernt (die Desktop-App läuft immer mit echten Daten), Reste von Mini-Timeline und Kompakt-Option aus Code und Speicher entfernt, doppelte CSS-Regeln gelöscht.
- **Pro:** gesperrte Begleiter und Farbwelten weichgezeichnet mit Schloss; „Kunden anlegen“ ist Pro (bestehende Kunden bleiben nutzbar); neues Vergleichs-Fenster „Was bringt Pro?“ (Free vs. Pro).

## Neu in 1.6 (MVP)

- **Neues Logo „ToDoMe.“:** schwarz im hellen, weiß im dunklen Modus, überall gleich (Kopfzeile, Willkommen, Kennenlernen, Fenstertitel).
- **Kopfzeile in Balance:** Logo links, „Heute / Rückblick“ exakt mittig, Nicht stören, Hell/Dunkel und Einstellungen in einer Glas-Pille, daneben „Feierabend“.
- **Zweite Schicht:** Nach dem Feierabend wird der Knopf zu „Fokus wieder aufnehmen“. Ein Klick öffnet den Tag wieder; erledigte Aufgaben, Zeiten und der Feierabend-Haken bleiben gezählt, und es kommt keine zweite Feierabend-Nachfrage.
- **Kein weißes Aufblitzen mehr:** `public/boot.js` und ein Inline-Stil in `index.html` setzen Theme und Farbwelt vor dem ersten Bild.
- **Einstellungen ohne Flackern:** feste Reiter (Allgemein, Begleiter, Design, Overlay, Medien, Daten), die Markierung gleitet GPU-beschleunigt. „Onboarding erneut testen“ ist entfernt.
- **Pro-Markierungen (Vorschau):** Companion Hub ist jetzt Standard. Mit Schloss und ruhiger „Bald in Pro“-Vorschau: Zeitbericht-Details und CSV-Export, Keimi und Mio, Neon Pulse und Matrix Frost sowie das Layout Flow & Focus. Wer vorher eine Pro-Auswahl hatte, landet beim nächsten freien Nachbarn (Neon Cyber, Companion Hub, Mochi).
- **Feedback:** kleine Sprechblase am Begleiter im Companion Hub und „Feedback geben“ in den Einstellungen, beide öffnen https://tally.so/r/X5LXYP im Browser.

Pro intern testen: In den Entwicklertools `localStorage.setItem('todome:pro-preview', '1')` ausführen und neu laden.

## Neu in 1.5

- **Ruhemodus hängt nicht mehr:** Leertaste öffnet und beendet ihn (mit kurzer Sperre gegen sofortiges Wiederöffnen), ein Mausklick weckt, Mausbewegung wird ignoriert. Alles mittig, 4 Looks inklusive wandernder Uhr.
- **Einstellungen:** feste Höhe, nur der Inhalt scrollt, Tabs werden nie abgeschnitten und flackern nicht mehr.
- **Layouts:** Flow & Focus füllt genau einen Bildschirm (kein Scrollen, Karte exakt mittig), Sanctuary ohne leere Flächen, Classic mit kompakter „Danach“-Karte, Avatar überall sauber im Glaskasten.
- **Feinschliff:** keine farbigen Linien mehr oben in Popups, sauberer Ring am Schließen-Knopf, organischer Hover beim Login, Login-Welle frei in der Mitte, echte Wolken, Musiksteuerung neben dem Logo (Navigation bleibt exakt mittig).
- **Gedanken-Parkplatz:** lange Gedanken laufen sanft als Lauftext durchs Feld.
- **Wohlfühl-Momente:** „Anderer Moment“ tauscht einen der drei freien Momente aus.
- **Winterzauber:** vom 1. bis 26. Dezember leiser Schnee, Lichterkette und adventlicher Gruß (Einstellungen → Layouts & Design: Aus / Dezember / Immer).
- **Stiller Fokus:** während eines Blocks bleibt nur der Block. Umschaltbar direkt in der Fokuskarte oder in den Einstellungen.
- **Nachmittags-Check:** zwischen 14:30 und 16:30 fragt dein Begleiter einmal, ob der Rest des Tages sanfter werden darf.
- **Overlay aufgeräumt:** ohne Mini-Timeline und Kompakt-Option, Deckkraft-Regler ohne Flackern.

## Neu in 1.4

- **Einstellungen mit Reitern:** Allgemein, Begleiter, Layouts & Design, Overlay, Musik & Medien, Kunden & Daten. „Anpassen“ in der Wasserkarte springt direkt zum Begleiter.
- **Mediensteuerung** (Desktop): Zurück, Play/Pause, Weiter für das, was unter Windows spielt (Spotify, Browser …), oben in der Leiste und optional im Overlay.
- **Overlay-Baukasten:** Begleiter, Fokus-Anker, Fortschrittsring, Mini-Timeline und Musik einzeln an- und abwählbar; das Fenster passt sich immer dem Inhalt an.
- **Gedanken-Killer:** Gedanken parken oder loslassen; losgelassene lösen sich in Partikel auf.
- **Willkommen:** ruhige Biolumineszenz-Welle statt Ringen, Glas-Button mit sanftem Glow.
- **Ruhemodus:** mittig, 4 Layouts (Ruhig, Große Uhr, Wandernde Uhr, Atmen), Aufwachen nur per Klick.
- **Farbwelten:** Neon Pulse und Matrix Frost ersetzen Solaris und Deep Moss; Scrollleisten folgen der Farbwelt.
- **Fixes:** Kreuz in den Einstellungen funktioniert, kein heller Blitz beim Start, Hauptkarte ohne Eckartefakte, Avatar mittig im Glaskasten, Hauptkarte und „Danach“ im Classic-Layout ohne Scrollen sichtbar, weiche Abdunklung inaktiver Karten.

## Neu in 1.3

- **4 Layouts** (Einstellungen → Darstellung): Classic, Flow & Focus (Slider), Immersive Sanctuary, Companion Hub.
- **Startseite erweitert:** Gedanken-Parkplatz, Tagesgedanke, Wochen-Teaser, kleine Wohlfühl-Momente mit ruhigem Timer.
- **Onboarding** mit deinem Begleiter (Name, Energie, ein Schritt, Overlay); in den Einstellungen unter „Zum Testen“ erneut startbar.
- **Mentaler Login und Ruhemodus** jederzeit per Klick; der Willkommensbildschirm bleibt offen, bis du ihn schließt.
- **Energie-Wording** auch in Aufgaben-, Pausen- und Abschluss-Dialogen.
- **Rückblick** mit Selbstmitgefühl, Pausen-Index und Energieverlauf; **Wetter-Popup** mit Ort und Atmosphäre.
- **3 neue Farbwelten:** Neon Cyber, Solaris, Deep Moss.
- **Fixes:** eigene Titelleiste, die mit dem Design die Farbe wechselt; kein heller Blitz beim Start; ruhige Dialoge und Navigation; Mini-Overlay passt sich seinem Inhalt an, Klick holt ToDoMe aus dem Infobereich; winzige Zeitblöcke als Punkte; Avatare mittig; Requisiten verdecken nie das Gesicht.

## Neu in 1.2

- **Psychologie im Kern:** Energie-Check (1–10) pro Tag stellt Timeboxen, Puffer und Tonalität ein (Sanft-Modus, Ausgewogen, Volle Kraft). Startseite zeigt nur noch den *einen* nächsten Schritt, der Rest wartet eingeklappt. Sanfter Start („Kurz ankommen“ → „Sammeln“ mit Atmung) statt kaltem Stoppuhr-Start. Wording ohne Druck („Wartet geduldig auf dich“, „Länger als geplant, ganz okay“, „80 % reichen“).
- **Design:** neuer Willkommensbildschirm (ruhiges Instrument in der Mitte), Liquid Glass mit Licht unter dem Mauszeiger, feines Raster, 5 Farbwelten, Atmosphäre (Regen, Wolken, Schnee, Herbstlaub oder „Wie draußen“), weicher kreisförmiger Hell/Dunkel-Wechsel.
- **Fixes:** Kopfzeile als durchgehendes Glasband ohne Kanten, Begleiter-Popup nie mehr abgeschnitten und immer auf dem Hauptmonitor, eigene Glas-Dropdowns statt Windows-Auswahllisten, einheitliche Scrollbars und Fokusringe.
- **Lebendiger Begleiter:** 8 Avatare (neu: Kumo, Pingo, Keimi, Mio), die passend zur Energie mitarbeiten (Tee, Lesen, Schreiben, Laufband, Gewichte).
- **Mini-Overlay:** verschiebbare Glasbox (z. B. für den zweiten Monitor) mit Begleiter, Fokus-Anker und ruhigem Fortschrittsring. Deckkraft, Leuchten, Kompakt und Größe einstellbar; auch über das Tray-Menü.
- **Ruhemodus** nach 15 Minuten ohne Eingabe auf der Startseite, **Wasser** in Litern mit Glas-Animation, **Rückblick** auf die Woche als Anerkennung, **Feierabend** als eigener ruhiger Bildschirm mit „Worauf bist du stolz?“ und dem ersten Schritt für morgen.

## Neu in 1.1

- **Komplett neues Design:** helles Glass-Design mit lebendigen Farbfeldern, umschaltbar auf Dunkel (oder „Wie System“) über das Mond-Symbol oben rechts.
- **Willkommensscreen** beim Start mit persönlicher Begrüßung und kurzem Tages-Briefing; **Ersteinrichtung** (Name, Begleiter, Arbeitszeit, Ort).
- **Begleiter-Avatare** (Mochi, Tropf, Nova, Bit): erscheinen in einem eigenen, transparenten Fenster am Bildschirmrand. Sie schauen während einer Session vorbei (Intervall frei wählbar, bei wichtigen Aufgaben × 0,6, bei niedriger Priorität × 1,6), erinnern ans Trinken (mit Wasserzähler), gratulieren nach erledigten Aufgaben und stellen die Nachfragen, wenn ToDoMe nicht im Vordergrund ist. Nie während „Nicht stören“.
- **Wetter** (Open-Meteo, ohne Konto): aktuell, nächste Stunden und ein Hinweis für den Abend nach Feierabend (Jacke, Schirm oder Spaziergang).
- **Lebendige Zeitleiste** mit Viertelstunden-Ticks, schimmerndem Live-Segment, geplanten Starts und mitwanderndem Jetzt-Marker.
- **Priorität** pro Aufgabe (Wichtig, Normal, Niedrig), **Wochenansicht** unter „Zeiten“.

## Entwickeln

Voraussetzung: Node.js 20 oder neuer (empfohlen 22, siehe `.nvmrc`). Alle Befehle im Projektordner (dort, wo `package.json` liegt).

```bash
npm install          # einmalig
npm run dev          # Desktop-App (Electron) mit Hot Reload, DevTools öffnen sich mit
npm run dist         # baut den Windows-Installer nach release/ToDoMe-Setup-<version>.exe
```

| Skript | Zweck |
| --- | --- |
| `npm run dev` | Electron + Vite-Dev-Server mit Hot Reload. DevTools öffnen sich in einem eigenen Fenster, F12 oder Strg+Umschalt+I schaltet sie um. `TODOME_DEVTOOLS=0` startet ohne. |
| `npm run app:dev` | wie `npm run dev` (alter Name) |
| `npm run dev:web` | Nur im Browser unter http://localhost:5173 (`?mode=demo` für Beispieldaten) |
| `npm run app` | Produktions-Build lokal in Electron starten, ohne Installer |
| `npm run dist` | Windows-Installer (NSIS, x64) |
| `npm test` | alle Tests (Vitest), Testdateien in `src/tests/` |
| `npm run typecheck` / `npm run lint` | TypeScript strict, ESLint |

### Nutzungsdaten (PostHog) lokal prüfen

- Opt-in: `settings.telemetryEnabled` im gespeicherten Zustand (localStorage, Schlüssel `todome:live:state:v1`), standardmäßig `false`. Umschalten im Onboarding oder unter Einstellungen → Über → Datenschutz.
- Code: `src/services/telemetry.ts` (Key und Host `https://eu.i.posthog.com` stehen dort). Ohne Opt-in wird PostHog nicht einmal geladen.
- Mit `npm run dev` erscheinen in den DevTools Zeilen mit `[PostHog]` für jeden `initTelemetry()`- und `trackEvent()`-Aufruf. Im installierten Build schaltet man sie mit `localStorage.setItem('todome:telemetry-debug', '1')` ein.

Version erhöhen: `version` in `package.json` anpassen, dann `npm run dist`.

## Architektur

```
electron/
  main.cjs         Hauptprozess: Fenster, Tray, app://-Protokoll mit CSP, IPC, Autostart, Energie-Ereignisse
  preload.cjs      Sandboxed Bridge `window.todome` (nur geprüfte IPC-Aufrufe, kein Node im Renderer)
  assets/          Fenster-, Tray- und Badge-Icons
src/
  domain/          reine Logik ohne Framework, komplett getestet
    session.ts       Event-Sourcing: Netto = Laufzeit − Pausen − Unterbrechungen − gebuchter Leerlauf − Korrekturen
    taskTypes.ts     Nachfass-Profile je Aufgabentyp
    checkinEngine.ts Taktlogik, Ruhezeiten, Stunden-Limit, Ablauf ignorierter Nachfragen
    coach.ts         Fokus-Budget, Tageslimit, Tagesabschluss
    companion.ts     Begleiter: Besuchsplanung nach Priorität, Trinkerinnerung, Texte
    weather.ts       Wetter abrufen, auswerten, Abend-Hinweis
    reentry.ts       Kontext-Snapshot und Wiedereinstiegs-Briefing
    reports.ts       Zeiteinträge, Rundung pro Kunde, CSV, Schätzfaktor, Lücken
    copy.ts          Texte in drei Tonalitäten
  state/           Reducer, validierte Commands, Scheduler-Tick, Antwort-Logik, Store mit Persistenz
  app/             React-Kontext, Hooks (Takt, Scheduler, Leerlauf, Ruhezustand), Dialog-Steuerung
  components/      UI
  lib/desktop.ts   Typen der Desktop-Bridge; im Browser ist sie `null` und alles läuft ohne
```

**Grundregeln**

- Zeit wird nie gezählt, sondern aus einem append-only Event-Log berechnet. Korrekturen sind eigene Events, das Original bleibt nachvollziehbar.
- Commands sind pure Funktionen `(state, {now, newId}, input) → Actions | Fehler` und prüfen Invarianten (eine aktive Session, max. drei Unterbrechungen, keine Korrektur größer als die Netto-Zeit …).
- Der Nachfass-Takt ist deterministisch und läuft offline. Ein LLM gehört später in Sprache (Zerlegung, Briefings, Rückblicke), nie ins Timing.

## Desktop-Funktionen

| Funktion | Umsetzung |
| --- | --- |
| Läuft im Hintergrund | Minimieren versteckt das Fenster im Infobereich; Timer werden nicht gedrosselt. X beendet die App |
| Begleiter | Transparentes, nicht fokusraubendes Fenster am Bildschirmrand; klickt nur, wo die Sprechblase ist |
| Design | Hell, Dunkel oder System; Titelleiste und Fensterhintergrund folgen |
| Benachrichtigungen | Windows-Toasts für Nachfragen, Klick holt das Fenster nach vorn |
| Aufmerksamkeit | Tray-Symbol mit Punkt, Overlay in der Taskleiste und Blinken, solange eine Nachfrage offen ist |
| Leerlauf | Systemweite Inaktivität und Bildschirmsperre (ab 10 min) lösen die Frage „Noch dran oder kurz weg?“ aus |
| Ruhezustand | Wacht der PC auf, wird eine laufende Session rückwirkend zum Einschlafzeitpunkt pausiert |
| Autostart | Startet unsichtbar im Infobereich (`--hidden`) |
| Fenster | Größe und Position werden gemerkt; nur eine Instanz läuft gleichzeitig |

**Sicherheit:** `contextIsolation`, `sandbox`, kein `nodeIntegration`. Die Oberfläche wird über ein eigenes `app://`-Protokoll mit strikter Content-Security-Policy und Schutz gegen Pfad-Ausbrüche ausgeliefert. Externe Links öffnen im Standardbrowser, Navigation und neue Fenster sind gesperrt, und von allen Browser-Berechtigungen sind nur Benachrichtigungen erlaubt. Schriften sind lokal eingebunden. Einzige externe Verbindung ist das Wetter (nur Koordinaten an Open-Meteo, per CSP auf diese Hosts beschränkt).

## Nachfass-Logik

| Typ | Ruhe | Pulse | Meilenstein | Überzug ab | Kanal |
| --- | --- | --- | --- | --- | --- |
| Deep Work | 45 min | alle 40 min | 80 % | +20 % (min. 5 min) | Haptik |
| Kommunikation | – | – | 80 % | +10 % (min. 3) | Push |
| Admin | – | – | – | +5 min | Push |
| Akquise | – | Anstoß nach 3 min | 50 % | +15 % (min. 3) | Push |
| Lernen | 25 min | alle 25 min | – | +25 % (min. 5) | still |
| Exploration | gesamt | – | – | nie | still |

- Fälligkeiten werden in Netto-Zeit geplant: Pausen verschieben alle Nachfragen automatisch.
- Pro Session ist nur eine Nachfrage offen. Unbeantwortet nach `promptExpiryMin` gilt sie als ignoriert; danach kommt in dieser Phase nur noch die Überzugsfrage.
- Nach zwei ignorierten Nachfragen in Folge wird das Intervall × 1,5 länger und der Kanal eine Stufe leiser.
- Höchstens `maxPromptsPerHour` (Standard 3); Überzug, Pausenende, Leerlauf und Tagesabschluss sind ausgenommen.
- Mittag und „Nicht stören“ unterdrücken alles; nach Feierabend kommen nur Nachfragen zu bewusst gestarteten Sessions.
- Überzug unter 30 %: „+10 / +25 / Abschließen / Rest morgen“. Ab 30 %: Ursache erfragen (größer als gedacht, hänge fest, unterbrochen, Perfektionismus) und passend weiterführen.
