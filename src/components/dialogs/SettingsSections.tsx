import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/hooks';
import { useServices } from '../../app/services';
import { BRAIN_PROFILES, brainPatch } from '../../domain/brain';
import { effectTier } from '../../domain/companionProgression';
import type { BrainProfile, Settings, TimelineStyle } from '../../domain/types';
import { desktop } from '../../lib/desktop';
import { useEffectsMode, type EffectsMode } from '../../lib/effects';
import { setSoundVolume } from '../../lib/soundscape';
import { FocusProgress } from '../FocusProgress';
import { FOCUS_STYLES } from '../FocusStyle';
import { MediaControl } from '../MediaControl';

type Modules = Settings['overlay']['modules'];

const MODULES: Array<[keyof Modules, string, string]> = [
  ['avatar', 'Begleiter', 'Dein Avatar, der mitarbeitet'],
  ['anchor', 'Fokus-Anker', 'Die eine Aufgabe, an der du gerade bist'],
  ['progress', 'Fortschrittsring', 'Ruhig, ohne Zahlen'],
  ['media', 'Musiksteuerung', 'Zurück, Pause, Weiter'],
];

/** Floating mini overlay (desktop only): look and which modules it shows. */
export function OverlaySection() {
  const services = useServices();
  const o = useAppState().settings.overlay;
  const setO = (patch: Partial<Settings['overlay']>) => services.store.dispatch({ type: 'settings/update', patch: { overlay: { ...o, ...patch } } });
  const setModule = (key: keyof Modules, value: boolean) => {
    const next = { ...o.modules, [key]: value };
    // Keep at least one module: an empty glass box helps nobody.
    if (!Object.values(next).some(Boolean)) return;
    setO({ modules: next });
  };
  return (
    <section>
      <h3>Mini-Overlay</h3>
      {!desktop ? (
        <p className="muted small">Das Mini-Overlay gibt es in der Desktop-App: eine kleine Glasbox mit deinem Begleiter, frei verschiebbar, auch auf andere Bildschirme.</p>
      ) : (
        <>
          <label className="check">
            <input type="checkbox" checked={o.enabled} onChange={(e) => setO({ enabled: e.target.checked })} />
            <span>Glasbox anzeigen. Ziehen verschiebt sie, ein Klick holt ToDoMe nach vorn.</span>
          </label>
          <p className="settings__label">Was soll die Box zeigen?</p>
          <div className="modules">
            {MODULES.map(([key, label, hint]) => (
              <label key={key} className={`module${o.modules[key] ? ' is-on' : ''}`}>
                <input type="checkbox" checked={o.modules[key]} onChange={(e) => setModule(key, e.target.checked)} />
                <strong>{label}</strong>
                <span>{hint}</span>
              </label>
            ))}
          </div>
          <div className="form--grid">
            <OpacityField value={o.opacity} onCommit={(opacity) => setO({ opacity })} />
            <div className="field">
              <span id="ov-size">Größe des Begleiters</span>
              <div className="segmented" role="radiogroup" aria-labelledby="ov-size">
                {(
                  [
                    ['small', 'Klein'],
                    ['medium', 'Mittel'],
                    ['large', 'Groß'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={o.avatarSize === v} className={o.avatarSize === v ? 'is-on' : ''} onClick={() => setO({ avatarSize: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={o.glow} onChange={(e) => setO({ glow: e.target.checked })} />
            <span>Sanftes Leuchten am Rand</span>
          </label>
        </>
      )}
    </section>
  );
}

/**
 * Opacity without flicker: the slider moves locally and only settles into
 * the settings (and the overlay window) once it rests for a moment.
 */
function OpacityField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState(Math.round(value * 100));
  const timer = useRef<number | null>(null);
  useEffect(() => setLocal(Math.round(value * 100)), [value]);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const schedule = (v: number) => {
    setLocal(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onCommit(v / 100), 220);
  };
  return (
    <label className="field">
      <span>Deckkraft {local} %</span>
      <input type="range" className="range" min={35} max={100} step={1} value={local} onChange={(e) => schedule(Number(e.target.value))} />
    </label>
  );
}

const STANDBY: Array<{ id: Settings['appearance']['standby']; label: string; text: string }> = [
  { id: 'calm', label: 'Ruhig', text: 'Uhr, Datum und dein schlafender Begleiter' },
  { id: 'bigclock', label: 'Große Uhr', text: 'Nur die Zeit, ganz groß und leicht' },
  { id: 'drift', label: 'Wandernde Uhr', text: 'Die Uhr gleitet sanft von Wand zu Wand' },
  { id: 'breath', label: 'Atmen', text: 'Ein leuchtender Kreis, der langsam atmet' },
];

/** What the effects switch does right now, in one calm sentence. */
function companionFxHint(mode: EffectsMode, earned: boolean): string {
  if (mode === 'off') return 'Dein Begleiter und die App erscheinen überall schlicht. Alles Freigeschaltete bleibt dir erhalten.';
  if (!earned) return 'Ab Level 10 funkelt dein Begleiter, ab Level 25 umgibt ihn eine Aura, ab Level 50 schimmert er holografisch und lässt Sternenstaub aufsteigen.';
  if (mode === 'calm') return 'Gerade ruht alle Bewegung, weil dein System weniger Animation wünscht oder der Akku fast leer ist. Die Looks bleiben sichtbar.';
  return 'Auf Level 50 schimmert auch die App ganz leise mit. Bei weniger Animation im System, bei fast leerem Akku und im Fokus halten die Effekte von selbst still.';
}

/** One switch for every level effect of the companion, everywhere in the app. */
export function CompanionFxSection() {
  const services = useServices();
  const state = useAppState();
  const a = state.settings.appearance;
  const mode = useEffectsMode(a.companionFx);
  const earned = effectTier(state.progression.stats.level) !== 'standard';
  return (
    <section aria-labelledby="settings-companion-fx">
      <h3 id="settings-companion-fx">Effekte deines Begleiters</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={a.companionFx}
          aria-describedby="settings-companion-fx-hint"
          onChange={(e) => services.store.dispatch({ type: 'settings/update', patch: { appearance: { ...a, companionFx: e.target.checked } } })}
        />
        <span>Glitzern, Aura, Holofoil und Sternenstaub zeigen</span>
      </label>
      <small className="hint" id="settings-companion-fx-hint">
        {companionFxHint(mode, earned)}
      </small>
    </section>
  );
}

export function StandbySection() {
  const services = useServices();
  const a = useAppState().settings.appearance;
  return (
    <section>
      <h3>Ruhemodus</h3>
      <p className="muted small">Startet nach 15 Minuten ohne Eingabe oder per Klick auf „Ruhemodus“. Ein Mausklick holt dich zurück.</p>
      <div className="layouts" role="radiogroup" aria-label="Aussehen des Ruhemodus">
        {STANDBY.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={a.standby === l.id}
            className={`layout-opt${a.standby === l.id ? ' is-on' : ''}`}
            onClick={() => services.store.dispatch({ type: 'settings/update', patch: { appearance: { ...a, standby: l.id } } })}
          >
            <span className={`standby-prev standby-prev--${l.id}`} aria-hidden="true">
              <i />
            </span>
            <strong>{l.label}</strong>
            <span>{l.text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MediaSection() {
  const services = useServices();
  const st = useAppState().settings;
  const m = st.media;
  const setM = (patch: Partial<Settings['media']>) => services.store.dispatch({ type: 'settings/update', patch: { media: { ...m, ...patch } } });
  return (
    <section>
      <h3>Musik & Medien</h3>
      {!desktop ? (
        <p className="muted small">Die Mediensteuerung gibt es in der Desktop-App. Sie steuert, was unter Windows gerade läuft, etwa Spotify oder Musik im Browser.</p>
      ) : (
        <>
          <p className="muted small">Steuert, was unter Windows gerade spielt (Spotify, Browser, Medienplayer). Kein Tab-Wechsel, kein Konto, nichts verlässt deinen Rechner.</p>
          <label className="check">
            <input type="checkbox" checked={m.enabled} onChange={(e) => setM({ enabled: e.target.checked })} />
            <span>Mediensteuerung verwenden</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={m.inTopbar} disabled={!m.enabled} onChange={(e) => setM({ inTopbar: e.target.checked })} />
            <span>Oben in der Leiste anzeigen</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={st.overlay.modules.media}
              disabled={!m.enabled}
              onChange={(e) => services.store.dispatch({ type: 'settings/update', patch: { overlay: { ...st.overlay, modules: { ...st.overlay.modules, media: e.target.checked } } } })}
            />
            <span>Auch im Mini-Overlay anzeigen</span>
          </label>
          {m.enabled && (
            <div className="settings__media-preview">
              <MediaControl
                fallback={
                  <p className="muted small">
                    Windows lässt die Mediensteuerung auf diesem PC gerade nicht zu, etwa wegen einer Sicherheitsrichtlinie oder eines Virenscanners. Alles andere läuft wie gewohnt.
                    ToDoMe. versucht es mit der nächsten Version oder in einer Woche still noch einmal.
                  </p>
                }
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

const XMAS: Array<[Settings['appearance']['xmas'], string]> = [
  ['off', 'Aus'],
  ['december', '1. bis 26. Dezember'],
  ['always', 'Immer'],
];

/** Seasonal magic and the focus styles. */
export function MoodSection() {
  const services = useServices();
  const a = useAppState().settings.appearance;
  const setA = (patch: Partial<Settings['appearance']>) => services.store.dispatch({ type: 'settings/update', patch: { appearance: { ...a, ...patch } } });
  return (
    <section>
      <h3>Stimmung & Fokus</h3>
      <p className="settings__label">Winterzauber</p>
      <div className="segmented" role="radiogroup" aria-label="Winterzauber">
        {XMAS.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={a.xmas === id} className={a.xmas === id ? 'is-on' : ''} onClick={() => setA({ xmas: id })}>
            {label}
          </button>
        ))}
      </div>
      <small className="hint">Leise Schneeflocken, warme Lichter oben am Rand und ein adventlicher Gruß. Ganz dezent.</small>
      <p className="settings__label">Fokus-Stil, während ein Block läuft</p>
      <div className="focus-styles" role="radiogroup" aria-label="Fokus-Stil">
        {FOCUS_STYLES.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={a.focusStyle === f.id} className={`layout-opt focus-style-opt${a.focusStyle === f.id ? ' is-on' : ''}`} onClick={() => setA({ focusStyle: f.id })}>
            <span className={`focus-style-opt__preview focus-style-opt__preview--${f.id}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>{f.label}</strong>
            <span>
              {f.level}. {f.text}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Ambience sound: switch and a calm volume slider (settles after a moment, no stutter). */
export function AmbienceSoundField() {
  const services = useServices();
  const a = useAppState().settings.appearance;
  const setA = (patch: Partial<Settings['appearance']>) => services.store.dispatch({ type: 'settings/update', patch: { appearance: { ...a, ...patch } } });
  const [local, setLocal] = useState(Math.round(a.soundVolume * 100));
  const timer = useRef<number | null>(null);
  useEffect(() => setLocal(Math.round(a.soundVolume * 100)), [a.soundVolume]);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const silent = a.ambience === 'none';
  return (
    <div className="sound-field">
      <label className="check">
        <input type="checkbox" checked={a.sound} onChange={(e) => setA({ sound: e.target.checked })} />
        <span>Klang der Atmosphäre: leiser Regen, Wind, Schneestille oder raschelndes Laub</span>
      </label>
      {a.sound && (
        <label className="field sound-field__volume">
          <span>Lautstärke {local} %</span>
          <input
            type="range"
            className="range"
            min={0}
            max={100}
            step={1}
            value={local}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLocal(v);
              // Heard at once, saved once the slider rests.
              setSoundVolume(v / 100);
              if (timer.current) window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => setA({ soundVolume: v / 100 }), 160);
            }}
          />
        </label>
      )}
      {a.sound && silent && <small className="hint">Wähle oben eine Atmosphäre, dann ist sie auch zu hören.</small>}
    </div>
  );
}

const TIMELINES: Array<{ id: TimelineStyle; label: string; text: string }> = [
  { id: 'wave', label: 'Sanfte Welle', text: 'Ruhig fließend, atmet leise mit' },
  { id: 'bar', label: 'Minimaler Balken', text: 'Ein stiller Glasbalken, ganz ohne Bewegung' },
  { id: 'beads', label: 'Perlenkette', text: 'Die klassischen Punkte, Perle für Perle' },
];

/** How a running block shows its progress in the focus card. */
export function TimelineStyleField() {
  const services = useServices();
  const a = useAppState().settings.appearance;
  return (
    <>
      <p className="settings__label">Stil der Zeitlinie</p>
      <div className="timeline-opts" role="radiogroup" aria-label="Stil der Zeitlinie">
        {TIMELINES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={a.timeline === t.id}
            className={`layout-opt timeline-opt${a.timeline === t.id ? ' is-on' : ''}`}
            onClick={() => services.store.dispatch({ type: 'settings/update', patch: { appearance: { ...a, timeline: t.id } } })}
          >
            <span className="timeline-opt__preview" aria-hidden="true">
              <FocusProgress style={t.id} progress={0.62} plannedMin={60} doneMin={37} still={t.id !== 'wave'} />
            </span>
            <strong>{t.label}</strong>
            <span>{t.text}</span>
            {t.id === 'wave' && <span className="layout-opt__badge">Standard</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/** "Wie tickt dein Kopf am liebsten?" – the brain profile, changeable any time. */
export function BrainSection() {
  const services = useServices();
  const st = useAppState().settings;
  const choose = (id: BrainProfile | null) => {
    if (id === null) return services.store.dispatch({ type: 'settings/update', patch: { brain: null, oneStep: false } });
    services.store.dispatch({ type: 'settings/update', patch: brainPatch(st, id) });
  };
  return (
    <section>
      <h3>Wie tickt dein Kopf am liebsten?</h3>
      <p className="muted small">Keine Diagnose, nur ein Startpunkt. ToDoMe. passt Ansicht, Blöcke und Nachfragen daran an.</p>
      <BrainPicker value={st.brain} onChange={choose} />
      <button type="button" className="link-btn brain__none" onClick={() => choose(null)} aria-pressed={st.brain === null}>
        {st.brain === null ? 'Kein Profil gewählt' : 'Ohne Profil weiter'}
      </button>
      <label className="check">
        <input type="checkbox" checked={st.oneStep} onChange={(e) => services.store.dispatch({ type: 'settings/update', patch: { oneStep: e.target.checked } })} />
        <span>Nur den einen nächsten Schritt zeigen, „Danach“ bleibt eingeklappt</span>
      </label>
    </section>
  );
}

/** The four brain profiles as calm cards (also used in the onboarding). */
export function BrainPicker({ value, onChange }: { value: BrainProfile | null; onChange: (id: BrainProfile) => void }) {
  return (
    <div className="brains" role="radiogroup" aria-label="Wie tickt dein Kopf am liebsten?">
      {BRAIN_PROFILES.map((b) => (
        <button key={b.id} type="button" role="radio" aria-checked={value === b.id} className={`brain${value === b.id ? ' is-on' : ''}`} onClick={() => onChange(b.id)}>
          <strong>{b.label}</strong>
          <span className="brain__feel">{b.feel}</span>
          <ul>
            {b.does.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </button>
      ))}
    </div>
  );
}
