import type { ReactNode } from 'react';
import markSrc from '../assets/logo-mark.png';
import { useServices } from '../app/services';
import type { OpenModal } from '../app/modal';
import { toggledAmbient } from '../app/theme';
import { uiSound } from '../app/uiSound';
import { DEFAULT_APPEARANCE } from '../state/defaults';
import type { AppState } from '../domain/types';
import { contextLabels } from '../domain/userContext';
import { dayKey } from '../lib/time';
import { IconBell, IconBellOff, IconCalendar, IconChart, IconCompanion, IconHome, IconMoon, IconPlay, IconSettings, IconSun, IconSunset } from './icons';
import { PillNav, type PillNavItem } from './PillNav';
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
  { id: 'today', label: 'Heute', icon: <IconHome size={18} /> },
  { id: 'horizon', label: 'Horizont', icon: <IconCalendar size={18} /> },
  { id: 'times', label: 'Rückblick', icon: <IconChart size={18} /> },
  { id: 'companion', label: 'Begleiter', icon: <IconCompanion size={18} /> },
];

/** "Me." in the logo slot: the wordmark's last syllable, its dot in the light colour. */
function Mark() {
  return (
    <span className="dock__mark">
      <img src={markSrc} alt="" draggable={false} />
      <span className="dock__mark-dot" />
    </span>
  );
}

/**
 * The main navigation: one bar, top centre by default (or bottom centre),
 * the ToDoMe mark in the slot on its left. The views carry their names; the
 * day end closes the row as the softly lit anchor of the day. The tools
 * (do-not-disturb, light, settings) sit in their own small slot after it.
 */
export function Dock({ state, view, onView, onOpen, onResume }: Props) {
  const { store, clock } = useServices();
  const labels = contextLabels(state.settings.userContext);
  const dnd = state.settings.doNotDisturb;
  const appearance = state.settings.appearance;
  const lit = appearance.ambient > 0;
  const closedToday = state.coach.closedDay === dayKey(clock.now());
  const set = (patch: Partial<AppState['settings']>) => store.dispatch({ type: 'settings/update', patch });

  const items: PillNavItem[] = [
    ...STATIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
    closedToday ? { id: 'resume', label: 'Fokus wieder aufnehmen', icon: <IconPlay size={16} />, anchor: true } : { id: 'closing', label: labels.dayEnd, icon: <IconSunset size={18} />, anchor: true },
  ];

  const select = (item: PillNavItem) => {
    if (item.id === 'resume') {
      uiSound(state, 'bloom');
      onResume();
      return;
    }
    if (item.id === 'closing' && view !== 'closing') uiSound(state, 'bloom');
    onView(item.id as View);
  };

  const tool = (key: string, label: string, icon: ReactNode, props: { onClick: () => void; pressed?: boolean; name: string }) => (
    <button key={key} type="button" className="dock__tool" aria-pressed={props.pressed} aria-label={props.name} onClick={props.onClick}>
      {icon}
      <span className="dock__label" aria-hidden="true">
        {label}
      </span>
    </button>
  );

  return (
    <div className="dock">
      <PillNav
        className="dock__nav"
        logo={<Mark />}
        items={items}
        activeId={view}
        onSelect={select}
        placement={appearance.dock === 'bottom' ? 'above' : 'below'}
        end={
          <div className="dock__tools" role="group" aria-label="Schnellzugriff">
            {tool('dnd', dnd ? 'Stumm: keine Nachfragen, kein Besuch' : 'Stumm schalten', dnd ? <IconBellOff size={17} /> : <IconBell size={17} />, {
              name: dnd ? 'Stumm ist an' : 'Stumm schalten',
              pressed: dnd,
              onClick: () => set({ doNotDisturb: !dnd }),
            })}
            {tool('light', lit ? 'Licht dimmen' : 'Licht an', lit ? <IconMoon size={17} /> : <IconSun size={17} />, {
              name: lit ? 'Licht dimmen' : 'Licht an',
              pressed: !lit,
              onClick: () => set({ appearance: { ...appearance, ambient: toggledAmbient(appearance.ambient, DEFAULT_APPEARANCE.ambient) } }),
            })}
            {tool('settings', 'Einstellungen', <IconSettings size={17} />, { name: 'Einstellungen', onClick: () => onOpen({ kind: 'settings' }) })}
          </div>
        }
      />
    </div>
  );
}
