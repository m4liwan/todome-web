import { useCallback, useEffect, useRef, useState } from 'react';
import { desktop, type UpdateState } from '../lib/desktop';
import { useServices } from './services';

const ANNOUNCED_KEY = 'todome:update-announced';

const named = (u: UpdateState) => (u.version ? `Version ${u.version}` : 'Die neue Version');

/** One calm sentence about the update state (no alarm, no countdown). */
export function updateLine(u: UpdateState | null): string {
  if (!u || u.status === 'disabled') return 'Diese Version bekommt keine automatischen Updates. Neue Versionen kommen per Installer.';
  switch (u.status) {
    case 'checking':
      return 'Sucht nach einer neuen Version …';
    case 'none':
      return 'Du bist auf dem neuesten Stand.';
    case 'downloading':
      return `${named(u)} wird im Hintergrund geladen${typeof u.percent === 'number' ? ` (${u.percent} %)` : ''}.`;
    case 'ready':
      return `${named(u)} ist bereit. Sie wird beim nächsten Beenden installiert, oder gleich mit einem Neustart.`;
    case 'error':
      return 'Der Update-Server ist gerade nicht erreichbar. ToDoMe. versucht es später noch einmal.';
    default:
      return u.auto ? 'ToDoMe. sucht im Hintergrund ab und zu nach einer neuen Version.' : 'Die automatische Suche ist aus. Du kannst jederzeit selbst nachsehen.';
  }
}

/** Update state for the settings sheet. In the browser preview it stays 'disabled'. */
export function useUpdates() {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    desktop
      .updateState()
      .then((s) => alive && setState(s))
      .catch(() => undefined);
    const off = desktop.onUpdate((s) => alive && setState(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  const check = useCallback(() => {
    void desktop?.updateCheck().then(setState).catch(() => undefined);
  }, []);
  const setAuto = useCallback((auto: boolean) => {
    void desktop?.updateSetAuto(auto).then(setState).catch(() => undefined);
  }, []);
  const install = useCallback(() => desktop?.updateInstall(), []);
  return { state, check, setAuto, install };
}

/**
 * Says once per version, quietly, that an update is ready. Only when the
 * companion is off: otherwise the companion offers the restart
 * (useUpdateCompanion in app/companion.ts).
 */
export function useUpdateNotice(): void {
  const services = useServices();
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (!desktop) return;
    return desktop.onUpdate((s) => {
      if (s.status !== 'ready' || !s.version || said.current === s.version) return;
      if (services.store.getState().settings.companion.enabled) return;
      said.current = s.version;
      try {
        if (window.localStorage.getItem(ANNOUNCED_KEY) === s.version) return;
        window.localStorage.setItem(ANNOUNCED_KEY, s.version);
      } catch {
        /* say it anyway */
      }
      services.announce(`Version ${s.version} ist bereit und wird beim nächsten Beenden installiert.`);
    });
  }, [services]);
}
