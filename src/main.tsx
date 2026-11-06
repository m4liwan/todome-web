import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ServicesContext, type AppMode, type Services } from './app/services';
import { createClock, systemClock, type Clock, type ClockState } from './lib/clock';
import { CompanionWindow } from './components/CompanionHost';
import { OverlayWindow } from './components/OverlayWindow';
import { desktop, isCompanionView, isOverlayView } from './lib/desktop';
import { browserStore, newId } from './lib/storage';
import { toastStore } from './lib/toasts';
import { atTimeOfDay } from './lib/time';
import { freeState } from './app/pro';
import { emptyState } from './state/defaults';
import { buildDemoState } from './state/seed';
import { createStore, parseState } from './state/store';
import './styles/index.css';
import { installInputModality } from './lib/a11y';
import { compactSessions } from './domain/archive';
import './lib/posthog';
import { logApplicationBootstrapped, logApplicationDataReset, logApplicationFramePainted } from './services/posthog-logs';
import { connectTelemetry, stopTelemetry, trackEvent } from './services/telemetry';
import '@fontsource-variable/manrope/index.css';
import '@fontsource-variable/urbanist/index.css';

const LEGACY_MODE_KEY = 'todome:mode';
const stateKey = (mode: AppMode) => `todome:${mode}:state:v1`;
const CLOCK_KEY = 'todome:demo:clock:v1';
const DEMO_SPEED = 30;

/**
 * The desktop app always runs with real data. The demo with sample data
 * exists only for development and the web preview build (`?mode=demo`).
 */
function resolveMode(): AppMode {
  // A demo choice saved by older versions must never trap anyone in sample data.
  browserStore.remove(LEGACY_MODE_KEY);
  if (desktop) return 'live';
  if (new URLSearchParams(window.location.search).get('mode') === 'demo') return 'demo';
  return import.meta.env.MODE === 'demo' ? 'demo' : 'live';
}

function freshDemoClock(): Clock {
  // The demo day starts at 08:25 so the journey from the concept can be replayed.
  const real = Date.now();
  return createClock({ anchorReal: real, anchorVirtual: atTimeOfDay(real, '08:25'), speed: DEMO_SPEED });
}

function loadDemoClock(): Clock {
  try {
    const raw = browserStore.get(CLOCK_KEY);
    const parsed = raw ? (JSON.parse(raw) as ClockState) : null;
    if (parsed && Number.isFinite(parsed.anchorVirtual) && Number.isFinite(parsed.speed)) {
      // Resume where the demo was paused (time does not run while the tab is closed).
      return createClock({ anchorReal: Date.now(), anchorVirtual: parsed.anchorVirtual, speed: parsed.speed });
    }
  } catch {
    /* ignore and start fresh */
  }
  return freshDemoClock();
}

/** Fresh live state. In the desktop app notifications and idle detection work out of the box. */
function firstRunState() {
  const state = emptyState();
  if (desktop) state.settings = { ...state.settings, systemNotifications: true, idleDetection: true };
  return state;
}

function bootstrap(): Services {
  const mode = resolveMode();
  const clock = mode === 'demo' ? loadDemoClock() : systemClock;
  const key = stateKey(mode);
  const parsed = parseState(browserStore.get(key));
  // Pro choices from earlier versions fall back to their free neighbours.
  const persisted = parsed ? freeState(parsed) : null;
  const loaded = persisted ?? (mode === 'demo' ? buildDemoState(clock.now(), newId) : firstRunState());
  // Sessions older than 12 months become day summaries: storage stays lean.
  const compacted = mode === 'live' ? compactSessions(loaded, clock.now()) : { state: loaded, condensed: 0 };
  const initial = compacted.state;
  const store = createStore({ storage: browserStore, key, initial });
  if (compacted.state !== loaded) browserStore.set(key, JSON.stringify(initial));
  // The app may run in the tray for weeks: look again a few times a day.
  if (mode === 'live') {
    window.setInterval(() => {
      const before = store.getState();
      const next = compactSessions(before, clock.now());
      if (next.state !== before) store.dispatch({ type: 'state/replace', state: next.state });
    }, 6 * 60 * 60_000);
  }

  // Paint the first frame already in the right theme and colour world.
  const root = document.documentElement;
  const { theme, appearance } = initial.settings;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-palette', appearance.palette);
  root.setAttribute('data-layout', appearance.layout);
  if (desktop) root.classList.add('is-desktop');

  installInputModality();
  // Dev server only: lets the visual regression harness set up states.
  if (import.meta.env.DEV) Object.assign(window, { __todome: { store, clock } });

  const liveRegion = document.getElementById('announcer');
  const announce = (message: string) => {
    toastStore.push(message);
    if (!liveRegion) return;
    liveRegion.textContent = '';
    window.setTimeout(() => (liveRegion.textContent = message), 30);
  };

  let resetting = false;
  const persistAll = () => {
    if (resetting) return;
    store.flush();
    if (mode === 'demo') browserStore.set(CLOCK_KEY, JSON.stringify(clock.serialize()));
  };
  window.addEventListener('pagehide', persistAll);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persistAll());
  if (mode === 'demo') window.setInterval(persistAll, 5000);
  // Desktop: the shell asks us to persist before it quits.
  desktop?.onBeforeQuit(persistAll);

  // Optional, anonymous usage data: only after the opt-in, never in the demo.
  const telemetryOn = () => mode === 'live' && store.getState().settings.telemetryEnabled === true;
  connectTelemetry(telemetryOn, () => ({ app_version: __APP_VERSION__, platform: desktop ? 'desktop' : 'web', context: store.getState().settings.userContext }));
  logApplicationBootstrapped(mode, desktop ? 'desktop' : 'web');
  trackEvent('app_opened');
  let telemetryWas = telemetryOn();
  store.subscribe(() => {
    const on = telemetryOn();
    if (on === telemetryWas) return;
    telemetryWas = on;
    if (on) trackEvent('telemetry_enabled');
    else stopTelemetry();
  });

  return {
    store,
    clock,
    mode,
    deps: () => ({ now: clock.now(), newId }),
    run(result) {
      if (result.ok) {
        store.dispatch(result.actions);
        return true;
      }
      announce(result.error);
      return false;
    },
    announce,
    resetData() {
      logApplicationDataReset();
      resetting = true;
      store.disablePersistence();
      browserStore.remove(key);
      if (mode === 'demo') browserStore.remove(CLOCK_KEY);
      window.location.replace(window.location.pathname);
    },
  };
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing');

if (isCompanionView) {
  // Transparent desktop companion window: renders messages only, no app state.
  createRoot(rootEl).render(
    <StrictMode>
      <CompanionWindow />
    </StrictMode>,
  );
} else if (isOverlayView) {
  // Draggable mini overlay: renders the status the app pushes, nothing else.
  createRoot(rootEl).render(
    <StrictMode>
      <OverlayWindow />
    </StrictMode>,
  );
} else {
  const announcer = document.createElement('div');
  announcer.id = 'announcer';
  announcer.className = 'sr-only';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  document.body.appendChild(announcer);

  createRoot(rootEl).render(
    <StrictMode>
      <ServicesContext.Provider value={bootstrap()}>
        <App />
      </ServicesContext.Provider>
    </StrictMode>,
  );
  // Tell the shell the first real frame is painted (tokens applied, fonts
  // loaded, at most 600 ms waiting for them); only then the window fades in.
  const fontsReady = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 600))]);
  void fontsReady.then(() =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        desktop?.appReady();
        logApplicationFramePainted(desktop ? 'desktop' : 'web');
        reportPageColor();
      }),
    ),
  );
}

/** Reports the painted page colour (theme + palette) to the shell, now and on every theme change. */
function reportPageColor() {
  if (!desktop) return;
  const send = () => {
    const root = document.documentElement;
    const explicit = root.dataset.theme;
    const mode = explicit === 'dark' || (!explicit && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    desktop?.reportWindowBg(mode, getComputedStyle(root).backgroundColor);
  };
  send();
  let timer = 0;
  new MutationObserver(() => {
    window.clearTimeout(timer);
    // After the theme fade has settled.
    timer = window.setTimeout(send, 1200);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => window.setTimeout(send, 1200));
}
