# Fokus-Cockpit: Schritt 2 des Redesigns

Status: freigegeben (Rocco, 2026-11-15). Variante A von Rocco gewählt (2026-11-15);
damit ist die frühere Regel „Layouts bleiben unangetastet“ für Home aufgehoben. Branch `feat/oled-redesign`, baut auf
dem unkommittierten Wireframe aus Schritt 1 auf.

## Warum

Schritt 1 hat die UI auf ein rohes Wireframe auf `#050505` entkernt. Jetzt bekommt
ToDoMe seine neue Gestalt: ein ruhiges, dominantes, edles Fokus-Cockpit. Vorbild sind
Roccos Referenzen (Dashboards im Stil Linear/Vercel, Icon-Leisten, Haarlinien,
Mono-Labels, weiche Farbschleier). Gefühl: Stille und Autorität. Wenige, große Dinge
tragen die Seite, alles andere tritt zurück. Das passt zur Mission (Produktivität ohne
Druck): Ein ruhiger Bildschirm ist selbst schon Entlastung.

## Ziele

1. **Ein einziges Home-Cockpit** ersetzt die vier Layouts (classic, sanctuary, hub,
   flow) und den Pro-Workspace-Editor (Rocco: Variante A).
2. **Navigation als Icon-Leiste links** statt Text-Tabs oben.
3. Ästhetik (Roccos Gesetz):
   - Hintergrund überall `#050505`.
   - Keine gefüllten Boxen, Cards oder Panels. Module liegen flach im Raum.
   - Trennung nur über Haarlinien `1px solid rgba(255,255,255,0.05)` und großen,
     geordneten Negativraum.
   - Greifbare Bedienelemente haben 6px Radius.
   - Harter Typo-Kontrast: wuchtige Primärtexte, leise Sekundärinfos.
4. **Subtile, ruhige Bewegung** als eigenes System (Tokens, wenige Muster).
5. Alle Ansichten, Dialoge und Schichten sprechen dieselbe Sprache.
6. Keine Altlasten: Was mit den Layouts stirbt, wird restlos entfernt (Code, CSS,
   Typen, Tests, Settings-UI, Pro-Einträge). Gespeicherte Daten werden sauber migriert.
7. `npm run typecheck`, `npm run lint` (`eslint .`) und `npm test` laufen grün.

## Nicht-Ziele / Anti-Ziele

- Keine Änderung an States, Reducern, Hooks, IPC, Domain-Logik. Die einzigen
  Datenänderungen sind das Entfernen von `appearance.layout` und `settings.workspace`
  (Migration).
- Kein Hell-Modus (entschieden in Runde 1).
- Keine neuen Features. Jedes heutige Modul bleibt erreichbar und benutzbar.
- Anti-Ziel: „Dashboard-Lärm“. Keine Kachelwand, keine bunten Akzente überall, keine
  verspielten Animationen (Bounce, Overshoot, Scale über 1.02).
- Anti-Ziel: Licht, das grell wird. Der Ambient-Schleier bleibt auch bei 100 % ein
  Schein.
- Begleiter-Prinzip bleibt: nichts im Design beschämt Inaktivität.

## Ansätze (besprochen)

- **A: ein Cockpit (gewählt).** Ein festes, sorgfältig komponiertes Home. Layout-Wahl,
  Flow-Slider und Workspace-Editor fallen weg. Ergibt die sauberste Codebasis und eine
  klare visuelle Hierarchie. Preis: keine Layout-Wahl mehr, das „bald in Pro“-Feature
  Workspace-Editor entfällt (verkauft wurde es nie).
- B: vier Layouts neu gestaltet. Wahl bleibt, aber etwa vierfache Arbeit und viel Code.
- C: Cockpit plus Pro-Editor zum Ein-/Ausblenden. Hält Editor-Code und Zustände am
  Leben, widerspricht „keine Altlasten“.

## Gestaltungssystem

### Tokens (`base/tokens.css`)

- Flächen: `--bg #050505`. Schwebende Schichten (Dialog, Menüs, Toasts, Select,
  Bubble) bekommen `--bg-raised #0b0b0c`, eine Haarlinie `rgba(255,255,255,0.08)` und
  einen tiefen weichen Schatten. Das ist die einzige erlaubte „Fläche“, weil sie über
  Inhalt schwebt (Referenz: Profilmenü).
- Linien: `--line rgba(255,255,255,0.05)` (Struktur), `--line-strong 0.10` (Hover,
  Feldkante, schwebende Schichten).
- Text: `--ink #f5f5f6` (primär), `--ink-2 #a1a1aa` (sekundär), `--ink-3 #63636b`
  (Labels, Metadaten).
- Akzent: die Ambient-Lichtfarbe (`--accent`, vorhandene Paletten). Sie kommt nur an
  wenigen Stellen vor: laufender Block, Fortschritt, „jetzt“-Marke, positive Werte,
  Ambient-Schleier, Fokusring. Sonst gibt es nur Weiß- und Grautöne (Referenz: Bilder
  1, 6).
- Radius: `--radius` = 6px bei „Präzise“ (Standard), 0 bei „Kantig“, 10px bei „Weich“.
  Die Einstellung bleibt funktional. Runde Dinge (Avatar, Status-Punkte, Level-Badge)
  bleiben rund.
- Abstand: eine 4px-Skala (`--s1` 4 … `--s10` 96). Zwischen Modulen großzügig (≥ 48px).
- Typo:
  - **Geist Sans** (UI, Headlines) und **Geist Mono** (Zahlen, Zeiten, Labels, Kürzel),
    gebündelt über `@fontsource-variable/geist` und `…/geist-mono`, also offline.
  - Manrope und Urbanist fliegen raus (Abhängigkeiten entfernen).
  - Skala: Display 64/56px (Aufgabe im Fokus), Timer 88px Mono tabular, H1 32px,
    H2 20px, Body 15px, Meta 13px, Label 11px Mono uppercase mit 0.08em Laufweite.
    Headlines mit negativer Laufweite (−0.03em).

### Bewegung (`base/animations.css`, Tokens in `tokens.css`)

- Kurve: `--ease cubic-bezier(0.22, 1, 0.36, 1)`. Dauern: `--t-fast 140ms` (Hover,
  Farbe), `--t-base 240ms` (Zustände), `--t-slow 480ms` (Ansichtswechsel, Eintritt).
- Muster, und nur diese:
  1. **Eintritt**: Ansichten und Module blenden ein (opacity 0→1, translateY 6px→0),
     gestaffelt in 40ms-Schritten, höchstens 6 Stufen.
  2. **Zustand**: Farbe, Opacity und Linienfarbe weich überblenden. Keine
     Größenänderung bei Hover.
  3. **Indikator**: Die aktive Markierung in der Leiste gleitet per `transform`.
  4. **Leben**: Der Ambient-Schleier atmet sehr langsam (≥ 20s Zyklus), der laufende
     Punkt pulsiert leise.
  5. Schwebende Schichten: Dialoge erscheinen mit Fade und 8px Hub, Menüs mit Fade und
     4px Hub (bestehende `sheet-out` und `onboard-out` bleiben, weil Logik an
     `animationend` hängt).
- `prefers-reduced-motion`, der Calm-Modus (`is-fx-calm`) und Fokus stellen alles auf
  sofort oder statisch.
- Nur `transform` und `opacity` werden animiert. Keyframes stehen ausschließlich in
  `base/animations.css` (bestehende Testregel).

### Interaktion

- Buttons:
  - Primär: weiß gefüllt, schwarze Schrift, 6px.
  - Sekundär: Haarlinie `--line-strong`, Text `--ink`, 6px.
  - Ruhig: nur Text, Hover zeigt eine Fläche `rgba(255,255,255,0.04)` mit 6px.
- Die Wireframe-Regel „Buttons als unterstrichene Wörter“ wird ersetzt.
- Felder: Haarlinie unten im Ruhezustand. Bei Fokus wird die Linie `--ink-2`, dazu ein
  Akzent-Ring nur bei Tastatur (`:focus-visible`).
- Aktiver Zustand (Nav, Segmente, Auswahl): weiße Schrift plus Indikator (Linie oder
  `rgba(255,255,255,0.06)` mit 6px). Keine Akzentfarbe für reine Auswahl.
- Tooltips an Icon-Buttons (Leiste) als kleine schwebende Schicht rechts daneben.

## Struktur

### Shell

```
┌────┬──────────────────────────────────────────────────────────────┐
│ ▣  │ HEUTE · Samstag, 15. Nov          ♪ Medien  [ Feierabend ]  ─□×│  ← 48px Kopfzeile
│────│──────────────────────────────────────────────────────────────│     (Drag-Region)
│ ◉  │                                                              │
│ ◔  │                     Inhalt der Ansicht                        │
│ ☺  │                                                              │
│    │                                                              │
│ ⌁  │                                                              │
│ ◐  │                                                              │
│ ⚙  │                                                              │
└────┴──────────────────────────────────────────────────────────────┘
 64px Leiste
```

- **Leiste** (`Rail.tsx`, ersetzt den Nav-Teil von `Topbar.tsx`), 64px, rechts eine
  Haarlinie.
  - Oben das Logo-Zeichen.
  - Dann Heute, Rückblick und Begleiter (mit Level-Punkt). Feierabend ist keine
    Station der Leiste: Er bleibt der Haupt-CTA in der Kopfzeile (wie heute).
  - Unten: Stumm (DND), Licht an/aus (Ambient), Einstellungen.
  - Aktive Station: Icon weiß, links ein 2px-Indikator, der gleitet.
- **Kopfzeile** (`Topbar.tsx`, verschlankt), 48px, unten eine Haarlinie. Sie bleibt
  Fenster-Drag-Region und reserviert `--wco` für die Fensterknöpfe.
  - Links: Mono-Label der Ansicht und das Datum.
  - Rechts: Mediensteuerung (falls aktiv), Demo-Tag und der Haupt-CTA mit
    unveränderter Logik: `labels.dayEnd` (öffnet Feierabend), nach dem Tagesabschluss
    „Fokus wieder aufnehmen“ (`onResume`). Die Klasse `topbar__main` bleibt, weil die
    Tour darauf zeigt. Gestartet wird weiter auf der Bühne (`OneThing`).
- **Ambient-Schleier**: ein großer, stark weichgezeichneter Farbverlauf in der
  Lichtfarbe hinter der oberen Bildschirmhälfte (Referenzen 13, 14). Opacity folgt
  `--ambient` und bleibt maximal etwa 0.18. Er sitzt fixiert hinter allem und fängt
  keine Klicks.

### Heute: das Cockpit (`home/Cockpit.tsx` in `App.tsx` eingesetzt)

Ein Raster mit 12 Spalten, max. 1440px breit, zentriert. Module sind flach. Jedes hat
ein Mono-Label (z. B. `DANACH`) und optional eine Meta-Zahl rechts (Referenz 1).

```
┌──────────────────────────────────────────────┬────────────────────────┐
│ Guten Morgen, Rocco.            ● Energie     │ BEGLEITER              │
│ ┌ ─                                    ─ ┐    │   (Figur, eine Zeile)  │
│   JETZT                                       │────────────────────────│
│   Angebot Müller fertigstellen   (64px)       │ DANACH            3    │
│   00:42:17                       (88px Mono)  │  Rechnung prüfen   25m │
│   ───────────────●──────────  Fortschritt     │  Mail Kunde        10m │
│   [ Pause ] [ Fertig ]  Feststecken?          │  …                     │
│ └ ─                                    ─ ┘    │                        │
├──────────────────────────────────────────────┴────────────────────────┤
│ DEIN TAG                                              08:00 → 17:00   │
│ ══════════════ Timeline über volle Breite ═══════════════════════════ │
├─────────────────┬─────────────────┬─────────────────┬─────────────────┤
│ WASSER          │ WETTER          │ ZEITEN HEUTE    │ DEINE WOCHE     │
├─────────────────┴──────┬──────────┴─────────────┬───┴─────────────────┤
│ GEDANKE FÜR HEUTE      │ GEDANKEN-PARKPLATZ     │ WOHLFÜHL-MOMENTE    │
└────────────────────────┴────────────────────────┴─────────────────────┘
```

- **Bühne** (8 Spalten): oben Greeting (`Greeting`), darunter die Fokus-Einheit
  (`ActiveSession`). Die Ecken der Fokus-Einheit tragen feine HUD-Marken (vorhandenes
  `--hud-frame`, Referenzen 1, 5). Das ist das einzige „Rahmen“-Motiv der App.
  - Aufgabe: Display-Größe. Timer: Mono, monumental.
  - Ohne laufenden Block zeigt die Bühne die nächste Aufgabe groß mit Start-CTA, oder
    den ruhigen Leerzustand.
- **Seitenspalte** (4 Spalten, links eine Haarlinie): Begleiter kompakt
  (`CompanionHome`), darunter `DayPlan` („Danach“) als Liste mit Haarlinien zwischen
  den Zeilen (Referenz 8).
- **Dein Tag**: `Timeline` über volle Breite.
- **Band „Für dich“**: Wasser (`CompanionCard`), Wetter (`WeatherCard`), Zeiten heute
  (`TodayTimesCard`), Woche (`WeekTeaser`). Vier gleiche Spalten, getrennt durch
  senkrechte Haarlinien.
- **Band „Kopf frei“**: Gedanke (`DailyImpulse`), Parkplatz (`ThoughtParking`),
  Routinen (`MicroRoutines`). Drei Spalten.
- Responsiv:
  - Unter 1180px rutscht die Seitenspalte unter die Bühne. Bänder: 2 Spalten.
  - Unter 760px: eine Spalte, die Leiste wird 56px.
- Fokus-Stile (Klassen `fs-*` bleiben, Logik unverändert):
  - breathe: alles außer Bühne dimmt auf 0.35 und wird leicht unscharf.
  - tunnel: Seitenspalte und Bänder blenden aus, die Bühne zentriert sich.
  - cocoon: nur Aufgabe und Timer.
  - micro: die drei Schritte unter der Aufgabe.
  - pomodoro: wie breathe plus Rundenuhr.
  - Die Leiste dimmt in allen Fokus-Stilen auf 0.4 (Hover holt sie zurück).
- Die Panel-Klassen `panel--focus`, `panel--thoughts` usw. bleiben als Anker, weil die
  Begleiter-Tour (`CompanionTour`) darauf zeigt. Die `slide`-Logik der Tour (Flow) fällt
  weg.

### Rückblick

Redaktionelle eine Spalte (max. 1080px).
- `WeekView`, `CalmStats`, `ReportPanel` in heutiger Reihenfolge als Abschnitte,
  getrennt durch Haarlinien und Abstand. Keine zusätzliche Kennzahlen-Zeile, keine
  neuen Werte.
- `CalmStats` selbst wird als Kennzahlen-Zeile gesetzt: große Mono-Zahlen, Label
  darunter, senkrechte Haarlinien (Referenz 10). Der Pro-Schleier (`pro-veil`,
  `openPro('stats')`) bleibt in Verhalten und Freischaltung unverändert.
- Diagramme in Grautönen, nur der aktuelle Tag oder Wert im Akzent (Referenzen 2, 3).

### Begleiter

`CompanionHub`: Die Figur steht groß und zentriert auf der Bühne, mit Level und
Fortschritt in Mono darunter. Progression Trail und Freischaltungen folgen als Liste
mit Haarlinien. Avatar-Effekte bleiben unverändert (Logik und Canvas).

### Feierabend

`ClosingView`: Bühne mit großem Satz (Tagesabschluss). Was die Ansicht heute schon
zeigt (Summen pro Kunde, erledigte und offene Aufgaben, Stolz-Feld, Vorschlag) wird im
neuen Stil gesetzt, Summen als Kennzahlen-Zeile wie bei `CalmStats`. Keine neuen
Werte. Aktionen als Primär- und Sekundär-Button.

### Schwebende Schichten

- Dialoge (`Dialog.tsx`) und Einstellungen (`SettingsDialog`): `--bg-raised`,
  Haarlinie, 6px (bei Weich 10px), Kopf mit H2 und Mono-Label.
- Einstellungen: Tabs links als Liste (wie die Leiste), Inhalt rechts. Zeilen als
  „Label + Erklärung | Steuerelement“, getrennt durch Haarlinien.
- Selects und Menüs: Referenz 9. Fläche `--bg-raised`, Zeilen mit Icon, Hover-Fläche
  0.04.
- Toasts: unten mittig, `--bg-raised`, Haarlinie, ein Satz, optional eine Aktion.
- Segmente/Toggles: Referenz 12. Segmentgruppe mit Haarlinie, aktives Segment weiß
  gefüllt mit schwarzer Schrift. Schalter: 6px-Spur, weißer Knopf.
- Tages-Anker-Pille, Buddy-Bubble, Quick Capture, Mini-Overlay, Onboarding, Standby,
  Breathe, Pause-Raum, Recovery: gleiche Tokens, gleiche Typo, gleiche Buttons.

### Splash

Geometrie bleibt (bewusste HUD-Komposition, siehe frühere Entscheidung). Er übernimmt
nur die neuen Tokens (Schrift, Linien, Buttons).

## Was entfernt wird

- Typen und Daten: `LayoutId`, `AppearanceSettings.layout`, `Workspace`, `CardSize`,
  `Settings.workspace`.
- Migration in `state/store.ts`: Beide Felder werden beim Laden verworfen. Import alter
  Backups bleibt möglich. `migrations.test` wird angepasst.
- Dateien: `components/Workspace.tsx`, `components/FlowSlider.tsx`,
  `styles/components/workspace.css`, `styles/layout/layouts.css`, `tests/layouts.test.ts`,
  `tests/workspace.test.ts`.
- Pro: Features `flow` und `workspace`, `PRO_LAYOUTS`, `isProLayout`, die Zeilen im
  `ProDialog`, die Layout-Rückfalllogik in `freeState` (und `pro.test` entsprechend).
- Einstellungen: der Layout-Picker in „Design“.
- `main.tsx`: `data-layout`. `App.tsx`: `flow-lock`, die drei Standard-Reihenfolgen.
- `CompanionTour`: `slide`-Felder und Flow-Dot-Logik.
- `anchors.test`: Die Prüfung „nie Teil der Layouts“ wird zu „nie Teil des Cockpits“
  (Pille bleibt schwebend).
- Fonts: `@fontsource-variable/manrope`, `@fontsource-variable/urbanist`.
- Tokens, die nur für die alten Looks lebten (`--glass-*`, `--surface-sunk`,
  `--grid-line` usw.), sofern danach ungenutzt.

## Tests und Prüfung

- Bestehende Regeln bleiben: ein Modul pro Klassenblock, Keyframes nur in
  animations.css, kein Hell-Theme.
- `look.test` wird auf die neue Radius-Regel angepasst: jeder px-Radius kommt aus
  `var(--radius)` oder ist rund.
- Neuer Test `cockpit.test.tsx`: Das Cockpit rendert alle 12 Module (inkl. `greet`)
  genau einmal mit ihren `panel--*`-Ankern.
- Sichtprüfung per Vite :5199, headless Chrome und CDP im Demo-Modus, Screenshots aller
  Ansichten bei 1440, 1180 und 760px Breite. Dazu ein Electron-Lauf mit Temp-Profil für
  Drag-Region und Fensterknöpfe (Hit-Test wie gehabt).

## Calls von Claude (zum Gegenlesen)

- Feierabend bleibt der Haupt-CTA in der Kopfzeile, nicht in der Leiste.
- Rückblick bekommt keine eigene Kennzahlen-Zeile. `CalmStats` wird selbst zur
  Kennzahlen-Zeile, Pro-Sperre unverändert.
- Schrift wechselt auf Geist und Geist Mono (Manrope und Urbanist entfallen).
- Primär-Button: weiß gefüllt mit 6px statt Pille (Roccos 6px-Gesetz).
- Splash behält seine Geometrie.

## Dem Builder überlassen

- Exakte Icon-Wahl je Station (vorhandene `icons.tsx` erweitern, gleiche Strichstärke
  1.5).
- Feinwerte der Typo-Skala und Abstände innerhalb der genannten Grenzen.
- Leere Zustände der Module: ein ruhiger Satz in `--ink-3`, keine Illustrationen.
