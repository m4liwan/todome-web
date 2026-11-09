import { createContext, useContext } from 'react';
import type { Clock } from '../lib/clock';
import type { CommandResult, Deps } from '../state/commands';
import type { Store } from '../state/store';
import type { ToastAction } from '../lib/toasts';

export type AppMode = 'live' | 'demo';

export interface Services {
  store: Store;
  clock: Clock;
  mode: AppMode;
  deps(): Deps;
  /** Runs a command; on failure the error is announced. Returns success. */
  run(result: CommandResult): boolean;
  /** A short toast plus the screen reader live region; `action` adds a button (e.g. "Rückgängig"). */
  announce(message: string, action?: ToastAction): void;
  resetData(): void;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('ServicesContext missing');
  return s;
}
