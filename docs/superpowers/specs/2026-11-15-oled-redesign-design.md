# OLED-Redesign: Stille, Autorität, Fokus

Status: freigegeben (Rocco, 2026-11-15). Branch `feat/oled-redesign`.

## Warum

ToDoMe soll die Ästhetik der Website tragen: tiefes OLED-Schwarz, architektonische
Ruhe, starke Typografie. Gefühl: ein High-End-Cockpit, das Stille ausstrahlt, damit
die wenigen Highlights (Logo, aktive Anker, Begleiter) umso wertvoller wirken.
Psychologisch: keine Reizüberflutung, keine schrillen Farben, Würde des Nutzers.

## Ziele

1. Ein einziges, dunkles Grund-Design (`#050505` / `#0A0A0C`), feine Rahmen
   `rgba(255,255,255,0.08)`, weniger Verspieltheit.
2. Globaler Ecken-Radius in drei Stufen: Kantig (~4 px), Präzise (~10 px), Weich (heute).
3. „Ambient Light“ ersetzt die Farbwelten: Lichtfarbe + Intensität 0–100 %.
4. Splash/Login (ElectricLogo, Tages-Anker), Ruhemodus, Durchatmen, Feierabend
   sprechen dieselbe Sprache.
5. `npm run typecheck`, `npm run lint`, `npm test` grün.

## Nicht-Ziele / Anti-Ziele

- Kein Hell-Modus mehr (entschieden).
- Keine Änderung an Rastern, Positionen, Größen der vier Home-Layouts und des
  Splash (entschieden). Nur Oberflächen, Rahmen, Radius, Licht, Typo.
- Keine Änderung an Geschäftslogik, IPC-Protokoll, Reducer-Abläufen.
- Anti-Ziel: Licht, das grell wird. Auch bei 100 % bleibt es ein Schein.

## Entscheidungen (mit Rocco)

- Hell-Modus entfällt; die App ist immer dunkel.
- Farbwelten → Lichtfarben. Frei: Fokus-Lime, Tiefsee-Cyan, Warmes Bernstein,
  Reines Weiß. Exklusiv (Pro oder Begleiter-Level 15): Tiefes Violett, Gedämpftes Rosé.
  Die Lichtfarbe färbt gedämpft auch die Akzente (eine Farbquelle).
- Radius: drei Stufen; Pillen (`999px`) und Kreise (`50%`) bleiben rund.

## Umsetzung (Claudes Calls, korrigierbar)

- **Daten:** `appearance.palette` bleibt als Feld (Overlay-IPC, boot.js, Pro-Gating
  hängen daran), bekommt aber die neuen Ids `lime | cyan | amber | mono | violet | rose`.
  Neu: `appearance.ambient` (0…1, Standard 0.55) und `appearance.corners`
  (`sharp | precise | soft`, Standard `precise`). `settings.theme` wird auf `'dark'`
  festgelegt (Typ bleibt als Feld, damit alte Daten sauber laden).
- **Migration:** lime→lime, ocean/neon/matrix→cyan, midnight→mono, lavender→violet,
  rose/pulse→rose, ältere (sunset, solaris, moss) über die bestehende Kette.
  Gesperrte Lichtfarben fallen beim Laden ohne Pro/Level 15 auf die nächste freie
  (violet→cyan, rose→amber).
- **Tokens:** `tokens.css` wird ein einziger dunkler `:root`. Radius über
  `--rs` (Skala: soft 1, precise 0.55, sharp 0.22) an `html[data-corners]`;
  alle festen px-Radien werden `calc(Npx * var(--rs))`. Licht über `--ambient`
  (Inline-Style auf `<html>`), alle Licht-Alphas skalieren damit.
- **Ambient Light:** die vorhandenen Hintergrund-Blobs der Shell werden das Licht
  (Lichtfarbe, Alpha × `--ambient`); zusätzlich legt `--shadow` einen sehr leisen
  farbigen Schein unter schwebende Karten. Bei 0 % bleibt reines Schwarz.
- **Topbar:** der Hell/Dunkel-Knopf wird an gleicher Stelle zum Schalter
  „Licht dimmen / Licht an“ (0 % ↔ letzte Stärke). Kopfzeile bleibt geometrisch gleich.
- **Einstellungen › Design:** „Darstellung“ und „Farbwelt“ werden zu
  „Ambient Light“ (Farbe + Stärke-Slider) und „Ecken“ (drei Stufen).
- **Level 15:** heißt künftig „Exklusive Lichtfarben“; Pro-Dialog zählt 4 / 6.
- **Electron:** `nativeTheme.themeSource = 'dark'` fest; Fensterhintergrund `#050505`.

## Was dem Bauenden bleibt

Exakte Licht-Alphas, Typo-Gewichte und die Feinabstimmung der vier Ruhe-Ansichten,
geprüft im echten Fenster; Layout-Geometrie per Messung gegen den Stand vor dem Redesign.
