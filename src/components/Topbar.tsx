import { useServices } from '../app/services';
import { uiSound } from '../app/uiSound';
import type { OpenModal } from '../app/modal';
import type { AppState } from '../domain/types';
import { desktop } from '../lib/desktop';
import { dayKey, formatDate } from '../lib/time';
import { IconPlay } from './icons';
import { Logo } from './Logo';
import { MediaControl } from './MediaControl';
import { contextLabels } from '../domain/userContext';

export type View = 'today' | 'times' | 'companion' | 'closing';

const VIEW_LABEL: Record<View, string> = { today: 'Heute', times: 'Rückblick', companion: 'Begleiter', closing: 'Feierabend' };

interface Props {
  state: AppState;
  view: View;
  onView: (v: View) => void;
  onOpen: OpenModal;
  /** Second shift: back to focus after Feierabend, today's results stay. */
  onResume: () => void;
}

/**
 * The slim header (the window's drag strip): the wordmark over the rail,
 * where you are and which day it is, then media and the one main action
 * (Feierabend, or "Fokus wieder aufnehmen" once the day is closed).
 * Navigation and tools live in the rail.
 */
export function Topbar({ state, view, onView, onResume }: Props) {
  const labels = contextLabels(state.settings.userContext);
  const { mode, clock } = useServices();
  const today = dayKey(clock.now());
  const closedToday = state.coach.closedDay === today;
  const showMedia = Boolean(desktop) && state.settings.media.enabled && state.settings.media.inTopbar;

  return (
    <header className="topbar-wrap">
      <div className="topbar">
        <div className="topbar__brand">
          <Logo className="logo" height={10} />
        </div>

        <p className="topbar__where">
          <span className="label topbar__view">{VIEW_LABEL[view]}</span>
          <span className="topbar__date">{formatDate(today)}</span>
        </p>

        <div className="topbar__actions">
          {showMedia && <MediaControl />}
          {mode === 'demo' && (
            <span className="tag" title="Entwickler-Vorschau mit Beispieldaten">
              Demo {clock.speed}×
            </span>
          )}
          {closedToday ? (
            <button
              type="button"
              className="btn btn--primary btn--small topbar__main"
              onClick={() => {
                uiSound(state, 'bloom');
                onResume();
              }}
              title="Zweite Schicht: zurück in den Fokus. Alles von heute bleibt gezählt."
            >
              <IconPlay size={12} />
              <span className="lbl-long">Fokus wieder aufnehmen</span>
              <span className="lbl-short">Fokus</span>
            </button>
          ) : (
            <button
              type="button"
              className={`btn btn--small topbar__main${view === 'closing' ? ' is-current' : ' btn--primary'}`}
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
