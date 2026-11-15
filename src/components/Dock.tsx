import type { CSSProperties, ReactNode } from 'react';
import { useServices } from '../app/services';
import type { OpenModal } from '../app/modal';
import { toggledAmbient } from '../app/theme';
import { uiSound } from '../app/uiSound';
import { DEFAULT_APPEARANCE } from '../state/defaults';
import type { AppState } from '../domain/types';
import { contextLabels } from '../domain/userContext';
import { dayKey } from '../lib/time';
import { IconBell, IconBellOff, IconChart, IconCompanion, IconHome, IconMoon, IconPlay, IconSettings, IconSun, IconSunset } from './icons';
import { LevelBadge } from './LevelBadge';
import { Logo } from './Logo';
import type { View } from './Topbar';

interface Props {
  state: AppState;
  view: View;
  onView: (v: View) => void;
  onOpen: OpenModal;
  /** Second shift: back to focus after the day end, today's results stay. */
  onResume: () => void;
}

const STATIONS: Array<{ id: Exclude<View, 'closing'>; label: string; icon: ReactNode }> = [
  { id: 'today', label: 'Heute', icon: <IconHome size={20} /> },
  { id: 'times', label: 'Rückblick', icon: <IconChart size={20} /> },
  { id: 'companion', label: 'Begleiter', icon: <IconCompanion size={20} /> },
];

/**
 * The floating dock: one calm bar, inset from the window edge, on the side the
 * user chose (left by default). Icons only; each name slides out on hover or
 * keyboard focus. Wordmark, the three views and the day end on one side, the
 * tools (do-not-disturb, light, settings) on the other. A soft lens glides to
 * the current view.
 */
export function Dock({ state, view, onView, onOpen, onResume }: Props) {
  const { store, clock } = useServices();
  const labels = contextLabels(state.settings.userContext);
  const dnd = state.settings.doNotDisturb;
  const appearance = state.settings.appearance;
  const lit = appearance.ambient > 0;
  const closedToday = state.coach.closedDay === dayKey(clock.now());
  const set = (patch: Partial<AppState['settings']>) => store.dispatch({ type: 'settings/update', patch });
  const at = view === 'closing' ? STATIONS.length : STATIONS.findIndex((s) => s.id === view);

  const item = (key: string, label: string, icon: ReactNode, props: { onClick: () => void; current?: boolean; pressed?: boolean; name?: string; className?: string }, extra?: ReactNode) => (
    <button
      key={key}
      type="button"
      className={`dock__item${props.className ? ` ${props.className}` : ''}`}
      aria-current={props.current ? 'page' : undefined}
      aria-pressed={props.pressed}
      aria-label={props.name}
      onClick={props.onClick}
    >
      {icon}
      <span className="dock__label" aria-hidden={props.name ? true : undefined}>
        {label}
      </span>
      {extra}
    </button>
  );

  return (
    <nav className="dock" aria-label="Navigation">
      <div className="dock__brand" aria-hidden="true">
        <Logo className="logo" height={9} />
      </div>

      <div className="dock__stations" style={{ '--at': at } as CSSProperties}>
        {at >= 0 && <span className="dock__lens" aria-hidden="true" />}
        {STATIONS.map((s) =>
          item(s.id, s.label, s.icon, { onClick: () => onView(s.id), current: view === s.id }, s.id === 'companion' && <LevelBadge level={state.progression.stats.level} />),
        )}
        {closedToday
          ? item('resume', 'Fokus wieder aufnehmen', <IconPlay size={18} />, {
              className: 'dock__item--closing',
              onClick: () => {
                uiSound(state, 'bloom');
                onResume();
              },
            })
          : item('closing', labels.dayEnd, <IconSunset size={20} />, {
              className: 'dock__item--closing',
              current: view === 'closing',
              onClick: () => {
                if (view !== 'closing') uiSound(state, 'bloom');
                onView('closing');
              },
            })}
      </div>

      <span className="dock__sep" aria-hidden="true" />

      <div className="dock__tools" role="group" aria-label="Schnellzugriff">
        {item('dnd', dnd ? 'Stumm: keine Nachfragen, kein Besuch' : 'Stumm schalten', dnd ? <IconBellOff size={19} /> : <IconBell size={19} />, {
          name: dnd ? 'Stumm ist an' : 'Stumm schalten',
          pressed: dnd,
          onClick: () => set({ doNotDisturb: !dnd }),
        })}
        {item('light', lit ? 'Licht dimmen' : 'Licht an', lit ? <IconMoon size={19} /> : <IconSun size={19} />, {
          name: lit ? 'Licht dimmen' : 'Licht an',
          pressed: !lit,
          onClick: () => set({ appearance: { ...appearance, ambient: toggledAmbient(appearance.ambient, DEFAULT_APPEARANCE.ambient) } }),
        })}
        {item('settings', 'Einstellungen', <IconSettings size={19} />, { name: 'Einstellungen', onClick: () => onOpen({ kind: 'settings' }) })}
      </div>
    </nav>
  );
}
