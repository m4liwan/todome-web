# Living Cockpit (step 3) — implementation plan

Builds on the focus cockpit (step 2, `2026-11-15-focus-cockpit.md`). Brief: the
user's master prompt of 2026-11-16 (floating sidebar, sub-navigation, distinct
focus modes, ambient light upgrade, Tages-Anker section, wide review, living
settings). The user opted out of check-ins ("melde dich erst wieder, wenn …"):
every open decision is a ruling, collected at the end.

## Global constraints

- `#050505`, no filled boxes, hairlines `rgba(255,255,255,0.05)`, 6px radius on
  tangible controls (`var(--radius)`), CSS modules only (no Tailwind).
- Business logic, reducers, commands, IPC untouched. The only data change is the
  additive appearance field `dock` (requested sidebar position) with default and
  sanitising migration.
- Splash geometry untouched. PROJECT_CONTEXT.md never committed. No push/tag/merge.
- Drag regions: only `.topbar-wrap` and `.window-drag` may drag.
- Keyframes animate transform/opacity only; reduced motion and calm mode stop drift.
- `npm run typecheck`, `npm run lint`, `npm test` green at the end.

## Tasks

1. **Dock** — `Rail` becomes `Dock` (`components/Dock.tsx`, `styles/components/dock.css`):
   a floating, inset bar (logo, Heute/Rückblick/Begleiter, Feierabend or "Fokus
   wieder aufnehmen", Stumm/Licht/Einstellungen). Icons only; the label slides out
   on hover/focus. Position `appearance.dock: 'left'|'right'|'top'|'bottom'`
   (default left) via `data-dock` on `<html>`; settings option cards in
   Darstellung. Header reduced to a transparent 36px drag strip carrying only
   media and the demo tag. Tests: dock behaviour, migration, short-window fit.
2. **Cockpit + sub-navigation** — wider home (max 1680px); stage/side/day stay
   prominent; the rest moves into "Bereiche": a tablist (Tages-Anker · Für dich ·
   Kopf frei · Woche) with a gliding indicator and horizontally sliding panes,
   arrow-key navigation, last tab remembered per device. Tages-Anker becomes a
   section (mini week calendar of rhythms, today's anchors to tick, 5 min, manage
   via the existing dialog); the floating pill is retired.
3. **Ambient light** — the veil becomes `AmbientLight`: three large light sources
   drifting across the whole background (transform-only keyframes), fine grain
   against banding, strength from `--ambient`, colours from the palette. Each
   focus style sets its own light profile.
4. **Focus profiles** — breathe (open, warm, breathing halo), tunnel (vignette,
   sides glide out, stage floats in), cocoon (unchanged idea, near darkness),
   micro (crisp, small cool spot, bites), pomodoro (rhythmic horizon light). A
   short threshold caption marks the entry into each mode.
5. **Rückblick wide** — two-column editorial grid up to 1440px, big negative space.
6. **Living settings** — the sheet opens out of the dock side, icon tab list with
   a gliding indicator, a large tab title, directional panel transitions and a
   light that moves with the tab.
7. **Verify** — screenshots (1440/1180/760/640, each dock position, each focus
   style, settings), Electron hit test, typecheck/lint/test, memory.
