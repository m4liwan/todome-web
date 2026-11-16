import { useAppState } from '../../app/hooks';
import { useServices } from '../../app/services';
import { MAX_ORB_ITEMS, MIN_ORB_ITEMS, QUICK_SHORTCUTS, quickShortcut, type ShortcutGroup } from '../../domain/quickOrb';
import type { QuickOrbSettings } from '../../domain/types';
import { DEFAULT_QUICK_ORB } from '../../state/defaults';
import { ShortcutGlyph } from '../QuickOrb';

const GROUPS: ShortcutGroup[] = ['Licht & Look', 'Atmosphäre', 'Lichtfarbe', 'Raum'];

/**
 * "Schnellzugriff": switch the floating orb on and choose its 2–4 shortcuts.
 * The order of the choice is the order in the orb.
 */
export function QuickOrbSection() {
  const services = useServices();
  const orb = useAppState().settings.quickOrb;
  const setOrb = (patch: Partial<QuickOrbSettings>) => services.store.dispatch({ type: 'settings/update', patch: { quickOrb: { ...orb, ...patch } } });
  const full = orb.items.length >= MAX_ORB_ITEMS;

  const toggle = (id: string) => {
    if (orb.items.includes(id)) {
      // Two stay at least: an orb with one switch is just a button.
      if (orb.items.length <= MIN_ORB_ITEMS) return services.announce(`Mindestens ${MIN_ORB_ITEMS} Schalter bleiben im Schnellzugriff.`);
      return setOrb({ items: orb.items.filter((i) => i !== id) });
    }
    if (full) return services.announce(`Höchstens ${MAX_ORB_ITEMS} Schalter. Nimm erst einen heraus.`);
    setOrb({ items: [...orb.items, id] });
  };

  return (
    <>
      <section aria-labelledby="settings-orb">
        <h3 id="settings-orb">Schwebender Schnellzugriff</h3>
        <p className="muted small">
          Ein kleiner, leuchtender Punkt auf deiner Startseite. Ein Klick fächert deine Lieblings-Schalter kreisförmig um ihn auf, ziehen verschiebt ihn, wohin du willst.
        </p>
        <label className="switch-row">
          <span className="switch-row__text">
            <strong>Schnellzugriff zeigen</strong>
            <span className="muted small">Mit der Tastatur: Punkt anwählen, Pfeiltasten verschieben ihn, Enter öffnet.</span>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={orb.enabled} aria-checked={orb.enabled} onChange={(e) => setOrb({ enabled: e.target.checked })} />
        </label>
        <div className="orb-preview" aria-label="Deine Auswahl">
          <span className="orb-preview__dot" aria-hidden="true" />
          <ol className="orb-preview__list">
            {orb.items.map((id, i) => {
              const q = quickShortcut(id);
              return q ? (
                <li key={id} style={{ ['--i' as string]: i }}>
                  <ShortcutGlyph shortcut={q} />
                  {q.label}
                </li>
              ) : null;
            })}
          </ol>
          <span className="orb-preview__count muted small">
            {orb.items.length} von {MAX_ORB_ITEMS}
          </span>
        </div>
        <div className="row">
          <button type="button" className="btn btn--small btn--quiet" onClick={() => setOrb({ x: DEFAULT_QUICK_ORB.x, y: DEFAULT_QUICK_ORB.y })}>
            Punkt zurück an seinen Platz
          </button>
        </div>
      </section>
      <section aria-labelledby="settings-orb-pick">
        <h3 id="settings-orb-pick">Was liegt darin?</h3>
        <p className="muted small">
          Wähle {MIN_ORB_ITEMS} bis {MAX_ORB_ITEMS} Schalter. Die Reihenfolge deiner Wahl ist die Reihenfolge im Punkt.
        </p>
        {GROUPS.map((group) => (
          <div key={group} className="orb-pick">
            <p className="settings__label">{group}</p>
            <div className="orb-pick__list" role="group" aria-label={group}>
              {QUICK_SHORTCUTS.filter((q) => q.group === group).map((q) => {
                const on = orb.items.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`orb-pick__opt${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    aria-disabled={(!on && full) || undefined}
                    onClick={() => toggle(q.id)}
                  >
                    <ShortcutGlyph shortcut={q} />
                    {q.label}
                    {on && <span className="orb-pick__n">{orb.items.indexOf(q.id) + 1}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
