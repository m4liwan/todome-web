import type { AppearanceSettings, AppState } from '../domain/types';
import type { KeyValueStore } from '../lib/storage';
import type { CommandResult } from './commands';
import { normalizeUserContext } from '../domain/userContext';
import { DEFAULT_APPEARANCE, DEFAULT_COMPANION, DEFAULT_MEDIA, DEFAULT_OVERLAY, DEFAULT_SETTINGS, DEFAULT_WELLBEING, emptyState } from './defaults';
import type { Task } from '../domain/types';
import { normalizeAvatar } from '../domain/companion';
import { sanitizeProgression } from '../domain/companionProgression';
import { reduceAll, type Action } from './reducer';

export interface Store {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  dispatch(actions: Action | readonly Action[]): void;
  /** Dispatches a command's actions if it succeeded; returns the result unchanged. */
  run<T extends CommandResult>(result: T): T;
  flush(): void;
  /** Stops all persistence (used right before a data reset reloads the page). */
  disablePersistence(): void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Parses persisted state. Unknown or broken payloads are rejected; older
 * schema versions are migrated; missing fields get defaults.
 *  v1 → v2: task priority, theme, companion, location, wellbeing, weather.
 *  v2 → v3: appearance (palette, ambience), overlay, energy, water log, proud notes.
 */
/** Colour worlds retired in 1.4 map to their closest successor. */
const RETIRED_PALETTES: Record<string, AppearanceSettings['palette']> = { solaris: 'sunset', moss: 'lime' };
const PALETTES = new Set(['lime', 'rose', 'ocean', 'sunset', 'lavender', 'neon', 'pulse', 'matrix']);

function migrateAppearance(raw: unknown): AppearanceSettings {
  const a = { ...DEFAULT_APPEARANCE, ...(isRecord(raw) ? (raw as Partial<AppearanceSettings>) : {}) };
  // 1.9: the quiet focus switch became the "Schwebender Tunnel" focus style.
  const legacy = isRecord(raw) ? (raw as Record<string, unknown>) : {};
  if (!('focusStyle' in legacy)) a.focusStyle = legacy.silentFocus === true ? 'tunnel' : 'breathe';
  delete (a as Partial<AppearanceSettings> & { silentFocus?: boolean }).silentFocus;
  // Data from before layouts existed always looked "classic"; keep that look.
  if (!isRecord(raw) || !('layout' in raw)) a.layout = 'classic';
  const p = String(a.palette);
  a.palette = RETIRED_PALETTES[p] ?? (PALETTES.has(p) ? a.palette : 'lime');
  // 2.x: level effects arrive switched on; only a real choice survives.
  if (typeof a.companionFx !== 'boolean') a.companionFx = DEFAULT_APPEARANCE.companionFx;
  return a;
}

/**
 * Overlay and media. 1.7 moves the player off the home screen by default and
 * keeps it in the mini overlay; applied once (media.rev), later choices stay.
 */
function migrateMedia(settings: Partial<AppState['settings']>): Pick<AppState['settings'], 'overlay' | 'media'> {
  const rawOverlay: Record<string, unknown> = isRecord(settings.overlay) ? settings.overlay : {};
  const rawModules: Record<string, unknown> = isRecord(rawOverlay.modules) ? rawOverlay.modules : {};
  const pick = <T,>(value: unknown, fallback: T): T => (typeof value === typeof fallback ? (value as T) : fallback);
  // Only known keys survive (retired options such as "compact" or the mini timeline drop out).
  const overlay: AppState['settings']['overlay'] = {
    enabled: pick(rawOverlay.enabled, DEFAULT_OVERLAY.enabled),
    opacity: pick(rawOverlay.opacity, DEFAULT_OVERLAY.opacity),
    glow: pick(rawOverlay.glow, DEFAULT_OVERLAY.glow),
    avatarSize: (['small', 'medium', 'large'] as const).find((v) => v === rawOverlay.avatarSize) ?? DEFAULT_OVERLAY.avatarSize,
    modules: {
      avatar: pick(rawModules.avatar, DEFAULT_OVERLAY.modules.avatar),
      anchor: pick(rawModules.anchor, DEFAULT_OVERLAY.modules.anchor),
      progress: pick(rawModules.progress, DEFAULT_OVERLAY.modules.progress),
      media: pick(rawModules.media, DEFAULT_OVERLAY.modules.media),
    },
  };
  const media = { ...DEFAULT_MEDIA, ...(isRecord(settings.media) ? settings.media : {}) };
  if (!isRecord(settings.media) || settings.media.rev !== DEFAULT_MEDIA.rev) {
    media.inTopbar = false;
    media.rev = DEFAULT_MEDIA.rev;
    overlay.modules = { ...overlay.modules, media: true };
  }
  return { overlay, media };
}

/** The schema this build writes. Data with a higher version comes from a newer ToDoMe. */
export const CURRENT_SCHEMA = 4;

/** Keeps only object entries: one broken record never costs the rest (or crashes a view). */
function records<T>(raw: unknown): Record<string, T> {
  if (!isRecord(raw)) return {};
  const out: Record<string, T> = {};
  for (const [id, v] of Object.entries(raw)) if (isRecord(v)) out[id] = v as T;
  return out;
}

export type StateCheck =
  | { status: 'empty' }
  | { status: 'ok'; state: AppState }
  /** Stored data this build cannot read (broken JSON, unknown shape). */
  | { status: 'unreadable' }
  /** Written by a newer ToDoMe (e.g. after a manual downgrade). */
  | { status: 'newer'; version: number };

/**
 * Like parseState, but says why stored data could not be read. The app never
 * overwrites data in the 'unreadable' or 'newer' state (see main.tsx).
 */
export function inspectState(raw: string | null): StateCheck {
  if (!raw) return { status: 'empty' };
  const state = parseState(raw);
  if (state) return { status: 'ok', state };
  try {
    const data: unknown = JSON.parse(raw);
    if (isRecord(data) && typeof data.schemaVersion === 'number' && data.schemaVersion > CURRENT_SCHEMA) {
      return { status: 'newer', version: data.schemaVersion };
    }
  } catch {
    /* not even JSON */
  }
  return { status: 'unreadable' };
}

export function parseState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || ![1, 2, 3, 4].includes(data.schemaVersion as number)) return null;
    const base = emptyState();
    const coach = isRecord(data.coach) ? data.coach : {};
    const settings = isRecord(data.settings) ? (data.settings as Partial<AppState['settings']>) : {};
    const companion = isRecord(settings.companion) ? settings.companion : {};
    const tasks = records<Partial<Task>>(data.tasks);
    const migratedTasks: AppState['tasks'] = {};
    for (const [id, t] of Object.entries(tasks)) migratedTasks[id] = { priority: 'normal', ...t } as Task;
    return {
      ...base,
      ...(data as Partial<AppState>),
      schemaVersion: 4,
      tasks: migratedTasks,
      clients: records(data.clients),
      sessions: records(data.sessions),
      snapshots: records(data.snapshots),
      checkIns: records(data.checkIns),
      events: Array.isArray(data.events) ? (data.events as AppState['events']).filter((e) => isRecord(e) && typeof e.sessionId === 'string') : [],
      taskOrder: Array.isArray(data.taskOrder) ? (data.taskOrder as unknown[]).filter((id): id is string => typeof id === 'string') : [],
      coach: { ...base.coach, ...(coach as Partial<AppState['coach']>) },
      settings: {
        ...DEFAULT_SETTINGS,
        // Existing v1 users with a name don't need the first-run setup again.
        onboarded: data.schemaVersion === 1 ? Boolean(settings.userName) : false,
        ...settings,
        userContext: normalizeUserContext(settings.userContext),
        telemetryEnabled: settings.telemetryEnabled === true,
        // Shown once to everyone, including people updating from before the hub.
        companionIntroSeen: settings.companionIntroSeen === true,
        companion: {
          ...DEFAULT_COMPANION,
          ...(companion as Partial<AppState['settings']['companion']>),
          // 1.12: new companion line-up; old ids map to their closest successor.
          avatar: normalizeAvatar((companion as { avatar?: unknown }).avatar ?? DEFAULT_COMPANION.avatar),
        },
        appearance: migrateAppearance(settings.appearance),
        ...migrateMedia(settings),
      },
      wellbeing: (() => {
        const w = { ...DEFAULT_WELLBEING, ...(isRecord(data.wellbeing) ? (data.wellbeing as Partial<AppState['wellbeing']>) : {}) };
        // Keep the counter of the last recorded day in the log (v2 had no history).
        if (w.waterDay && !(w.waterDay in w.waterLog)) w.waterLog = { ...w.waterLog, [w.waterDay]: w.waterCount };
        // v3 knew only today's energy; seed the curve with it.
        if (w.energyDay && w.energyLevel !== null && !(w.energyDay in w.energyLog)) w.energyLog = { ...w.energyLog, [w.energyDay]: w.energyLevel };
        return w;
      })(),
      weather: isRecord(data.weather) ? (data.weather as unknown as AppState['weather']) : null,
      thoughts: Array.isArray(data.thoughts) ? (data.thoughts as AppState['thoughts']).filter((t) => isRecord(t) && typeof t.text === 'string') : [],
      archive: Array.isArray(data.archive)
        ? (data.archive as AppState['archive']).filter((a) => isRecord(a) && typeof a.day === 'string' && Number.isFinite(a.netMs))
        : [],
      // Checked field by field: a broken progression never costs the rest of the data.
      progression: sanitizeProgression(data.progression),
    };
  } catch {
    return null;
  }
}

export function createStore(options: { storage: KeyValueStore; key: string; initial: AppState; persistDelayMs?: number }): Store {
  let state = options.initial;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let persistenceEnabled = true;

  const persist = () => {
    timer = null;
    if (persistenceEnabled) options.storage.set(options.key, JSON.stringify(state));
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(persist, options.persistDelayMs ?? 250);
  };

  const store: Store = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(actions) {
      const list = Array.isArray(actions) ? actions : [actions as Action];
      if (list.length === 0) return;
      const next = reduceAll(state, list);
      if (next === state) return;
      state = next;
      schedule();
      listeners.forEach((l) => l());
    },
    run(result) {
      if (result.ok) store.dispatch(result.actions);
      return result;
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        persist();
      }
    },
    disablePersistence() {
      persistenceEnabled = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
  return store;
}
