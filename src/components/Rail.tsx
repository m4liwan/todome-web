import type { ReactNode } from 'react';
import { useServices } from '../app/services';
import type { OpenModal } from '../app/modal';
import { toggledAmbient } from '../app/theme';
import { DEFAULT_APPEARANCE } from '../state/defaults';
import type { AppState } from '../domain/types';
import { IconBell, IconBellOff, IconChart, IconCompanion, IconHome, IconMoon, IconSettings, IconSun } from './icons';
import { LevelBadge } from './LevelBadge';
import type { View } from './Topbar';

interface Props {
  state: AppState;
  view: View;
  onView: (v: View) => void;
  onOpen: OpenModal;
}

const STATIONS: Array<{ id: Exclude<View, 'closing'>; label: string; icon: ReactNode }> = [
  { id: 'today', label: 'Heute', icon: <IconHome size={20} /> },
  { id: 'times', label: 'Rückblick', icon: <IconChart size={20} /> },
  { id: 'companion', label: 'Begleiter', icon: <IconCompanion size={20} /> },
];

/**
 * The quiet icon rail on the left: the three views on top, the tools
 * (do-not-disturb, light, settings) at the bottom. Every icon carries its
 * name as a tooltip, which is also its accessible name.
 */
export function Rail({ state, view, onView, onOpen }: Props) {
  const { store } = useServices();
  const dnd = state.settings.doNotDisturb;
  const appearance = state.settings.appearance;
  const lit = appearance.ambient > 0;
  const set = (patch: Partial<AppState['settings']>) => store.dispatch({ type: 'settings/update', patch });
  const index = STATIONS.findIndex((s) => s.id === view);

  return (
    <nav className="rail" aria-label="Ansicht">
      <div className="rail__stations">
        {index >= 0 && <span className="rail__mark" aria-hidden="true" style={{ transform: `translateY(${index * 100}%)` }} />}
        {STATIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="rail__item"
            aria-current={view === s.id ? 'page' : undefined}
            onClick={() => onView(s.id)}
          >
            {s.icon}
            <span className="rail__tip">{s.label}</span>
            {s.id === 'companion' && <LevelBadge level={state.progression.stats.level} />}
          </button>
        ))}
      </div>

      <div className="rail__tools" role="group" aria-label="Schnellzugriff">
        <button
          type="button"
          className="rail__item"
          aria-pressed={dnd}
          aria-label={dnd ? 'Stumm ist an' : 'Stumm schalten'}
          onClick={() => set({ doNotDisturb: !dnd })}
        >
          {dnd ? <IconBellOff size={19} /> : <IconBell size={19} />}
          <span className="rail__tip" aria-hidden="true">
            {dnd ? 'Stumm: keine Nachfragen, kein Besuch' : 'Stumm schalten'}
          </span>
        </button>
        <button
          type="button"
          className="rail__item"
          aria-pressed={!lit}
          aria-label={lit ? 'Licht dimmen' : 'Licht an'}
          onClick={() => set({ appearance: { ...appearance, ambient: toggledAmbient(appearance.ambient, DEFAULT_APPEARANCE.ambient) } })}
        >
          {lit ? <IconMoon size={19} /> : <IconSun size={19} />}
          <span className="rail__tip" aria-hidden="true">
            {lit ? 'Licht dimmen' : 'Licht an'}
          </span>
        </button>
        <button type="button" className="rail__item" aria-label="Einstellungen" onClick={() => onOpen({ kind: 'settings' })}>
          <IconSettings size={19} />
          <span className="rail__tip" aria-hidden="true">
            Einstellungen
          </span>
        </button>
      </div>
    </nav>
  );
}
