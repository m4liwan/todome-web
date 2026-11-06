import { useServices } from '../app/services';
import { uiSound } from '../app/uiSound';
import type { OpenModal } from '../app/modal';
import { switchTheme, useResolvedTheme } from '../app/theme';
import type { AppState } from '../domain/types';
import { desktop } from '../lib/desktop';
import { dayKey } from '../lib/time';
import { IconBell, IconBellOff, IconMoon, IconPlay, IconSettings, IconSun } from './icons';
import { Logo } from './Logo';
import { MediaControl } from './MediaControl';
import { contextLabels } from '../domain/userContext';

export type View = 'today' | 'times' | 'closing';

interface Props {
  state: AppState;
  view: View;
  onView: (v: View) => void;
  onOpen: OpenModal;
  /** Second shift: back to focus after Feierabend, today's results stay. */
  onResume: () => void;
}

/**
 * Header in three equal columns: logo left, "Heute / Rückblick" in the exact
 * centre, the tools (one glass pill) and the main action right.
 */
export function Topbar({ state, view, onView, onOpen, onResume }: Props) {
  const labels = contextLabels(state.settings.userContext);
  const { store, mode, clock } = useServices();
  const dnd = state.settings.doNotDisturb;
  const theme = useResolvedTheme(state.settings.theme);
  const closedToday = state.coach.closedDay === dayKey(clock.now());
  const showMedia = Boolean(desktop) && state.settings.media.enabled && state.settings.media.inTopbar;
  const set = (patch: Partial<AppState['settings']>) => store.dispatch({ type: 'settings/update', patch });

  return (
    <header className="topbar-wrap">
      <div className="topbar">
        <div className="topbar__brand">
          <Logo className="logo" height={22} />
          {showMedia && <MediaControl />}
          {mode === 'demo' && (
            <span className="tag tag--lime" title="Entwickler-Vorschau mit Beispieldaten">
              Demo {clock.speed}×
            </span>
          )}
        </div>

        <nav className="segnav" aria-label="Ansicht" data-active={view === 'times' ? 1 : view === 'today' ? 0 : -1}>
          <span className="segnav__pill" aria-hidden="true" />
          <button type="button" className={view === 'today' ? 'is-active' : ''} aria-current={view === 'today' ? 'page' : undefined} onClick={() => onView('today')}>
            Heute
          </button>
          <button type="button" className={view === 'times' ? 'is-active' : ''} aria-current={view === 'times' ? 'page' : undefined} onClick={() => onView('times')}>
            Rückblick
          </button>
        </nav>

        <div className="topbar__actions">
          <div className="tool-pill" role="group" aria-label="Schnellzugriff">
            <button
              type="button"
              className={`tool-pill__btn${dnd ? ' is-on' : ''}`}
              aria-pressed={dnd}
              aria-label={dnd ? 'Stumm ist an' : 'Stumm schalten'}
              title={dnd ? 'Stumm: keine Nachfragen, kein Besuch' : 'Stumm schalten (z. B. während eines Calls)'}
              onClick={() => set({ doNotDisturb: !dnd })}
            >
              {dnd ? <IconBellOff size={18} /> : <IconBell size={18} />}
            </button>
            <button
              type="button"
              className="tool-pill__btn"
              aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
              title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
              onClick={(e) => {
                const next = theme === 'dark' ? 'light' : 'dark';
                const r = e.currentTarget.getBoundingClientRect();
                switchTheme(next, () => set({ theme: next }), { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
            >
              {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
            <button type="button" className="tool-pill__btn" aria-label="Einstellungen" title="Einstellungen" onClick={() => onOpen({ kind: 'settings' })}>
              <IconSettings size={18} />
            </button>
          </div>

          {closedToday ? (
            <button
              type="button"
              className="glass-cta topbar__main"
              onClick={() => {
                uiSound(state, 'bloom');
                onResume();
              }}
              title="Zweite Schicht: zurück in den Fokus. Alles von heute bleibt gezählt.">
              <IconPlay size={14} />
              <span className="lbl-long">Fokus wieder aufnehmen</span>
              <span className="lbl-short">Fokus</span>
            </button>
          ) : (
            <button
              type="button"
              className={`glass-cta topbar__main${view === 'closing' ? ' is-current' : ''}`}
              aria-current={view === 'closing' ? 'page' : undefined}
              onClick={() => {
                if (view !== 'closing') uiSound(state, 'bloom');
                onView('closing');
              }}
            >
              {labels.dayEnd}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
