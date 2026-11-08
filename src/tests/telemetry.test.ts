import { connectTelemetry, initTelemetry, POSTHOG_HOST, POSTHOG_KEY, resetTelemetryForTests, stopTelemetry, TELEMETRY_LABEL, trackEvent } from '../services/telemetry';
import { emptyState } from '../state/defaults';
import { parseState } from '../state/store';
import type { PostHog } from 'posthog-js/dist/module.full.no-external';

function fakePostHog() {
  const calls = { init: [] as unknown[][], capture: [] as unknown[][], optOut: 0, optIn: 0, reset: 0 };
  const ph = {
    init: (...a: unknown[]) => void calls.init.push(a),
    capture: (...a: unknown[]) => void calls.capture.push(a),
    opt_out_capturing: () => void calls.optOut++,
    opt_in_capturing: () => void calls.optIn++,
    reset: () => void calls.reset++,
  };
  return { ph: ph as unknown as PostHog, calls };
}

describe('telemetry (opt-in only)', () => {
  afterEach(resetTelemetryForTests);

  it('is off by default and stays off for unclear stored values', () => {
    expect(emptyState().settings.telemetryEnabled).toBe(false);
    const s = emptyState();
    expect(parseState(JSON.stringify({ ...s, settings: { ...s.settings, telemetryEnabled: 'yes' } }))!.settings.telemetryEnabled).toBe(false);
    expect(parseState(JSON.stringify({ ...s, settings: { ...s.settings, telemetryEnabled: true } }))!.settings.telemetryEnabled).toBe(true);
    expect(TELEMETRY_LABEL).toBe('Anonyme Nutzungsdaten teilen, um ToDoMe zu verbessern (optional)');
  });

  it('without the tick: PostHog is never loaded, initialised or sent anything', async () => {
    const { ph, calls } = fakePostHog();
    const loader = vi.fn(async () => ph);
    connectTelemetry(() => false, () => ({}), loader);
    expect(await initTelemetry()).toBeNull();
    trackEvent('app_opened');
    await Promise.resolve();
    expect(loader).not.toHaveBeenCalled();
    expect(calls.init).toHaveLength(0);
    expect(calls.capture).toHaveLength(0);
  });

  it('with the tick: starts with the required privacy options and sends the event', async () => {
    const { ph, calls } = fakePostHog();
    connectTelemetry(() => true, () => ({ app_version: '1.14.0', context: 'study' }), async () => ph);
    trackEvent('app_opened', { platform: 'desktop' });
    await initTelemetry();
    expect(calls.init).toHaveLength(1);
    const [key, options] = calls.init[0] as [string, Record<string, unknown>];
    // Without a configured key (CI has no .env) the app never loads PostHog; the fake does, with ''.
    expect(key).toBe(POSTHOG_KEY ?? '');
    expect(options.api_host).toBe(POSTHOG_HOST);
    expect(POSTHOG_HOST).toBe('https://eu.i.posthog.com');
    expect(options).toMatchObject({ disable_session_recording: true, ip: false, persistence: 'localStorage', autocapture: false, capture_pageview: false, disable_external_dependency_loading: true });
    expect(calls.capture).toEqual([['app_opened', { app_version: '1.14.0', context: 'study', platform: 'desktop' }]]);
    const scrub = options.before_send as (e: { properties: Record<string, unknown> }) => { properties: Record<string, unknown> };
    expect(scrub({ properties: { $ip: '1.2.3.4', $current_url: 'app://todome/', ok: 1 } }).properties).toEqual({ ok: 1 });
  });

  it('opting out stops sending at once and forgets the device id', async () => {
    const { ph, calls } = fakePostHog();
    let on = true;
    connectTelemetry(() => on, () => ({}), async () => ph);
    await initTelemetry();
    on = false;
    stopTelemetry();
    trackEvent('focus_started');
    expect(calls.optOut).toBe(1);
    expect(calls.reset).toBe(1);
    expect(calls.capture).toHaveLength(0);
  });
});
