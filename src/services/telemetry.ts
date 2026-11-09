import type { PostHog } from 'posthog-js/dist/module.full.no-external';
import { loadPostHog, POSTHOG_HOST, POSTHOG_KEY } from '../lib/posthog';

/**
 * Optional, anonymous usage events. PostHog is loaded, initialised and sent
 * anything only after the user ticks "Anonyme Nutzungsdaten teilen"
 * (`settings.telemetryEnabled`). Without the tick nothing leaves the device.
 * Event properties must never include task titles, notes, client names or times.
 */
/** The opt-in wording, the same in the onboarding and in the settings. */
export const TELEMETRY_LABEL = 'Anonyme Nutzungsdaten teilen, um ToDoMe zu verbessern (optional)';

export { POSTHOG_HOST, POSTHOG_KEY };

type Props = Record<string, string | number | boolean | null | undefined>;
type Loader = () => Promise<PostHog | null>;

/** Properties PostHog adds on its own that could identify a person or a place. */
const SCRUBBED = ['$ip', '$current_url', '$pathname', '$host', '$referrer', '$referring_domain', '$initial_referrer', '$initial_referring_domain'];

/** Console output for local testing: always with `npm run dev`, in the app with localStorage `todome:telemetry-debug` = '1'. */
function log(...args: unknown[]): void {
  let on = import.meta.env.DEV && import.meta.env.MODE !== 'test';
  try {
    on = on || window.localStorage.getItem('todome:telemetry-debug') === '1';
  } catch {
    /* no storage: stay quiet */
  }
  // eslint-disable-next-line no-console -- deliberate, opt-in debug output
  if (on) console.log('[PostHog]', ...args);
}

let isEnabled: () => boolean = () => false;
let common: () => Props = () => ({});
let loader: Loader = loadPostHog;
/** Loading/initialising, shared by every caller; null until the first opt-in use. */
let starting: Promise<PostHog | null> | null = null;
/** The initialised client (set once `starting` resolved). */
let client: PostHog | null = null;
let optedOut = false;

/** Where the opt-in lives (the settings), what goes with every event, and (tests) how PostHog is loaded. */
export function connectTelemetry(getEnabled: () => boolean, props: () => Props = () => ({}), load: Loader = loadPostHog): void {
  isEnabled = getEnabled;
  common = props;
  loader = load;
}

function start(): Promise<PostHog | null> {
  starting ??= loader()
    .then((ph) => {
      if (!ph) return null;
      ph.init(POSTHOG_KEY ?? '', {
        api_host: POSTHOG_HOST,
        defaults: '2026-08-30',
        // Privacy: only our own named events, no recordings, no IP, no URLs.
        disable_session_recording: true,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        ip: false,
        persistence: 'localStorage',
        disable_external_dependency_loading: true,
        capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
        logs: { serviceName: 'todome-renderer', environment: import.meta.env.MODE },
        before_send: (event) => {
          if (!event) return event;
          for (const key of SCRUBBED) delete event.properties[key];
          return event;
        },
      });
      client = ph;
      log('initTelemetry: PostHog initialised after opt-in');
      return ph;
    })
    .catch((err: unknown) => {
      log('initTelemetry: PostHog could not be loaded', err);
      starting = null;
      return null;
    });
  return starting;
}

/** Loads and initialises PostHog, only after the opt-in. Resolves to null without it. */
export async function initTelemetry(): Promise<PostHog | null> {
  if (isEnabled() !== true) {
    log('initTelemetry: skipped (no opt-in)');
    return null;
  }
  const ph = await start();
  if (ph && isEnabled() === true && (optedOut || ph.has_opted_out_capturing?.())) {
    optedOut = false;
    ph.opt_in_capturing();
  }
  return isEnabled() === true ? ph : null;
}

/** Sends an event, only with the user's opt-in. Never put content into `props`. */
export function trackEvent(eventName: string, props?: Props): void {
  if (isEnabled() !== true) {
    log(`trackEvent "${eventName}": skipped (no opt-in)`);
    return;
  }
  // Properties are taken now, at the moment of the event, not after loading.
  const properties = { ...common(), ...props };
  void initTelemetry().then((ph) => {
    if (!ph) return;
    log(`trackEvent "${eventName}": sent`, properties);
    ph.capture(eventName, properties);
  });
}

/**
 * Reports an error the app caught itself (e.g. the error boundary), only with
 * the opt-in. Uncaught errors are already reported by `capture_exceptions`.
 */
export function trackError(error: unknown, props?: Props): void {
  if (isEnabled() !== true) return;
  const properties = { ...common(), ...props };
  const err = error instanceof Error ? error : new Error(String(error));
  void initTelemetry().then((ph) => ph?.captureException(err, properties));
}

/** The initialised client after the opt-in, else null (for the PostHog logs writer). */
export function telemetryClient(): Promise<PostHog | null> {
  return initTelemetry();
}

/** Opt-out: stop sending at once and forget the random device id. */
export function stopTelemetry(): void {
  log('stopTelemetry: opt-out, sending stopped and device id reset');
  if (!client) return;
  optedOut = true;
  client.opt_out_capturing();
  client.reset();
}

/** For tests. */
export function resetTelemetryForTests(): void {
  isEnabled = () => false;
  common = () => ({});
  loader = loadPostHog;
  starting = null;
  client = null;
  optedOut = false;
}
