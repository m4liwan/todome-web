import type { PostHog } from 'posthog-js/dist/module.full.no-external';
import { posthog } from '../lib/posthog';

/**
 * Optional, anonymous usage events. Custom events are sent only after the
 * user ticks "Anonyme Nutzungsdaten teilen" (`settings.telemetryEnabled`).
 * Their properties must never include task titles, notes, client names or times.
 */
/** The opt-in wording, the same in the onboarding and in the settings. */
export const TELEMETRY_LABEL = 'Anonyme Nutzungsdaten teilen, um ToDoMe zu verbessern (optional)';

export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
export const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

type Props = Record<string, string | number | boolean | null | undefined>;
type Loader = () => Promise<PostHog>;

/** Console output for local testing: always with `npm run dev`, in the app with localStorage `todome:telemetry-debug` = '1'. */
function log(...args: unknown[]): void {
  let on = import.meta.env.DEV;
  try {
    on = on || window.localStorage.getItem('todome:telemetry-debug') === '1';
  } catch {
    /* no storage: stay quiet */
  }
  // eslint-disable-next-line no-console -- deliberate, opt-in debug output
  if (on) console.log('[PostHog]', ...args);
}

let isEnabled: () => boolean = () => false;
let client: PostHog | null = posthog;
let common: () => Props = () => ({});

/** Where the opt-in lives (the settings) and what goes with every event. */
export function connectTelemetry(getEnabled: () => boolean, props: () => Props = () => ({}), _loader?: Loader): void {
  isEnabled = getEnabled;
  common = props;
}

/** Returns the browser-wide client after the user has opted into custom telemetry events. */
export function initTelemetry(): Promise<PostHog | null> {
  if (isEnabled() !== true || !client) {
    log('initTelemetry: unavailable (no opt-in or PostHog configuration)');
    return Promise.resolve(null);
  }
  client.opt_in_capturing();
  return Promise.resolve(client);
}

/** Sends an event, only with the user's opt-in. Never put content into `props`. */
export function trackEvent(eventName: string, props?: Props): void {
  if (isEnabled() !== true) {
    log(`trackEvent "${eventName}": skipped (no opt-in)`);
    return;
  }
  if (client) {
    log(`trackEvent "${eventName}": sent`, { ...common(), ...props });
    client.capture(eventName, { ...common(), ...props });
  } else {
    log(`trackEvent "${eventName}": skipped (PostHog is not configured)`);
  }
}

/** Opt-out: stop sending at once and forget the random device id. */
export function stopTelemetry(): void {
  log('stopTelemetry: opt-out, sending stopped and device id reset');
  if (!client) return;
  client.opt_out_capturing();
  client.reset();
}

/** For tests. */
export function resetTelemetryForTests(): void {
  client = posthog;
  isEnabled = () => false;
  common = () => ({});
}
