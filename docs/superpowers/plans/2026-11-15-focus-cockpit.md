# Fokus-Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ToDoMe bekommt auf dem Wireframe aus Schritt 1 seine neue Gestalt: ein einziges ruhiges Fokus-Cockpit, eine Icon-Leiste links und ein durchgängiges OLED-Design- und Bewegungssystem.

**Architecture:** Zuerst stirbt das Layout-System (Typen, Daten, Pro, UI). Dann entstehen Tokens, Basis-Elemente und das Bewegungssystem. Darauf folgen die Shell (Leiste, Kopfzeile, Schleier) und das Cockpit. Zum Schluss werden alle Module, Ansichten und Schichten Datei für Datei im neuen Stil gesetzt. Logik in `domain/`, `state/` (außer der Migration), `app/` (außer `pro.ts`) und `electron/` bleibt unberührt.

**Tech Stack:** React 19, TypeScript, Vite, Electron, plain CSS-Module unter `src/styles` (ein Owner-Modul pro Klassenblock), Vitest + jsdom, postcss in Tests.

**Spec:** `docs/superpowers/specs/2026-11-15-focus-cockpit-design.md`

## Global Constraints

- Hintergrund `--bg: #050505`. Strukturlinien `1px solid rgba(255,255,255,0.05)` (`--line`), Hover und Feldkanten `0.10` (`--line-strong`).
- Keine gefüllten Panels. Einzige Flächen sind schwebende Schichten mit `--bg-raised: #0b0b0c`, Rand `rgba(255,255,255,0.08)` (`--line-float`) und Schatten.
- Radius nur über `var(--radius)`: 6px bei Präzise (Standard), 0 bei Kantig, 10px bei Weich. Rund bleibt `50%` oder `999px`.
- Schriften: `@fontsource-variable/geist` und `@fontsource-variable/geist-mono` (5.3.0). Manrope und Urbanist werden entfernt.
- Typo-Skala:
  - Display 64px (unter 1180px: 56px), Timer 88px Mono tabular.
  - H1 32px, H2 20px, Body 15px, Meta 13px.
  - Label 11px Mono uppercase mit `letter-spacing: 0.08em`.
  - Headlines mit `letter-spacing: -0.03em`.
- Bewegung: `--ease: cubic-bezier(0.22, 1, 0.36, 1)`, `--t-fast: 140ms`, `--t-base: 240ms`, `--t-slow: 480ms`.
  - Animiert werden nur `transform` und `opacity`.
  - Keyframes stehen nur in `base/animations.css`.
  - Kein Bounce, kein Scale über 1.02.
- Der Akzent (`rgb(var(--accent-rgb))`) erscheint nur hier: laufender Block, Fortschritt, „jetzt“-Marke, positive Werte, Ambient-Schleier, `:focus-visible`-Ring.
- Ein Modul pro Klassenblock (`styles.test`). Home-spezifische Overrides gehören in die Owner-Datei der Klasse.
- `-webkit-app-region: drag` gibt es nur für `html.is-desktop .topbar-wrap` und `html.is-desktop .window-drag` (`window-drag.test`).
- Keine Änderung an Reducern, Domain, IPC und den Props-Verträgen der Module, außer wo eine Task es ausdrücklich nennt.
- Copy auf Deutsch, ruhig, nie beschämend. `PROJECT_CONTEXT.md` nie stagen. Dateien beim Commit einzeln stagen, nie `git add -A`.
- Verifikation pro Task: `npm run typecheck`, `npx eslint .`, `npx vitest run`.

## Review Focus

1. **Alte gespeicherte Daten und Backups** mit `appearance.layout: 'flow'` und `settings.workspace: {hub: {...}}`: Laden und Import funktionieren, beide Felder sind danach weg, nichts anderes geht verloren. Abgedeckt in Task 1.
2. **Fokus läuft, während der Nutzer die Ansicht wechselt** oder einen Dialog öffnet: `fs-*`-Klassen dimmen nur auf Heute, Leiste und Kopfzeile bleiben bedienbar. Abgedeckt in Task 4 (Cockpit-Test für Klassen).
3. **Schmales Fenster (760px) und 200 % Zoom**: kein horizontales Scrollen, die Leiste bleibt erreichbar, der Timer bricht nicht aus. Sichtprüfung in Task 9.
4. **Tastatur-Bedienung**: Die Leiste ist per Tab erreichbar, die aktive Station meldet `aria-current="page"`, Tooltips erscheinen auch bei `:focus-visible`. Abgedeckt in Task 3 (Rail-Test).
5. **Begleiter-Tour auf dem neuen Cockpit**: Alle Ziele (`.panel--focus`, `.hello .energy-chip`, `.panel--thoughts`, `.topbar__main`, `.home-hub`) existieren, keine Station wird übersprungen. Abgedeckt in Task 4 (Test auf Selektoren).

---

### Task 1: Layout-System restlos entfernen

**Files:**
- Delete: `src/components/Workspace.tsx`, `src/components/FlowSlider.tsx`, `src/styles/components/workspace.css`, `src/styles/layout/layouts.css`, `src/tests/layouts.test.ts`, `src/tests/workspace.test.ts`
- Modify:
  - `src/domain/types.ts`: `LayoutId`, `AppearanceSettings.layout`, `CardSize`, `Workspace`, `Settings.workspace` entfernen
  - `src/state/defaults.ts`: `layout` und `workspace` raus
  - `src/state/store.ts`: `migrateAppearance` und die Settings-Migration
  - `src/app/pro.ts`: `flow`, `workspace`, `PRO_LAYOUTS`, `isProLayout`, Layout-Zweig in `freeState`
  - `src/components/dialogs/ProDialog.tsx`: Zeilen für `workspace` und `flow`
  - `src/components/dialogs/SettingsDialog.tsx`: `LAYOUTS` und Picker (Zeilen ca. 78–83 und 395–411)
  - `src/main.tsx:129`: `data-layout`
  - `src/app/App.tsx`: `layout`, `flow-lock`-Effekt, `order`, FlowSlider- und WorkspaceHome-Zweig. Heute rendert übergangsweise die Panels in fester Reihenfolge `['greet','focus','hub','plan','tl','water','weather','times','week','impulse','thoughts','routines']`.
  - `src/components/CompanionTour.tsx`: Feld `slide`, Flow-Dot-Logik (Zeilen ca. 25, 44, 59, 103, 266–270)
  - `src/styles/index.css`: Imports entfernen
  - `src/styles/layout/shell.css`: alle `.home--*`-Regeln, `html.flow-lock`
- Test: `src/tests/migrations.test.ts`, `src/tests/pro.test.ts`, `src/tests/anchors.test.tsx`

**Interfaces:**
- Produces:
  - `AppearanceSettings` ohne `layout`, `Settings` ohne `workspace`
  - `ProFeature = 'reports' | 'clients' | 'avatars' | 'palettes' | 'stats'`
  - `App.tsx` hält weiterhin `p: Record<string, ReactNode>` (12 Panels) und `panel(id)`.

- [ ] **Step 1: Tests anpassen und erweitern (failing)**

In `migrations.test.ts` werden die Erwartungen an `layout` und `workspace` (Zeilen 20, 37, 100, 108, 172) durch Abwesenheit ersetzt. Dazu kommt ein neuer Fall:

```ts
it('drops the retired home layouts and the workspace editor', () => {
  const s = loadFrom({ schemaVersion: 4, settings: { appearance: { palette: 'cyan', layout: 'flow', standby: 'drift' }, workspace: { hub: { order: ['focus'], size: { focus: 'l' } } } } });
  expect(s?.settings.appearance).not.toHaveProperty('layout');
  expect(s?.settings).not.toHaveProperty('workspace');
  expect(s?.settings.appearance).toMatchObject({ palette: 'cyan', standby: 'drift' });
});
```

Für `loadFrom` wird derselbe Lade-Helfer genutzt wie in den Nachbartests der Datei. In `pro.test.ts` entfällt die Layout-Erwartung (Zeilen 12 und 19). Neuer Fall: `freeState` lässt eine Palette `rose` ohne Pro auf `amber` fallen (bestehende Logik), ohne `layout` zu kennen. `anchors.test.tsx` (Zeilen 226–235) prüft künftig „never part of the cockpit“: `App.tsx` enthält kein `anchors` in der Panel-Liste `p`, und `shell.css` matcht nicht `/anchors/`.

- [ ] **Step 2: `npx vitest run src/tests/migrations.test.ts src/tests/pro.test.ts src/tests/anchors.test.tsx`**

Erwartet: FAIL, weil `layout` noch geschrieben wird.

- [ ] **Step 3: Entfernen wie unter Files gelistet**

`migrateAppearance` löscht `layout` aus dem Ergebnis, zusammen mit dem alten `silentFocus`-Delete. Die Settings-Migration löscht `workspace`. `CURRENT_SCHEMA` bleibt 4: Es ist nur ein Weglassen, alte Builds füllen die Felder per Default wieder auf.

- [ ] **Step 4: Typecheck, Lint und alle Tests grün**

Run: `npm run typecheck && npx eslint . && npx vitest run`. Erwartet: 0 Fehler, alle Tests PASS.

- [ ] **Step 5: Commit** `refactor: retire home layouts and workspace editor`

---

### Task 2: Tokens, Schriften, Basis-Elemente, Bewegung

**Files:**
- Modify:
  - `package.json`: `+ @fontsource-variable/geist`, `+ @fontsource-variable/geist-mono`, `- manrope`, `- urbanist`
  - `src/main.tsx:32-33`
  - `src/styles/base/tokens.css`
  - `src/styles/base/base.css`
  - `src/styles/base/animations.css`
  - `src/styles/base/accessibility.css`
  - `src/styles/components/controls.css`
- Test: `src/tests/look.test.ts`

**Interfaces:**
- Produces (CSS-Verträge für alle späteren Tasks):
  - Tokens:
    - Farben: `--bg`, `--bg-raised`, `--ink`, `--ink-2 #a1a1aa`, `--ink-3 #63636b`, `--line`, `--line-strong`, `--line-float`
    - Radius und Abstand: `--radius`, `--s1`…`--s10` (4, 8, 12, 16, 24, 32, 48, 64, 80, 96)
    - Bewegung: `--ease`, `--t-fast`, `--t-base`, `--t-slow`
    - Schrift: `--font-sans: 'Geist Variable', 'Segoe UI', system-ui, sans-serif`, `--font-mono: 'Geist Mono Variable', ui-monospace, monospace`
  - `--radius` wird per `:root[data-corners='sharp'|'precise'|'soft']` gesetzt (0, 6px, 10px).
  - Klassen:
    - `.btn` (sekundär), `.btn--primary`, `.btn--quiet`, `.btn--small`
    - `.label` (Mono-Label), `.meta`, `.num` (Mono, tabular)
    - `.seg` mit `[aria-pressed|aria-checked=true]` (Segmentgruppe, Referenz 12)
    - `.switch` (Schalter)
  - Keyframes: `rise` (opacity 0→1, translateY 6px→0), `fade`, `veil-breathe`, `pulse-dot`
  - Klasse `.enter` setzt `animation: rise var(--t-slow) var(--ease) both`. Die Verzögerung kommt aus `--i` (`calc(var(--i, 0) * 40ms)`, gedeckelt durch Klassen bis 5).

- [ ] **Step 1: look.test failing anpassen**

Die Radius-Regel wird neu gefasst: Jeder `border-radius` in px > 0 und < 99 ist verboten, außer er läuft über `var(--radius)`. Erlaubt bleiben `50%`, `999px`, `0` und Werte bis 2px. Der Teil mit `--rs` und `calc(...)` entfällt. Neue Fälle:

```ts
it('defines the hairline, float surface and motion tokens', () => {
  const t = readFileSync(join(styles, 'base', 'tokens.css'), 'utf8');
  expect(t).toMatch(/--line:\s*rgba\(255,\s*255,\s*255,\s*0\.05\)/);
  expect(t).toMatch(/--bg-raised:\s*#0b0b0c/);
  expect(t).toMatch(/--ease:\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
  expect(t).toMatch(/\[data-corners='precise'\][^}]*--radius:\s*6px/);
});
it('animates only transform and opacity', () => { /* walk @keyframes in animations.css: every decl prop ∈ {transform, opacity, offset-distance} */ });
it('loads Geist and no retired fonts', () => {
  const main = readFileSync(join(process.cwd(), 'src', 'main.tsx'), 'utf8');
  expect(main).toMatch(/@fontsource-variable\/geist\//);
  expect(main).toMatch(/@fontsource-variable\/geist-mono\//);
  expect(main).not.toMatch(/manrope|urbanist/);
});
```

Wichtig: Bestehende Keyframes mit anderen Props (z. B. `filter`, `background-position` im Splash oder in Avatar-FX) werden **vorher** inventarisiert. Steht dort etwas anderes, enthält der Test eine benannte Ausnahmeliste dieser Keyframes. Kein Umbau von Splash und Avatar-Animationen.

- [ ] **Step 2: `npx vitest run src/tests/look.test.ts`** → FAIL

- [ ] **Step 3: Implementieren**

- **Tokens:** Werte aus Global Constraints. Die alten Splash-Tokens bleiben, `--font-display` zeigt auf `--font-sans`. Danach werden `--rs` und die `calc(var(--r0)…)`-Formeln projektweit durch `var(--radius)` ersetzt. Die `--r0`/`--rs`-Setzer stehen in `app/theme.ts` oder `main.tsx`: Dort ist nur ein CSS-Mapping betroffen, `data-corners` bleibt.
- **base.css:**
  - Die Wireframe-Button-Regel (unterstrichen) wird ersetzt durch: `button` ohne Stil, Cursor pointer, `transition: color, opacity, background-color, border-color var(--t-fast) var(--ease)`.
  - Felder: unten `--line-strong`, bei Fokus `--ink-2`.
  - Headlines in Geist mit `-0.03em`.
  - Body 15/1.55 `--font-sans`, `font-feature-settings: 'ss01'` ist nicht nötig.
  - Die Auswahl-Markierung (bold + 2px-Unterstrich) entfällt. Aktive Zustände übernimmt `.seg` bzw. die Owner-Module.
- **controls.css:** Besitzt `.btn*`, `.seg`, `.switch`, `.label`, `.meta`, `.num`, `.chip`. Die Primärfarbe ist `#f5f5f6` mit Schrift `#050505`, Hover `#ffffff`.
- **accessibility.css:**
  - `:focus-visible` = `outline: 1.5px solid rgb(var(--accent-rgb) / 0.8); outline-offset: 2px`.
  - Bei `prefers-reduced-motion` und `.is-fx-calm` gilt für `.enter` und Schleier `animation: none`.

- [ ] **Step 4: Typecheck, Lint, alle Tests, und `npm run build` grün** (prüft, dass die Font-Pakete auflösen)

- [ ] **Step 5: Commit** `feat(design): tokens, Geist type, base controls and motion`

---

### Task 3: Shell mit Leiste, Kopfzeile und Ambient-Schleier

**Files:**
- Create:
  - `src/components/Rail.tsx`
  - `src/styles/components/rail.css` (in `index.css` direkt nach `topbar.css` importieren)
  - `src/tests/rail.test.tsx`
- Modify:
  - `src/components/Topbar.tsx`: `segnav` und `tool-pill` raus, Logo-Zelle, Ansichts-Label und Datum rein
  - `src/styles/components/topbar.css`
  - `src/components/icons.tsx`: `IconHome`, `IconChart`, `IconCompanion` in gleicher Strichstärke 1.5
  - `src/app/App.tsx`: Rail einsetzen und `.app`-Raster
  - `src/styles/layout/shell.css`: `.shell`-Raster, `.app`, `.veil`

**Interfaces:**
- Consumes: Tokens und `.label` aus Task 2. `View` aus `Topbar.tsx`.
- Produces:
  - `export function Rail(props: { state: AppState; view: View; onView: (v: View) => void; onOpen: OpenModal }): JSX.Element`
  - DOM: `<nav className="rail" aria-label="Ansicht">`, Stationen `button.rail__item` mit `aria-current="page"` auf der aktiven, `span.rail__tip` als Tooltip, `span.rail__mark` als gleitender Indikator (per `style={{ transform: translateY(index * 100%) }}`), unten `div.rail__tools` mit Stumm, Licht und Einstellungen. Logik 1:1 aus dem heutigen `tool-pill` in Topbar.
  - `Topbar` behält die Props-Signatur und `.topbar__main`.
  - `.veil` ist ein `div`, als erstes Kind von `.shell` gerendert, mit `aria-hidden`.

Geometrie:
- Die Kopfzeile (48px, Drag-Region) läuft über die volle Breite. Ganz links sitzt eine 64px breite Logo-Zelle über der Leiste. So bleibt die Drag-Regel im Test unverändert.
- Die Leiste ist `position: fixed; top: 48px; bottom: 0; left: 0; width: 64px`, rechts `--line`.
- Inhalt: `.app` mit `margin-left: 64px`, max. 1440px, Innenabstand `--s8` / `--s7`.
- Unter 760px wird die Leiste 56px breit.
- In Fokus-Stilen (`.shell.is-focusing .rail`): `opacity: 0.4`, bei `:hover` und `:focus-within` wieder 1.
- `.veil`:
  - `position: fixed; inset: -20vh -10vw auto; height: 70vh; pointer-events: none; z-index: -1`
  - zwei `radial-gradient`s in `rgb(var(--accent-rgb) / …)`, `filter: blur(80px)`
  - `opacity: calc(var(--ambient) * 0.18)`
  - `animation: veil-breathe 24s var(--ease) infinite alternate` (nur transform)

- [ ] **Step 1: rail.test.tsx schreiben (failing)**

```ts
it('marks the current station for screen readers', () => { render Rail view="times" → getByRole('button',{name:/Rückblick/}) has aria-current="page"; Heute has none });
it('switches views', () => { click 'Begleiter' → onView called with 'companion' });
it('toggles do-not-disturb and the light like the old tool pill', () => { click Stumm → store settings.doNotDisturb true; click Licht → appearance.ambient 0 });
it('opens the settings', () => { click 'Einstellungen' → onOpen({kind:'settings'}) });
it('keeps the day-end action in the header', () => { render Topbar → '.topbar__main' text = contextLabels(..).dayEnd });
```

Store und Services werden wie in `media-control.test.tsx` und `anchors.test.tsx` aufgesetzt (gleicher Provider-Helfer).

- [ ] **Step 2: `npx vitest run src/tests/rail.test.tsx`** → FAIL

- [ ] **Step 3: Implementieren** wie unter Interfaces und Geometrie beschrieben. Der Tooltip erscheint per `opacity` und `translateX(-4px→0)` in `--t-fast` bei `:hover` und `:focus-visible`.

- [ ] **Step 4: Typecheck, Lint, alle Tests grün, inklusive `window-drag.test`**

- [ ] **Step 5: Commit** `feat(design): icon rail, slim header, ambient veil`

---

### Task 4: Das Cockpit (Heute)

**Files:**
- Create:
  - `src/components/Cockpit.tsx`
  - `src/styles/layout/cockpit.css` (Import direkt nach `shell.css`)
  - `src/tests/cockpit.test.tsx`
- Modify:
  - `src/app/App.tsx`: der Heute-Zweig rendert `<Cockpit panels={p} />`
  - `src/styles/layout/shell.css`: Fokus-Stil-Regeln `fs-*` für Bühne, Seite und Bänder umziehen. Owner ist künftig `cockpit.css`, `active-session.css` behält nur Regeln an `.focus*`.
  - `src/styles/layout/zones.css`: `.band` mit senkrechten Haarlinien, `--cols`

**Interfaces:**
- Consumes: `p: Record<string, ReactNode>` aus App (12 Schlüssel).
- Produces:
  - `export const COCKPIT = { stage: ['greet','focus'], side: ['hub','plan'], day: ['tl'], care: ['water','weather','times','week'], mind: ['impulse','thoughts','routines'] } as const`
  - `export function Cockpit({ panels }: { panels: Record<string, ReactNode> }): JSX.Element`
  - DOM:
    - `.cockpit` > `section.cockpit__stage` + `aside.cockpit__side` + `section.cockpit__day` + `section.band.cockpit__care` + `section.band.cockpit__mind`
    - Jedes Panel als `div.panel.panel--{id}.enter` mit `style={{'--i': n}}`. `n` läuft in Lese-Reihenfolge, gedeckelt bei 5.
    - `.cockpit__care` und `.cockpit__mind` tragen ein `h2.label` („Für dich“, „Kopf frei“) und `aria-labelledby`.
    - Die Fokus-Einheit trägt zusätzlich `.cockpit__hud` (Eckmarken über `background: var(--hud-frame)` mit `--hud-line` auf `rgba(255,255,255,0.10)`).

Raster:
- 12 Spalten, `column-gap: var(--s8)`. Bühne `span 8`, Seite `span 4` mit `border-left: 1px solid var(--line); padding-left: var(--s7)`.
- Tag, Für dich und Kopf frei: `1 / -1`, jeweils `border-top: var(--line)` und `padding-top: var(--s8)`.
- Unter 1180px: Seite unter der Bühne mit `border-top` statt `border-left`, Bänder `--cols: 2`. Unter 760px: eine Spalte.
- Fokus-Stile:
  - breathe: `.shell.is-focusing.fs-breathe :is(.cockpit__side, .cockpit__day, .cockpit__care, .cockpit__mind) { opacity: .35; filter: blur(1.5px) }` mit Transition `--t-slow`.
  - tunnel: dieselben Bereiche mit `opacity: 0; visibility: hidden`, die Bühne über `1 / -1` zentriert, max. 880px.
  - cocoon: wie tunnel. Greeting blendet ebenfalls aus.
  - pomodoro: wie breathe.

- [ ] **Step 1: cockpit.test.tsx schreiben (failing)**

```ts
it('places all twelve modules exactly once', () => { render Cockpit with 12 stub panels → each '.panel--'+id count 1; total .panel === 12 });
it('keeps the tour targets', () => { expect('.panel--focus', '.panel--thoughts' present; COCKPIT.stage includes 'greet') });
it('staggers the entrance at most five steps deep', () => { every .panel style --i ≤ 5 });
it('labels the two bands', () => { getByRole('region',{name:'Für dich'}), getByRole('region',{name:'Kopf frei'}) });
```

Ein weiterer Test liest `App.tsx` als Text: Die Tour-Ziele `.home-hub` und `.hello .energy-chip` kommen aus `HomeExtras.tsx` bzw. `Greeting.tsx`, also werden beide Klassennamen in diesen Quellen gesucht. Der Test auf Fokus-Klassen liest `cockpit.css`: `.shell.is-focusing` steht immer zusammen mit `.shell--today` oder innerhalb von `.cockpit`, damit andere Ansichten nicht dimmen (Review Focus 2).

- [ ] **Step 2: `npx vitest run src/tests/cockpit.test.tsx`** → FAIL
- [ ] **Step 3: Implementieren** wie oben beschrieben
- [ ] **Step 4: Typecheck, Lint, alle Tests grün**
- [ ] **Step 5: Commit** `feat(design): focus cockpit replaces the home layouts`

---

### Task 5: Module von Heute im neuen Stil

**Files (nur CSS und kleine Markup-Klassen, keine Logik):**
- `active-session.css`, `ActiveSession.tsx`:
  - Aufgabe `.focus__title` in Display-Größe, Timer `.focus__clock` 88px `--font-mono` tabular.
  - Fortschritt als 1px-Linie in `--line` mit Akzent-Füllung und „jetzt“-Punkt (`pulse-dot`).
  - Aktionen: `.btn--primary` (Fertig/Start), `.btn` (Pause), `.btn--quiet` (Feststecken).
  - Leerzustand/OneThing: nächste Aufgabe groß, Start-CTA.
- `greeting.css`: H1 32px, Meta-Zeile Mono in `--ink-3`, Energie-Chip als `.chip`
- `day-plan.css`: Zeilen mit `border-top: var(--line)`, rechts Dauer als `.num` in `--ink-3`, Hover `--ink`
- `timeline.css`, `focus-progress.css`: Segmente in Graustufen, der laufende Block im Akzent, Stundenticks Mono 11px
- `companion.css` (`.home-hub`, kompakt in der Seitenspalte), `home-extras.css`, `weather.css`, `report.css` (TodayTimesCard), `week-view.css` (WeekTeaser-Teil): Label oben, Wert als `.num` 32px, Meta darunter, Aktionen als `.btn--quiet`
- `pomodoro.css`: Rundenuhr in Mono, Ringe `--line` und Akzent
- `daily-anchors.css` (Pille): `--bg-raised`, `--line-float`, `999px`, unten links

**Interfaces:** Consumes die Klassen aus Task 2. Klassen-Hooks, die Tests oder die Tour nutzen, bleiben erhalten: `.focus*`, `.hello`, `.energy-chip`, `.home-hub`, `.panel--*`.

- [ ] **Step 1:** Vor dem Umbau die bestehenden Tests für diese Module laufen lassen. Sie sind das Sicherheitsnetz für Markup-Klassen: `npx vitest run src/tests/timeline.test.tsx src/tests/pomodoro-ui.test.tsx src/tests/home-extras.test.ts src/tests/anchors.test.tsx`. Erwartet: PASS.
- [ ] **Step 2:** Pro Datei setzen. Danach `npm run dev:web` (Port 5199, `?mode=demo`) und Screenshots von Heute bei 1440 und 1180px: ohne Block, mit laufendem Block, je Fokus-Stil. Ablauf wie in `[[oled-redesign]]` (CDP, settings/update `{onboarded, tourDone, companionIntroSeen}`).
- [ ] **Step 3:** Typecheck, Lint, alle Tests grün.
- [ ] **Step 4: Commit** `feat(design): today modules in the cockpit style`

---

### Task 6: Rückblick, Begleiter, Feierabend

**Files:**
- `week-view.css`, `report.css`, `CalmStats.tsx`: als Kennzahlen-Zeile `.stats` mit `.stats__item` (Zahl `.num` 40px, `.label` darunter), getrennt durch `border-left: var(--line)`. `pro-veil` und `openPro('stats')` bleiben unverändert.
- `companion-hub.css`, `CompanionHub.tsx`: Figur zentriert auf der Bühne, Level und XP in Mono, Trail als Liste mit Haarlinien
- `avatar-fx.css`: nur Tokens, keine Effekt-Logik
- `closing.css`, `ClosingView.tsx`:
  - Satz in H1 Display.
  - Summen pro Kunde als `.stats`, Listen mit Haarlinien.
  - Stolz-Feld als Feld mit Unterlinie.
  - Aktionen `.btn--primary` und `.btn`.
- `shell.css`: `.view-fade` → `display: grid; gap: var(--s9); max-width: 1080px; margin-inline: auto`. Abschnitte mit `border-top: var(--line); padding-top: var(--s8)`, Kinder mit `.enter`.

**Interfaces:** Consumes `.stats` (Owner `report.css`, wird hier definiert), `.enter`, `.btn*`.

- [ ] **Step 1:** Relevante Tests vorher grün: `companion-hub.test.tsx`, `soft-close.test.tsx`, `day-close.test.ts`, `calm.test.ts`
- [ ] **Step 2:** Setzen und Screenshots der drei Ansichten (1440/760)
- [ ] **Step 3:** Typecheck, Lint, alle Tests grün
- [ ] **Step 4: Commit** `feat(design): review, companion and day-end views`

---

### Task 7: Schwebende Schichten

**Files:**
- `dialogs.css`, `Dialog.tsx`:
  - Fläche `--bg-raised`, Rand `--line-float`, `var(--radius)`, Schatten `0 24px 80px rgb(0 0 0 / .6)`.
  - Eintritt mit `rise` (8px), `sheet-out` bleibt.
  - Kopf: H2 plus `.label`.
- `settings.css`, `SettingsDialog.tsx`, `SettingsSections.tsx`:
  - Tabs links als vertikale Liste mit gleitendem Indikator wie die Leiste. Den vorhandenen Sliding-Highlight-Mechanismus nutzen, auf vertikal umstellen.
  - Zeilen als `.setting-row` (links Label und Erklärung, rechts Steuerelement), dazwischen Haarlinien.
  - `layout-opt` heißt künftig `.choice` (Ruhemodus, Fokus-Stil, Timeline). Alle Verwendungen umbenennen.
- `controls.css` (Select-Liste, Referenz 9):
  - Zeilen 36px mit Icon, Hover `rgba(255,255,255,0.04)` mit `var(--radius)`.
  - Trenner `--line`. Menü-Eintritt `rise` mit 4px.
- `toasts.css`: unten mittig, `--bg-raised`, `--line-float`, ein Satz plus `.btn--quiet`
- `companion.css` (Bubble), `companion-tour.css` (Spotlight-Rahmen: 1px `--line-strong`, keine Akzent-Box), `companion-intro.css`, `pro.css`, `contact.css`, `first-tasks.css`, `recovery.css`, `start-dialog.css`: gleiche Tokens, Buttons aus Task 2

**Interfaces:** Consumes Tokens und `.btn*`/`.seg`/`.switch` aus Task 2. Produces `.setting-row` und `.choice`, beide mit Owner `settings.css`.

- [ ] **Step 1:** Vorher grün: `glass-select.test.tsx`, `settings-audio.test.tsx`, `contact-dialog.test.tsx`, `recovery.test.tsx`, `companion-intro.test.tsx`, `first-tasks.test.ts`
- [ ] **Step 2:** Setzen. Screenshots der Einstellungen (jeder Tab), von Start-Dialog, Pro-Dialog und Toast.
- [ ] **Step 3:** Typecheck, Lint, alle Tests grün
- [ ] **Step 4: Commit** `feat(design): floating layers, settings and menus`

---

### Task 8: Vollbild-Schichten und Nebenfenster

**Files:**
- `onboarding.css`, `standby.css`, `breathe.css`, `HomeExtras`-Pause-Raum (Owner laut `styles.test` ermitteln): `--bg`, Display-Typo, Mono-Uhr, HUD-Ecken (`--hud-frame`) als einziges Rahmenmotiv. Die Animationen `onboard-out`, `breath`, `cue-in`, `cue-out` bleiben in Name und Dauer.
- `overlay.css` (Mini-Overlay), `quick.css` (Quick Capture): `--bg-raised`, `--line-float`, `var(--radius)`. `html.is-quick` bleibt `background: transparent !important`.
- `splash.css`, `electric-logo.css`: nur Schrift-, Linien- und Button-Tokens. Keine Geometrie ändern.
- `winter.css`: Girlande und Schnee bleiben, Farben auf Tokens umstellen.

- [ ] **Step 1:** Vorher grün: `overlay.test.ts`, `quick-capture.test.tsx`, `window-drag.test.ts`
- [ ] **Step 2:** Setzen. Screenshots: Splash, Onboarding, Standby (4 Varianten), Breathe, Quick Capture (`quick.html` oder Hash, wie heute geladen)
- [ ] **Step 3:** Typecheck, Lint, alle Tests grün
- [ ] **Step 4: Commit** `feat(design): full-screen views and side windows`

---

### Task 9: Aufräumen und End-to-End-Prüfung

**Files:** `tokens.css`, `late.css`, alle CSS-Dateien, `package.json`, `package-lock.json`

- [ ] **Step 1: Tote Tokens und Klassen finden**
  - Jede `--var`-Definition in `tokens.css` ohne `var(--…)`-Nutzung in `src/` löschen. Ausnahme: Variablen, die JS liest, also Grep in `src/**/*.ts(x)` auf den Namen ohne `--` und auf `getPropertyValue`.
  - Jede CSS-Klasse ohne Vorkommen in `src/**/*.tsx` und `index.html` löschen. Ausnahme: Klassen, die JS setzt (`classList`).
  - Gegenprobe: `npm run typecheck`, `npx eslint .`, `npx vitest run`, `npm run build` grün.
- [ ] **Step 2:** `npm ls @fontsource-variable/manrope @fontsource-variable/urbanist` → leer
- [ ] **Step 3: Sichtprüfung im Browser**
  - Alle Ansichten bei 1440, 1180 und 760px sowie bei Zoom 200 %.
  - Erwartet: kein horizontales Scrollen, die Leiste erreichbar, Timer innerhalb der Bühne.
  - Mit `prefers-reduced-motion` per CDP `Emulation.setEmulatedMedia`: keine Animationen.
- [ ] **Step 4: Electron-Lauf mit Temp-Profil**
  - Aufruf: `electron . --user-data-dir=<scratchpad>/e2e --remote-debugging-port=<port> --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows`, ohne `ELECTRON_RUN_AS_NODE`.
  - WM_NCHITTEST: Die Kopfzeile ist Caption (2). Leiste, Logo-Buttons und CTA sind Client (1).
  - Fensterknöpfe verdecken nichts.
- [ ] **Step 5: Commit** `chore(design): drop unused tokens, classes and fonts`

---

## Self-Review (erledigt)

- Spec-Abdeckung:
  - Cockpit → Task 4
  - Leiste und Kopfzeile → Task 3
  - Tokens, Typo und Bewegung → Task 2
  - Rückblick, Begleiter und Feierabend → Task 6
  - Schichten → Task 7
  - Vollbild und Splash → Task 8
  - Entfernen → Task 1 und Task 9
  - Tests → Tasks 1–4
  - Prüfung → Task 9
- Abweichung von der Spec-Skizze, bewusst: Das Logo sitzt in der Kopfzeile über der Leiste statt in der Leiste. Grund: Die Drag-Region bleibt dann auf die Kopfzeile beschränkt (`window-drag.test`).
- Namen sind über die Tasks hinweg konsistent: `Rail`, `Cockpit`, `COCKPIT`, `.stats`, `.choice`, `.setting-row`, `.enter`, `--radius`, `--bg-raised`, `--line-float`.
